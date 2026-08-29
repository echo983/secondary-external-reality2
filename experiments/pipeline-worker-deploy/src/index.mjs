// Full-pipeline extension of experiments/juror-worker-deploy: instead of one role
// (judge+clerk), the ENTIRE experiments/pipeline-integration-slice/pipeline.mjs
// orchestration (GROUND -> RETRIEVE -> ADJUDICATE -> groundVerdict -> CLASSIFY ->
// COLLAPSE -> COMMIT -> NARRATE+audit) runs as a real, deployed, stateless Cloudflare
// Worker against the real sr2-truth-store AI Search instance.
//
// Every prompt/role is imported unmodified from pipeline-integration-slice/prompts.mjs
// and reachability-inference-spike/prompts.mjs. Two things differ from the local
// pipeline.mjs: model transport (env.AI.run() binding) and Height bookkeeping (derived
// each call from the max height in AI Search item keys -- a stateless Worker has no
// memory across requests, so anything that must persist lives in the truth store).
//
// Multi-world support (2026-08-29, see docs/ai-search-folder-filtering-findings-
// 2026-08-29.md): one internal person = one exclusive world. Worlds share the single
// sr2-truth-store instance -- NOT one instance per person, that was the original plan
// but turned out unnecessary once folder-based metadata filtering was confirmed
// working (ai_search_options.retrieval.filters, filtering happens before ranking, not
// a post-hoc result filter). Every item's key is prefixed `worlds/<worldId>/...`, and
// every retrieve/list/delete call for a given world passes `filters: {folder:
// "worlds/<worldId>/"}` (or filters the listed items client-side by key prefix, for
// the plain /items endpoint which does not take the same filter parameter). Adding a
// new world costs nothing operationally -- it is just a new worldId string, no
// instance provisioning.

import {
  GROUND_SYSTEM_PROMPT, GROUND_JSON_SCHEMA, buildGroundUserPrompt,
  ADJUDICATE_SYSTEM_PROMPT, buildAdjudicateUserPrompt,
  OUTCOME_CLASSIFIER_SYSTEM_PROMPT, OUTCOME_CLASSIFIER_JSON_SCHEMA,
  CONTINUITY_RESOLVER_SYSTEM_PROMPT, buildContinuityResolverUserPrompt,
  JUROR_SYSTEM_PROMPT, buildJurorUserPrompt,
  CLERK_SYSTEM_PROMPT, CLERK_JSON_SCHEMA, buildClerkUserPrompt,
  NARRATE_SYSTEM_PROMPT, buildNarrateUserPrompt,
  CLAIM_EXTRACTOR_SYSTEM_PROMPT, CLAIM_EXTRACTOR_JSON_SCHEMA, buildClaimExtractorUserPrompt,
  REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, REACHABILITY_CLASSIFIER_JSON_SCHEMA,
  FACT_WRITER_SYSTEM_PROMPT, buildFactWriterUserPrompt
} from "../../pipeline-integration-slice/prompts.mjs";
import {entityRegistry, genesisPropositions} from "../../pipeline-integration-slice/world.mjs";
import {REACHABILITY_SYSTEM_PROMPT, buildUserPrompt as buildReachabilityUserPrompt}
  from "../../reachability-inference-spike/prompts.mjs";
import {renderPage} from "./page.mjs";

const MODEL = "@cf/qwen/qwen3.8-27b";
// Matches "-h<n>-" in the flat key format `worlds/<id>/<entity>-h<n>-<source>-...txt`
// (dash-delimited, since folder filtering requires a flat one-level-per-world key --
// see append()/seedWorld() below). None of entityRegistry's names contain "-h<digit>-".
const HEIGHT_TAG = /-h(\d+)-/;
const WORLD_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(fn, {attempts = 4, label = "call"} = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await delay(1_000 * (2 ** attempt));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError}`);
}

// ---- model transport (Workers AI binding) ----

function extractText(body) {
  if (typeof body?.response === "string") return body.response;
  if (typeof body?.result?.response === "string") return body.result.response;
  if (typeof body?.choices?.[0]?.message?.content === "string") return body.choices[0].message.content;
  if (typeof body === "string") return body;
  const choice = body?.choices?.[0];
  throw new Error(`Workers AI binding response had no text (finish_reason=${choice?.finish_reason ?? "unknown"}): ${JSON.stringify(body)}`);
}

async function callModel(env, {system, user, jsonSchema, maxTokens = 1800}) {
  const body = await withRetry(() => env.AI.run(MODEL, {
    messages: [{role: "system", content: system}, {role: "user", content: user}],
    // reasoning_effort: "low" is the real, documented lever for this model (values:
    // low/medium/xhigh-default). `reasoning: {enable_thinking: false}` is not a real
    // parameter -- removed, see docs/reasoning-token-diagnosis-findings-2026-08-29.md.
    temperature: 0, reasoning_effort: "low", max_completion_tokens: maxTokens,
    ...(jsonSchema === undefined ? {} : {response_format: {type: "json_schema", json_schema: jsonSchema}})
  }), {label: "AI.run"});
  return extractText(body).trim();
}

// ---- AI Search REST (truth store), scoped per world via key prefix + folder filter ----

function aiSearchBase(env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/ai-search/instances/${env.AI_SEARCH_INSTANCE}`;
}

function worldFolder(worldId) {
  return `worlds/${worldId}/`;
}

// GET /items has no folder-filter parameter (that's a /search-only feature) -- lists
// everything in the instance and paginates, caller filters by key prefix for the
// world it cares about. Small internal-use corpus, so full pagination is cheap.
async function aiSearchListAllItems(env) {
  const all = [];
  let page = 1;
  for (;;) {
    const items = await withRetry(async () => {
      const res = await fetch(`${aiSearchBase(env)}/items?per_page=50&page=${page}`, {headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`}});
      const body = await res.json();
      if (!body.success) throw new Error(`list items (page ${page}) failed: ${JSON.stringify(body.errors)}`);
      return body.result;
    }, {label: `list items page ${page}`});
    all.push(...items);
    if (items.length < 50) break;
    page += 1;
  }
  return all;
}

async function aiSearchListWorldItems(env, worldId) {
  const all = await aiSearchListAllItems(env);
  const prefix = worldFolder(worldId);
  return all.filter(i => i.key?.startsWith(prefix));
}

async function aiSearchDeleteWorldItems(env, worldId) {
  const items = await aiSearchListWorldItems(env, worldId);
  for (const item of items) {
    await withRetry(async () => {
      const res = await fetch(`${aiSearchBase(env)}/items/${item.id}`, {method: "DELETE", headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`}});
      const body = await res.json();
      if (!body.success) throw new Error(`delete ${item.key} failed: ${JSON.stringify(body.errors)}`);
    }, {label: `delete ${item.key}`});
  }
  return items.length;
}

async function aiSearchUploadItem(env, key, text) {
  return withRetry(async () => {
    const form = new FormData();
    form.append("file", new Blob([text], {type: "text/plain"}), key);
    const res = await fetch(`${aiSearchBase(env)}/items`, {method: "POST", headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`}, body: form});
    const body = await res.json();
    if (!body.success) throw new Error(`upload ${key} failed: ${JSON.stringify(body.errors)}`);
    return body.result;
  }, {label: `upload ${key}`});
}

// Folder-scoped search: filters happen before ranking (confirmed empirically, see
// docs/ai-search-folder-filtering-findings-2026-08-29.md), so another world's content
// never dilutes or crowds out this world's results.
async function aiSearchSearch(env, worldId, query) {
  return withRetry(async () => {
    const res = await fetch(`${aiSearchBase(env)}/search`, {
      method: "POST",
      headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json"},
      body: JSON.stringify({query, ai_search_options: {retrieval: {filters: {folder: worldFolder(worldId)}}}})
    });
    const body = await res.json();
    if (!body.success) throw new Error(`search "${query}" failed: ${JSON.stringify(body.errors)}`);
    return body.result.chunks;
  }, {label: `search "${query}"`});
}

function parseHeightFromKey(key) {
  const match = HEIGHT_TAG.exec(key ?? "");
  return match ? Number(match[1]) : null;
}

async function nextHeight(env, worldId) {
  const items = await aiSearchListWorldItems(env, worldId);
  let max = -1;
  for (const item of items) {
    const h = parseHeightFromKey(item.key);
    if (h !== null && h > max) max = h;
  }
  return max + 1;
}

async function retrieve(env, worldId, entityNames, queryText) {
  const query = queryText && queryText.trim() !== "" ? queryText : `关于 ${entityNames.join("、")} 的已知信息`;
  const chunks = await aiSearchSearch(env, worldId, query);
  return chunks.map(c => ({text: c.text, height: parseHeightFromKey(c.item?.key), score: c.score, key: c.item?.key}))
    .filter(p => p.height !== null)
    .sort((a, b) => a.height - b.height);
}

async function append(env, worldId, text, entities, atHeight, source) {
  const primaryEntity = entities[0] ?? "misc";
  // Flat: one directory level per world (worlds/<worldId>/) with entity/height/source
  // folded into the filename, not a subdirectory. Required for the folder filter to
  // work at all -- confirmed empirically that AI Search's folder metadata matches the
  // *exact* immediate directory of the key, not a prefix over ancestor directories, so
  // worlds/<id>/props/<entity>/... would never match a filter on worlds/<id>/ alone.
  // See docs/ai-search-folder-filtering-findings-2026-08-29.md.
  const key = `${worldFolder(worldId)}${primaryEntity}-h${atHeight}-${source}-${Date.now()}.txt`;
  await aiSearchUploadItem(env, key, text);
  return {text, entities, height: atHeight, status: "active", source, key};
}

// ---- roles (unchanged logic from pipeline-integration-slice/pipeline.mjs, transport swapped) ----

async function ground(env, attempt) {
  const raw = await callModel(env, {system: GROUND_SYSTEM_PROMPT, user: buildGroundUserPrompt(attempt, entityRegistry), jsonSchema: GROUND_JSON_SCHEMA, maxTokens: 1800});
  return JSON.parse(raw);
}

async function adjudicate(env, propositions, attempt) {
  return callModel(env, {system: ADJUDICATE_SYSTEM_PROMPT, user: buildAdjudicateUserPrompt(propositions, attempt), maxTokens: 1800});
}

async function writeFact(env, attempt, verdictText) {
  return callModel(env, {system: FACT_WRITER_SYSTEM_PROMPT, user: buildFactWriterUserPrompt(attempt, verdictText), maxTokens: 1200});
}

async function classifyOutcome(env, verdictText) {
  const raw = await callModel(env, {system: OUTCOME_CLASSIFIER_SYSTEM_PROMPT, user: verdictText, jsonSchema: OUTCOME_CLASSIFIER_JSON_SCHEMA, maxTokens: 1500});
  return JSON.parse(raw);
}

async function proposeCollapse(env, propositions, attempt, missingAbout) {
  return callModel(env, {system: CONTINUITY_RESOLVER_SYSTEM_PROMPT, user: buildContinuityResolverUserPrompt(propositions, attempt, missingAbout), maxTokens: 1800});
}

async function runJurorsAndClerk(env, propositions, proposedFact) {
  const verdicts = await Promise.all([1, 2, 3].map(() =>
    callModel(env, {system: JUROR_SYSTEM_PROMPT, user: buildJurorUserPrompt(propositions, proposedFact), maxTokens: 1800})));
  const clerkRaw = await callModel(env, {system: CLERK_SYSTEM_PROMPT, user: buildClerkUserPrompt(propositions, proposedFact, verdicts), jsonSchema: CLERK_JSON_SCHEMA, maxTokens: 1800});
  return {verdicts, clerk: JSON.parse(clerkRaw)};
}

async function resolveClaimViaCollapse(env, worldId, groundResult, propositions, attempt, missingDescription) {
  const proposedFact = await proposeCollapse(env, propositions, attempt, missingDescription);
  const {verdicts, clerk} = await runJurorsAndClerk(env, propositions, proposedFact);
  if (clerk.finalDecision !== "放行") return {committed: false, proposedFact, verdicts, clerk};
  const height = await nextHeight(env, worldId);
  const committedRecord = await append(env, worldId, proposedFact, groundResult.entities, height, "collapse");
  return {committed: true, proposedFact, verdicts, clerk, height, committedRecord};
}

async function narrate(env, propositions, attempt, outcomeSummary, avoidClaims) {
  return callModel(env, {system: NARRATE_SYSTEM_PROMPT, user: buildNarrateUserPrompt(propositions, attempt, outcomeSummary, avoidClaims), maxTokens: 2200});
}

async function extractClaims(env, propositions, narrationText) {
  const raw = await callModel(env, {system: CLAIM_EXTRACTOR_SYSTEM_PROMPT, user: buildClaimExtractorUserPrompt(propositions, narrationText), jsonSchema: CLAIM_EXTRACTOR_JSON_SCHEMA, maxTokens: 1800});
  return JSON.parse(raw).claims;
}

async function checkReachable(env, propositions, claim) {
  const verdictText = await callModel(env, {system: REACHABILITY_SYSTEM_PROMPT, user: buildReachabilityUserPrompt(propositions.map(p => p.text), claim), maxTokens: 1800});
  const classifiedRaw = await callModel(env, {system: REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, user: verdictText, jsonSchema: REACHABILITY_CLASSIFIER_JSON_SCHEMA, maxTokens: 1200});
  return {claim, verdictText, reachable: JSON.parse(classifiedRaw).reachable};
}

async function narrateWithAudit(env, worldId, groundResult, propositions, attempt, outcomeSummary) {
  const draft = await narrate(env, propositions, attempt, outcomeSummary);
  const claims = await extractClaims(env, propositions, draft);
  if (claims.length === 0) return {text: draft, draft, claims: [], checks: [], collapses: [], regenerated: false};

  const checks = await Promise.all(claims.map(claim => checkReachable(env, propositions, claim)));
  const unreachableChecks = checks.filter(c => !c.reachable);
  if (unreachableChecks.length === 0) return {text: draft, draft, claims, checks, collapses: [], regenerated: false};

  let workingPropositions = propositions;
  const stillAvoid = [];
  const collapses = [];
  for (const check of unreachableChecks) {
    const outcome = await resolveClaimViaCollapse(env, worldId, groundResult, workingPropositions, attempt, check.claim);
    if (outcome.committed) {
      workingPropositions = [...workingPropositions, outcome.committedRecord];
      collapses.push({claim: check.claim, ...outcome});
    } else {
      stillAvoid.push(check.claim);
      collapses.push({claim: check.claim, ...outcome});
    }
  }

  const revised = await narrate(env, workingPropositions, attempt, outcomeSummary, stillAvoid);
  return {text: revised, draft, claims, checks, collapses, regenerated: true, finalPropositions: workingPropositions};
}

async function groundVerdict(env, worldId, groundResult, propositions, attempt, verdictText) {
  const claims = await extractClaims(env, propositions, verdictText);
  if (claims.length === 0) return {propositions, allResolved: true, anyCommitted: false, unresolvedClaims: [], claims: [], collapses: []};

  const checks = await Promise.all(claims.map(claim => checkReachable(env, propositions, claim)));
  const unreachableChecks = checks.filter(c => !c.reachable);
  if (unreachableChecks.length === 0) return {propositions, allResolved: true, anyCommitted: false, unresolvedClaims: [], claims, collapses: []};

  let workingPropositions = propositions;
  const unresolvedClaims = [];
  const collapses = [];
  let anyCommitted = false;
  for (const check of unreachableChecks) {
    const outcome = await resolveClaimViaCollapse(env, worldId, groundResult, workingPropositions, attempt, check.claim);
    if (outcome.committed) {
      workingPropositions = [...workingPropositions, outcome.committedRecord];
      anyCommitted = true;
    } else {
      unresolvedClaims.push(check.claim);
    }
    collapses.push({claim: check.claim, ...outcome});
  }

  return {propositions: workingPropositions, allResolved: unresolvedClaims.length === 0, anyCommitted, unresolvedClaims, claims, collapses};
}

// ---- orchestration, structurally identical to pipeline-integration-slice/pipeline.mjs's processAttempt ----

async function processAttempt(env, worldId, attempt) {
  const log = {attempt, stages: []};

  const groundResult = await ground(env, attempt);
  log.stages.push({stage: "GROUND", output: groundResult});
  if (groundResult.unbound.length > 0) {
    const height = await nextHeight(env, worldId);
    const text = `边界：提到的"${groundResult.unbound.join("、")}"在这个世界里没有对应物，不存在。`;
    log.stages.push({stage: "BOUNDARY", height, text});
    return {...log, height, kind: "boundary", narration: text};
  }

  let propositions = await retrieve(env, worldId, groundResult.entities, attempt);
  log.stages.push({stage: "RETRIEVE", output: propositions.map(p => p.text)});

  let verdictText = await adjudicate(env, propositions, attempt);
  log.stages.push({stage: "ADJUDICATE", output: verdictText});

  const grounding = await groundVerdict(env, worldId, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "ADJUDICATE_GROUNDING", output: {
    claims: grounding.claims, unresolvedClaims: grounding.unresolvedClaims,
    collapses: grounding.collapses.map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, clerkDecision: c.clerk.finalDecision}))
  }});
  if (!grounding.allResolved) {
    const height = await nextHeight(env, worldId);
    const text = `边界：这次裁决依赖无法确定的事实（${grounding.unresolvedClaims.join("；")}），陪审团没有放行相应的补全。`;
    log.stages.push({stage: "BOUNDARY", height, text});
    return {...log, height, kind: "boundary", narration: text};
  }
  if (grounding.anyCommitted) {
    propositions = grounding.propositions;
    verdictText = await adjudicate(env, propositions, attempt);
    log.stages.push({stage: "ADJUDICATE_AFTER_GROUNDING", output: verdictText});
  }

  let classification = await classifyOutcome(env, verdictText);
  log.stages.push({stage: "CLASSIFY", output: classification});

  if (classification.outcome === "insufficient") {
    const outcome = await resolveClaimViaCollapse(env, worldId, groundResult, propositions, attempt, classification.missingAbout);
    log.stages.push({stage: "COLLAPSE", output: {proposedFact: outcome.proposedFact, verdicts: outcome.verdicts, clerk: outcome.clerk}});

    if (outcome.committed) {
      propositions = await retrieve(env, worldId, groundResult.entities, attempt);
      log.stages.push({stage: "RETRIEVE_AFTER_COLLAPSE", output: propositions.map(p => p.text)});

      verdictText = await adjudicate(env, propositions, attempt);
      log.stages.push({stage: "ADJUDICATE_AFTER_COLLAPSE", output: verdictText});
      classification = await classifyOutcome(env, verdictText);
      log.stages.push({stage: "CLASSIFY_AFTER_COLLAPSE", output: classification});
    } else {
      const height = await nextHeight(env, worldId);
      const text = `边界：这件事依赖一个无法确定的事实（${classification.missingAbout || "未指明"}），陪审团没有放行编剧提出的补全。`;
      log.stages.push({stage: "BOUNDARY", height, text});
      return {...log, height, kind: "boundary", narration: text};
    }
  }

  const height = await nextHeight(env, worldId);
  let committedFactText;
  if (classification.outcome === "plausible") {
    const cleanFact = await writeFact(env, attempt, verdictText);
    committedFactText = cleanFact !== "" ? cleanFact : `结果：${attempt} —— ${verdictText}`;
    await append(env, worldId, committedFactText, groundResult.entities, height, "attempt-outcome");
  }
  log.stages.push({stage: "COMMIT", height, outcome: classification.outcome, committedFactText});

  const audited = await narrateWithAudit(env, worldId, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "NARRATE_AUDIT", output: {
    draft: audited.draft, extractedClaims: audited.claims,
    checks: audited.checks.map(c => ({claim: c.claim, reachable: c.reachable, verdictText: c.verdictText})),
    collapses: (audited.collapses ?? []).map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, height: c.height, clerkDecision: c.clerk.finalDecision})),
    regenerated: audited.regenerated, final: audited.text
  }});

  return {...log, height, kind: classification.outcome, narration: audited.text};
}

async function seedWorld(env, worldId) {
  const deleted = await aiSearchDeleteWorldItems(env, worldId);
  for (const p of genesisPropositions) {
    // Same flat key structure as append() -- see the comment there.
    const key = `${worldFolder(worldId)}${p.entities[0] ?? "misc"}-h${p.height}-genesis-${Math.random().toString(36).slice(2, 8)}.txt`;
    await aiSearchUploadItem(env, key, p.text);
  }
  return {deletedPreviousItems: deleted, seededCount: genesisPropositions.length};
}

// ---- HTTP surface ----

function jsonError(message, status = 400) {
  return Response.json({error: message}, {status});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/w\/([^/]+)(\/.*)?$/.exec(url.pathname);

    if (!match) {
      return new Response(
        "sr2-pipeline-worker\nGET  /w/<worldId>            网页入口\nPOST /w/<worldId>/seed        清空并重新播种这个世界\nPOST /w/<worldId>/attempt     {attempt: string}\nGET  /w/<worldId>/state       当前世界是否已初始化\n",
        {status: 200, headers: {"content-type": "text/plain; charset=utf-8"}}
      );
    }

    const worldId = match[1];
    const sub = match[2] ?? "";
    if (!WORLD_ID_PATTERN.test(worldId)) return jsonError("worldId must match [a-z0-9-]{1,40}");

    if (sub === "" && request.method === "GET") {
      return new Response(renderPage(worldId), {status: 200, headers: {"content-type": "text/html; charset=utf-8"}});
    }

    if (sub === "/state" && request.method === "GET") {
      try {
        const items = await aiSearchListWorldItems(env, worldId);
        // itemCount alone isn't enough to know the world is actually usable -- an item
        // appears in the list immediately on upload but isn't searchable until AI
        // Search finishes indexing it (status "completed"), which took anywhere from
        // ~1s to 2+ minutes in real testing. A caller that only checks itemCount can
        // send an /attempt against a world whose genesis facts aren't retrievable yet
        // (confirmed: this happened once during testing -- RETRIEVE came back empty
        // even though itemCount already matched the seeded count).
        const pendingCount = items.filter(i => i.status !== "completed" && i.status !== "error").length;
        return Response.json({worldId, itemCount: items.length, pendingCount, initialized: items.length > 0 && pendingCount === 0});
      } catch (error) {
        return jsonError(String(error), 502);
      }
    }

    if (sub === "/seed" && request.method === "POST") {
      try {
        return Response.json(await seedWorld(env, worldId));
      } catch (error) {
        return jsonError(String(error), 502);
      }
    }

    if (sub === "/attempt" && request.method === "POST") {
      let payload;
      try { payload = await request.json(); } catch { return jsonError("invalid JSON body"); }
      if (typeof payload.attempt !== "string" || payload.attempt.trim() === "") return jsonError("expected {attempt: string}");
      const startedAt = Date.now();
      try {
        const result = await processAttempt(env, worldId, payload.attempt);
        return Response.json({...result, totalElapsedMs: Date.now() - startedAt, handledAt: new Date().toISOString()});
      } catch (error) {
        return Response.json({error: String(error), totalElapsedMs: Date.now() - startedAt}, {status: 502});
      }
    }

    return jsonError("not found", 404);
  }
};
