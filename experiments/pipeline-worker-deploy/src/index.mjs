// Full-pipeline extension of experiments/juror-worker-deploy: instead of one role
// (judge+clerk), the ENTIRE experiments/pipeline-integration-slice/pipeline.mjs
// orchestration (GROUND -> RETRIEVE -> ADJUDICATE -> groundVerdict -> CLASSIFY ->
// COLLAPSE -> COMMIT -> NARRATE+audit) runs as a real, deployed, stateless Cloudflare
// Worker against the real sr2-truth-store AI Search instance -- the first end-to-end
// run of this project's whole validated pipeline outside a local Node script.
//
// Every prompt/role is imported unmodified from pipeline-integration-slice/prompts.mjs
// and reachability-inference-spike/prompts.mjs (same source of truth the local script
// uses -- no drift risk). Only two things change relative to pipeline.mjs:
//   1. Model transport: env.AI.run() (Workers AI binding) instead of REST fetch.
//   2. Height bookkeeping: instead of an in-memory counter carried across a single
//      Node process's loop, nextHeight() is *derived* each call from the max height
//      already present in AI Search's item keys. This is deliberate, not an
//      afterthought -- a stateless Worker has no memory across HTTP requests, so
//      "what height are we at" has to live in the one place that actually persists:
//      the truth store itself. This is the task-level-statelessness principle from
//      docs/architecture-direction-consensus-2026-08-28.md section 12 put into
//      practice, not just asserted.

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

const MODEL = "@cf/qwen/qwen3.8-27b";
const HEIGHT_TAG = /\/h(\d+)-/;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Retry-on-transient-failure, ported back from pipeline-integration-slice/client.mjs's
// REST fetch retry loop -- dropped when this Worker was first written (see "diagnosed:
// this port dropped..." in docs/pipeline-worker-deploy-findings-2026-08-29.md, turn 1's
// bare `TypeError: fetch failed`), restored here as a single shared helper used by both
// the model call and every AI Search REST call.
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

// ---- AI Search REST (truth store), same endpoints as ai-search-retrieval-spike/client.mjs ----

function aiSearchBase(env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/ai-search/instances/${env.AI_SEARCH_INSTANCE}`;
}

async function aiSearchListItems(env) {
  return withRetry(async () => {
    const res = await fetch(`${aiSearchBase(env)}/items?per_page=50`, {headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`}});
    const body = await res.json();
    if (!body.success) throw new Error(`list items failed: ${JSON.stringify(body.errors)}`);
    return body.result;
  }, {label: "list items"});
}

async function aiSearchDeleteAllItems(env) {
  const items = await aiSearchListItems(env);
  for (const item of items) {
    await fetch(`${aiSearchBase(env)}/items/${item.id}`, {method: "DELETE", headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`}});
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

async function aiSearchSearch(env, query) {
  return withRetry(async () => {
    const res = await fetch(`${aiSearchBase(env)}/search`, {
      method: "POST",
      headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json"},
      body: JSON.stringify({query})
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

async function nextHeight(env) {
  const items = await aiSearchListItems(env);
  let max = -1;
  for (const item of items) {
    const h = parseHeightFromKey(item.key);
    if (h !== null && h > max) max = h;
  }
  return max + 1;
}

async function retrieve(env, entityNames, queryText) {
  const query = queryText && queryText.trim() !== "" ? queryText : `关于 ${entityNames.join("、")} 的已知信息`;
  const chunks = await aiSearchSearch(env, query);
  return chunks.map(c => ({text: c.text, height: parseHeightFromKey(c.item?.key), score: c.score, key: c.item?.key}))
    .filter(p => p.height !== null)
    .sort((a, b) => a.height - b.height);
}

async function append(env, text, entities, atHeight, source) {
  const primaryEntity = entities[0] ?? "misc";
  const key = `props/${primaryEntity}/h${atHeight}-${source}-${Date.now()}.txt`;
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

async function resolveClaimViaCollapse(env, groundResult, propositions, attempt, missingDescription) {
  const proposedFact = await proposeCollapse(env, propositions, attempt, missingDescription);
  const {verdicts, clerk} = await runJurorsAndClerk(env, propositions, proposedFact);
  if (clerk.finalDecision !== "放行") return {committed: false, proposedFact, verdicts, clerk};
  const height = await nextHeight(env);
  const committedRecord = await append(env, proposedFact, groundResult.entities, height, "collapse");
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

async function narrateWithAudit(env, groundResult, propositions, attempt, outcomeSummary) {
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
    const outcome = await resolveClaimViaCollapse(env, groundResult, workingPropositions, attempt, check.claim);
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

async function groundVerdict(env, groundResult, propositions, attempt, verdictText) {
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
    const outcome = await resolveClaimViaCollapse(env, groundResult, workingPropositions, attempt, check.claim);
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

async function processAttempt(env, attempt) {
  const log = {attempt, stages: []};

  const groundResult = await ground(env, attempt);
  log.stages.push({stage: "GROUND", output: groundResult});
  if (groundResult.unbound.length > 0) {
    const height = await nextHeight(env);
    const text = `边界：提到的"${groundResult.unbound.join("、")}"在这个世界里没有对应物，不存在。`;
    log.stages.push({stage: "BOUNDARY", height, text});
    return {...log, height, kind: "boundary", narration: text};
  }

  let propositions = await retrieve(env, groundResult.entities, attempt);
  log.stages.push({stage: "RETRIEVE", output: propositions.map(p => p.text)});

  let verdictText = await adjudicate(env, propositions, attempt);
  log.stages.push({stage: "ADJUDICATE", output: verdictText});

  const grounding = await groundVerdict(env, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "ADJUDICATE_GROUNDING", output: {
    claims: grounding.claims, unresolvedClaims: grounding.unresolvedClaims,
    collapses: grounding.collapses.map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, clerkDecision: c.clerk.finalDecision}))
  }});
  if (!grounding.allResolved) {
    const height = await nextHeight(env);
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
    const outcome = await resolveClaimViaCollapse(env, groundResult, propositions, attempt, classification.missingAbout);
    log.stages.push({stage: "COLLAPSE", output: {proposedFact: outcome.proposedFact, verdicts: outcome.verdicts, clerk: outcome.clerk}});

    if (outcome.committed) {
      propositions = await retrieve(env, groundResult.entities, attempt);
      log.stages.push({stage: "RETRIEVE_AFTER_COLLAPSE", output: propositions.map(p => p.text)});

      verdictText = await adjudicate(env, propositions, attempt);
      log.stages.push({stage: "ADJUDICATE_AFTER_COLLAPSE", output: verdictText});
      classification = await classifyOutcome(env, verdictText);
      log.stages.push({stage: "CLASSIFY_AFTER_COLLAPSE", output: classification});
    } else {
      const height = await nextHeight(env);
      const text = `边界：这件事依赖一个无法确定的事实（${classification.missingAbout || "未指明"}），陪审团没有放行编剧提出的补全。`;
      log.stages.push({stage: "BOUNDARY", height, text});
      return {...log, height, kind: "boundary", narration: text};
    }
  }

  const height = await nextHeight(env);
  let committedFactText;
  if (classification.outcome === "plausible") {
    const cleanFact = await writeFact(env, attempt, verdictText);
    committedFactText = cleanFact !== "" ? cleanFact : `结果：${attempt} —— ${verdictText}`;
    await append(env, committedFactText, groundResult.entities, height, "attempt-outcome");
  }
  log.stages.push({stage: "COMMIT", height, outcome: classification.outcome, committedFactText});

  const audited = await narrateWithAudit(env, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "NARRATE_AUDIT", output: {
    draft: audited.draft, extractedClaims: audited.claims,
    checks: audited.checks.map(c => ({claim: c.claim, reachable: c.reachable, verdictText: c.verdictText})),
    collapses: (audited.collapses ?? []).map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, height: c.height, clerkDecision: c.clerk.finalDecision})),
    regenerated: audited.regenerated, final: audited.text
  }});

  return {...log, height, kind: classification.outcome, narration: audited.text};
}

// ---- HTTP surface ----

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/seed" && request.method === "POST") {
      try {
        const deleted = await aiSearchDeleteAllItems(env);
        for (const p of genesisPropositions) {
          const key = `props/${p.entities[0] ?? "misc"}/h${p.height}-genesis-${Math.random().toString(36).slice(2, 8)}.txt`;
          await aiSearchUploadItem(env, key, p.text);
        }
        return Response.json({deletedPreviousItems: deleted, seededCount: genesisPropositions.length});
      } catch (error) {
        return Response.json({error: String(error), stack: error?.stack}, {status: 502});
      }
    }

    if (url.pathname === "/attempt" && request.method === "POST") {
      let payload;
      try { payload = await request.json(); } catch { return Response.json({error: "invalid JSON body"}, {status: 400}); }
      if (typeof payload.attempt !== "string" || payload.attempt.trim() === "") {
        return Response.json({error: "expected {attempt: string}"}, {status: 400});
      }
      const startedAt = Date.now();
      try {
        const result = await processAttempt(env, payload.attempt);
        return Response.json({...result, totalElapsedMs: Date.now() - startedAt, handledAt: new Date().toISOString()});
      } catch (error) {
        return Response.json({error: String(error), totalElapsedMs: Date.now() - startedAt}, {status: 502});
      }
    }

    return new Response(
      "sr2-pipeline-worker\nPOST /seed (clears and re-seeds sr2-truth-store with genesis)\nPOST /attempt {attempt: string}\n",
      {status: 200, headers: {"content-type": "text/plain; charset=utf-8"}}
    );
  }
};
