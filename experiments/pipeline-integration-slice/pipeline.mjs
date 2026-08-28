// Orchestrates GROUND -> RETRIEVE -> ADJUDICATE -> (COLLAPSE) -> COMMIT -> NARRATE,
// per docs/adjudicator-pipeline-design-v0.1-2026-08-28.md section 2. Every LLM-facing
// prompt is carried over unchanged from a validated spike except GROUND and the
// outcome classifier (new, but light bookkeeping-only, not open-world modeling) and
// the Continuity Resolver (new, but structurally protected by the already-validated
// juror+clerk gate before anything it proposes is trusted).
//
// Deliberate simplifications, called out honestly rather than silently assumed:
// - GROUND, RETRIEVE, and Height bookkeeping here are minimal stand-ins for the real
//   deterministic machinery in src/protocol and src/runtime, which is untouched by
//   this slice. The point of this slice is to see whether the *validated LLM-facing
//   pieces* cohere when wired together, not to reimplement production Height rules.
// - A collapsed proposition is indexed by the current Attempt's grounded entities,
//   not by re-grounding the resolver's own proposed text. A fuller design would
//   re-run GROUND on the resolver's output.
// - COMMIT phrases the attempt-outcome proposition by directly reusing the
//   Adjudicator's verdict text rather than a separate "verdict -> settled fact" role;
//   that would be a new unvalidated prompt, which this slice deliberately avoids
//   adding beyond what's already necessary (Continuity Resolver).
// - Collapse is attempted at most once per Attempt in this slice (no retry loop) to
//   keep the integration test bounded.
// - The post-NARRATE reachability audit (added after the "三毫米" finding in
//   pipeline-integration-slice-findings-2026-08-28.md) regenerates at most once per
//   Attempt if an unreachable claim is found; it does not loop to re-audit the
//   regenerated draft, to keep this bounded the same way collapse is.

import {callModel} from "./client.mjs";
import {
  GROUND_SYSTEM_PROMPT, GROUND_JSON_SCHEMA, buildGroundUserPrompt,
  ADJUDICATE_SYSTEM_PROMPT, buildAdjudicateUserPrompt,
  OUTCOME_CLASSIFIER_SYSTEM_PROMPT, OUTCOME_CLASSIFIER_JSON_SCHEMA,
  CONTINUITY_RESOLVER_SYSTEM_PROMPT, buildContinuityResolverUserPrompt,
  JUROR_SYSTEM_PROMPT, buildJurorUserPrompt,
  CLERK_SYSTEM_PROMPT, CLERK_JSON_SCHEMA, buildClerkUserPrompt,
  NARRATE_SYSTEM_PROMPT, buildNarrateUserPrompt,
  CLAIM_EXTRACTOR_SYSTEM_PROMPT, CLAIM_EXTRACTOR_JSON_SCHEMA, buildClaimExtractorUserPrompt,
  REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, REACHABILITY_CLASSIFIER_JSON_SCHEMA
} from "./prompts.mjs";
import {entityRegistry} from "./world.mjs";
// Reused verbatim from reachability-inference-spike -- not copied, so there is no risk
// of silent drift between the validated prompt and what this audit actually calls.
import {REACHABILITY_SYSTEM_PROMPT, buildUserPrompt as buildReachabilityUserPrompt}
  from "../reachability-inference-spike/prompts.mjs";

async function ground(attempt) {
  const {raw} = await callModel({
    system: GROUND_SYSTEM_PROMPT, user: buildGroundUserPrompt(attempt, entityRegistry),
    jsonSchema: GROUND_JSON_SCHEMA, maxTokens: 1200
  });
  return JSON.parse(raw);
}

async function adjudicate(propositions, attempt) {
  const {raw} = await callModel({system: ADJUDICATE_SYSTEM_PROMPT, user: buildAdjudicateUserPrompt(propositions, attempt), maxTokens: 1500});
  return raw;
}

async function classifyOutcome(verdictText) {
  const {raw} = await callModel({
    system: OUTCOME_CLASSIFIER_SYSTEM_PROMPT, user: verdictText,
    jsonSchema: OUTCOME_CLASSIFIER_JSON_SCHEMA, maxTokens: 1000
  });
  return JSON.parse(raw);
}

async function proposeCollapse(propositions, attempt, missingAbout) {
  const {raw} = await callModel({
    system: CONTINUITY_RESOLVER_SYSTEM_PROMPT,
    user: buildContinuityResolverUserPrompt(propositions, attempt, missingAbout), maxTokens: 1200
  });
  return raw;
}

async function runJurorsAndClerk(propositions, proposedFact) {
  const jurorCalls = await Promise.all([1, 2, 3].map(() =>
    callModel({system: JUROR_SYSTEM_PROMPT, user: buildJurorUserPrompt(propositions, proposedFact), maxTokens: 1200})));
  const verdicts = jurorCalls.map(c => c.raw);
  const clerkCall = await callModel({
    system: CLERK_SYSTEM_PROMPT, user: buildClerkUserPrompt(propositions, proposedFact, verdicts),
    jsonSchema: CLERK_JSON_SCHEMA, maxTokens: 1200
  });
  return {verdicts, clerk: JSON.parse(clerkCall.raw)};
}

async function narrate(propositions, attempt, outcomeSummary, avoidClaims) {
  const {raw} = await callModel({
    system: NARRATE_SYSTEM_PROMPT, user: buildNarrateUserPrompt(propositions, attempt, outcomeSummary, avoidClaims),
    maxTokens: 1500, timeoutMs: 150_000
  });
  return raw;
}

async function extractClaims(propositions, narrationText) {
  const {raw} = await callModel({
    system: CLAIM_EXTRACTOR_SYSTEM_PROMPT, user: buildClaimExtractorUserPrompt(propositions, narrationText),
    jsonSchema: CLAIM_EXTRACTOR_JSON_SCHEMA, maxTokens: 1200
  });
  return JSON.parse(raw).claims;
}

async function checkReachable(propositions, claim) {
  const verdict = await callModel({
    system: REACHABILITY_SYSTEM_PROMPT, user: buildReachabilityUserPrompt(propositions.map(p => p.text), claim), maxTokens: 1200
  });
  const classified = await callModel({
    system: REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, user: verdict.raw,
    jsonSchema: REACHABILITY_CLASSIFIER_JSON_SCHEMA, maxTokens: 800
  });
  return {claim, verdictText: verdict.raw, reachable: JSON.parse(classified.raw).reachable};
}

// Audits a NARRATE draft: extracts specific/checkable claims, checks each for
// reachability against the propositions NARRATE was given, and regenerates once
// (with the offending claims listed to avoid) if any claim is unreachable. Does not
// re-audit the regenerated draft -- bounded the same way COLLAPSE is capped at one
// attempt per Attempt.
async function narrateWithAudit(propositions, attempt, outcomeSummary) {
  const draft = await narrate(propositions, attempt, outcomeSummary);
  const claims = await extractClaims(propositions, draft);
  if (claims.length === 0) return {text: draft, draft, claims: [], checks: [], regenerated: false};

  const checks = await Promise.all(claims.map(claim => checkReachable(propositions, claim)));
  const unreachable = checks.filter(c => !c.reachable).map(c => c.claim);
  if (unreachable.length === 0) return {text: draft, draft, claims, checks, regenerated: false};

  const revised = await narrate(propositions, attempt, outcomeSummary, unreachable);
  return {text: revised, draft, claims, checks, regenerated: true};
}

export async function processAttempt(store, attempt) {
  const log = {attempt, stages: []};

  const groundResult = await ground(attempt);
  log.stages.push({stage: "GROUND", output: groundResult});
  if (groundResult.unbound.length > 0) {
    const height = store.nextHeight();
    const text = `边界：提到的"${groundResult.unbound.join("、")}"在这个世界里没有对应物，不存在。`;
    log.stages.push({stage: "BOUNDARY", height, text});
    return {...log, height, kind: "boundary", narration: text};
  }

  let propositions = store.retrieve(groundResult.entities);
  log.stages.push({stage: "RETRIEVE", output: propositions.map(p => p.text)});

  let verdictText = await adjudicate(propositions, attempt);
  log.stages.push({stage: "ADJUDICATE", output: verdictText});

  let classification = await classifyOutcome(verdictText);
  log.stages.push({stage: "CLASSIFY", output: classification});

  if (classification.outcome === "insufficient") {
    const proposedFact = await proposeCollapse(propositions, attempt, classification.missingAbout);
    log.stages.push({stage: "COLLAPSE_PROPOSE", output: proposedFact});

    const {verdicts, clerk} = await runJurorsAndClerk(propositions, proposedFact);
    log.stages.push({stage: "COLLAPSE_JURY", output: {verdicts, clerk}});

    if (clerk.finalDecision === "放行") {
      const height = store.nextHeight();
      store.append(proposedFact, groundResult.entities, height, "collapse");
      log.stages.push({stage: "COLLAPSE_COMMIT", height, text: proposedFact});

      propositions = store.retrieve(groundResult.entities);
      log.stages.push({stage: "RETRIEVE_AFTER_COLLAPSE", output: propositions.map(p => p.text)});

      verdictText = await adjudicate(propositions, attempt);
      log.stages.push({stage: "ADJUDICATE_AFTER_COLLAPSE", output: verdictText});
      classification = await classifyOutcome(verdictText);
      log.stages.push({stage: "CLASSIFY_AFTER_COLLAPSE", output: classification});
    } else {
      const height = store.nextHeight();
      const text = `边界：这件事依赖一个无法确定的事实（${classification.missingAbout || "未指明"}），陪审团没有放行编剧提出的补全。`;
      log.stages.push({stage: "BOUNDARY", height, text});
      return {...log, height, kind: "boundary", narration: text};
    }
  }

  const height = store.nextHeight();
  if (classification.outcome === "plausible") {
    store.append(`结果：${attempt} —— ${verdictText}`, groundResult.entities, height, "attempt-outcome");
  }
  log.stages.push({stage: "COMMIT", height, outcome: classification.outcome});

  const audited = await narrateWithAudit(propositions, attempt, verdictText);
  log.stages.push({stage: "NARRATE_AUDIT", output: {
    draft: audited.draft, extractedClaims: audited.claims,
    checks: audited.checks.map(c => ({claim: c.claim, reachable: c.reachable, verdictText: c.verdictText})),
    regenerated: audited.regenerated, final: audited.text
  }});

  return {...log, height, kind: classification.outcome, narration: audited.text};
}
