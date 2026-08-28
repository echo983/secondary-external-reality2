// Orchestrates GROUND -> RETRIEVE -> ADJUDICATE -> ground(verdict) -> CLASSIFY ->
// (COLLAPSE) -> COMMIT -> NARRATE -> ground(narration), per
// docs/adjudicator-pipeline-design-v0.1-2026-08-28.md section 2. Every LLM-facing
// prompt is carried over unchanged from a validated spike except GROUND and the
// outcome classifier (new, but light bookkeeping-only, not open-world modeling) and
// the Continuity Resolver (new, but structurally protected by the already-validated
// juror+clerk gate before anything it proposes is trusted). JUROR/CLERK were rewritten
// 2026-08-28 (see docs/ai-search-pipeline-wiring-findings-2026-08-28.md) to actually
// judge Collapse proposals against COLLAPSE_PROPOSAL_RULES, instead of a borrowed
// Attempt-plausibility prompt that treated "not yet confirmed" as valid grounds for
// rejection -- which is true of every genuine Collapse candidate by definition.
//
// The "ground a piece of free text against known propositions, resolve unreachable
// claims via reactive Collapse" mechanism (extractClaims + checkReachable +
// resolveClaimViaCollapse) is applied at TWO checkpoints, not duplicated: right after
// ADJUDICATE (groundVerdict) and right after NARRATE (narrateWithAudit). This is
// deliberate, not incidental -- CLASSIFY's "insufficient" self-report only catches a
// model that flags its own uncertainty; it does not catch a model that confidently
// asserts an ungrounded specific claim without ever admitting doubt (a real case this
// pipeline produced). The independent audit catches the latter; self-report still
// catches the former (a plain "not enough info" with no specific claim to check) --
// the two are complementary, not redundant, so both stay.
//
// Deliberate simplifications, called out honestly rather than silently assumed:
// - GROUND, RETRIEVE, and Height bookkeeping here are minimal stand-ins for the real
//   deterministic machinery in src/protocol and src/runtime, which is untouched by
//   this slice. The point of this slice is to see whether the *validated LLM-facing
//   pieces* cohere when wired together, not to reimplement production Height rules.
// - A collapsed proposition is indexed by the current Attempt's grounded entities,
//   not by re-grounding the resolver's own proposed text. A fuller design would
//   re-run GROUND on the resolver's output.
// - COMMIT prefers a clean FACT_SHAPE proposition from the FACT_WRITER role over the
//   raw verdict-log text (see writeFact below) -- necessary for the Height-based
//   recency-wins conflict rule to work at all, per recency-wins-findings-2026-08-28.md.
// - Each unreachable/unresolved claim gets at most one Collapse attempt (no retry
//   loop) at every checkpoint, to keep this integration test bounded.

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
  REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, REACHABILITY_CLASSIFIER_JSON_SCHEMA,
  FACT_WRITER_SYSTEM_PROMPT, buildFactWriterUserPrompt
} from "./prompts.mjs";
import {entityRegistry} from "./world.mjs";
// Reused verbatim from reachability-inference-spike -- not copied, so there is no risk
// of silent drift between the validated prompt and what this audit actually calls.
import {REACHABILITY_SYSTEM_PROMPT, buildUserPrompt as buildReachabilityUserPrompt}
  from "../reachability-inference-spike/prompts.mjs";

async function ground(attempt) {
  const {raw} = await callModel({
    system: GROUND_SYSTEM_PROMPT, user: buildGroundUserPrompt(attempt, entityRegistry),
    jsonSchema: GROUND_JSON_SCHEMA, maxTokens: 1800
  });
  return JSON.parse(raw);
}

async function adjudicate(propositions, attempt) {
  const {raw} = await callModel({system: ADJUDICATE_SYSTEM_PROMPT, user: buildAdjudicateUserPrompt(propositions, attempt), maxTokens: 1800});
  return raw;
}

async function writeFact(attempt, verdictText) {
  const {raw} = await callModel({system: FACT_WRITER_SYSTEM_PROMPT, user: buildFactWriterUserPrompt(attempt, verdictText), maxTokens: 1200});
  return raw.trim();
}

async function classifyOutcome(verdictText) {
  const {raw} = await callModel({
    system: OUTCOME_CLASSIFIER_SYSTEM_PROMPT, user: verdictText,
    jsonSchema: OUTCOME_CLASSIFIER_JSON_SCHEMA, maxTokens: 1500
  });
  return JSON.parse(raw);
}

async function proposeCollapse(propositions, attempt, missingAbout) {
  const {raw} = await callModel({
    system: CONTINUITY_RESOLVER_SYSTEM_PROMPT,
    user: buildContinuityResolverUserPrompt(propositions, attempt, missingAbout), maxTokens: 1800
  });
  return raw;
}

async function runJurorsAndClerk(propositions, proposedFact) {
  const jurorCalls = await Promise.all([1, 2, 3].map(() =>
    callModel({system: JUROR_SYSTEM_PROMPT, user: buildJurorUserPrompt(propositions, proposedFact), maxTokens: 1800})));
  const verdicts = jurorCalls.map(c => c.raw);
  const clerkCall = await callModel({
    system: CLERK_SYSTEM_PROMPT, user: buildClerkUserPrompt(propositions, proposedFact, verdicts),
    jsonSchema: CLERK_JSON_SCHEMA, maxTokens: 1800
  });
  return {verdicts, clerk: JSON.parse(clerkCall.raw)};
}

// Shared by both Collapse-trigger paths (CLASSIFY's self-reported "insufficient", and
// the reachability audit's independently-detected unreachable claims): propose one
// minimal completion, have it validated by the (now correctly-prompted) jury, commit
// it if approved. Single source of truth for "propose -> validate -> maybe commit",
// so both call sites automatically share any future fix to this sequence.
async function resolveClaimViaCollapse(store, groundResult, propositions, attempt, missingDescription) {
  const proposedFact = await proposeCollapse(propositions, attempt, missingDescription);
  const {verdicts, clerk} = await runJurorsAndClerk(propositions, proposedFact);
  if (clerk.finalDecision !== "放行") {
    return {committed: false, proposedFact, verdicts, clerk};
  }
  const height = store.nextHeight();
  const committedRecord = await store.append(proposedFact, groundResult.entities, height, "collapse");
  return {committed: true, proposedFact, verdicts, clerk, height, committedRecord};
}

async function narrate(propositions, attempt, outcomeSummary, avoidClaims) {
  const {raw} = await callModel({
    system: NARRATE_SYSTEM_PROMPT, user: buildNarrateUserPrompt(propositions, attempt, outcomeSummary, avoidClaims),
    maxTokens: 2200, timeoutMs: 150_000
  });
  return raw;
}

async function extractClaims(propositions, narrationText) {
  const {raw} = await callModel({
    system: CLAIM_EXTRACTOR_SYSTEM_PROMPT, user: buildClaimExtractorUserPrompt(propositions, narrationText),
    jsonSchema: CLAIM_EXTRACTOR_JSON_SCHEMA, maxTokens: 1800
  });
  return JSON.parse(raw).claims;
}

async function checkReachable(propositions, claim) {
  const verdict = await callModel({
    system: REACHABILITY_SYSTEM_PROMPT, user: buildReachabilityUserPrompt(propositions.map(p => p.text), claim), maxTokens: 1800
  });
  const classified = await callModel({
    system: REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, user: verdict.raw,
    jsonSchema: REACHABILITY_CLASSIFIER_JSON_SCHEMA, maxTokens: 1200
  });
  return {claim, verdictText: verdict.raw, reachable: JSON.parse(classified.raw).reachable};
}

// Audits a NARRATE draft: extracts specific/checkable claims, checks each for
// reachability against the propositions NARRATE was given.
//
// This used to just avoid unreachable claims in a regenerated draft -- safe, but it
// left value-lookup Attempts (e.g. "量一下门缝到底有多宽") permanently unanswered,
// because nothing ever actually established the missing value; the audit only
// suppressed the fabrication without resolving it. This version instead routes each
// unreachable claim through the SAME Continuity Resolver + jury/clerk Collapse
// mechanism already validated (juror-clerk-spike, and the upstream COLLAPSE branch in
// this pipeline) -- reactive Collapse discovery, triggered by what NARRATE actually
// tried to assert, rather than trying to classify Attempt intent upfront. A claim the
// jury approves becomes a committed fact and is available for the final narration
// pass; a claim the jury rejects still just gets avoided (falls back to the old
// behavior for that one claim only). Bounded: each unreachable claim gets at most one
// Collapse attempt, and there is one final narrate call regardless of how many claims
// were processed.
async function narrateWithAudit(store, groundResult, propositions, attempt, outcomeSummary) {
  const draft = await narrate(propositions, attempt, outcomeSummary);
  const claims = await extractClaims(propositions, draft);
  if (claims.length === 0) return {text: draft, draft, claims: [], checks: [], collapses: [], regenerated: false};

  const checks = await Promise.all(claims.map(claim => checkReachable(propositions, claim)));
  const unreachableChecks = checks.filter(c => !c.reachable);
  if (unreachableChecks.length === 0) return {text: draft, draft, claims, checks, collapses: [], regenerated: false};

  let workingPropositions = propositions;
  const stillAvoid = [];
  const collapses = [];
  for (const check of unreachableChecks) {
    const outcome = await resolveClaimViaCollapse(store, groundResult, workingPropositions, attempt, check.claim);
    if (outcome.committed) {
      workingPropositions = [...workingPropositions, outcome.committedRecord];
      collapses.push({claim: check.claim, ...outcome});
    } else {
      stillAvoid.push(check.claim);
      collapses.push({claim: check.claim, ...outcome});
    }
  }

  const revised = await narrate(workingPropositions, attempt, outcomeSummary, stillAvoid);
  return {text: revised, draft, claims, checks, collapses, regenerated: true, finalPropositions: workingPropositions};
}

// New (see docs/ai-search-pipeline-wiring-findings-2026-08-28.md "发现二"): audits
// ADJUDICATE's own verdict the same way narrateWithAudit audits NARRATE's draft --
// CLASSIFY's "insufficient" self-report is not reliable (a model can assert an
// ungrounded specific claim confidently, without ever flagging its own uncertainty;
// this pipeline's "门缝足以容纳它" run is a real example). This is an independent,
// non-self-report check for the same underlying condition: does the verdict assert
// anything not actually derivable from the given propositions. Bounded the same way
// as narrateWithAudit: each unreachable claim gets at most one Collapse attempt, and
// if any claim can't be resolved, the whole verdict is treated as ungroundable (not
// silently trusted) rather than proceeding on a claim we know is unsupported.
async function groundVerdict(store, groundResult, propositions, attempt, verdictText) {
  const claims = await extractClaims(propositions, verdictText);
  if (claims.length === 0) return {propositions, allResolved: true, anyCommitted: false, unresolvedClaims: [], claims: [], collapses: []};

  const checks = await Promise.all(claims.map(claim => checkReachable(propositions, claim)));
  const unreachableChecks = checks.filter(c => !c.reachable);
  if (unreachableChecks.length === 0) return {propositions, allResolved: true, anyCommitted: false, unresolvedClaims: [], claims, collapses: []};

  let workingPropositions = propositions;
  const unresolvedClaims = [];
  const collapses = [];
  let anyCommitted = false;
  for (const check of unreachableChecks) {
    const outcome = await resolveClaimViaCollapse(store, groundResult, workingPropositions, attempt, check.claim);
    if (outcome.committed) {
      workingPropositions = [...workingPropositions, outcome.committedRecord];
      anyCommitted = true;
    } else {
      unresolvedClaims.push(check.claim);
    }
    collapses.push({claim: check.claim, ...outcome});
  }

  return {
    propositions: workingPropositions, allResolved: unresolvedClaims.length === 0,
    anyCommitted, unresolvedClaims, claims, collapses
  };
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

  let propositions = await store.retrieve(groundResult.entities, attempt);
  log.stages.push({stage: "RETRIEVE", output: propositions.map(p => p.text)});

  let verdictText = await adjudicate(propositions, attempt);
  log.stages.push({stage: "ADJUDICATE", output: verdictText});

  // Ground ADJUDICATE's own verdict before trusting it for anything downstream -- this
  // is an independent check (extract+reachability, not model self-report) for the same
  // "did this assert something ungrounded" condition CLASSIFY's "insufficient" tries to
  // self-detect, added because self-report alone missed a real case (see
  // docs/ai-search-pipeline-wiring-findings-2026-08-28.md "发现二"): ADJUDICATE can
  // confidently assert an ungrounded specific claim without ever flagging uncertainty.
  const grounding = await groundVerdict(store, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "ADJUDICATE_GROUNDING", output: {
    claims: grounding.claims, unresolvedClaims: grounding.unresolvedClaims,
    collapses: grounding.collapses.map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, clerkDecision: c.clerk.finalDecision}))
  }});
  if (!grounding.allResolved) {
    const height = store.nextHeight();
    const text = `边界：这次裁决依赖无法确定的事实（${grounding.unresolvedClaims.join("；")}），陪审团没有放行相应的补全。`;
    log.stages.push({stage: "BOUNDARY", height, text});
    return {...log, height, kind: "boundary", narration: text};
  }
  if (grounding.anyCommitted) {
    propositions = grounding.propositions;
    verdictText = await adjudicate(propositions, attempt);
    log.stages.push({stage: "ADJUDICATE_AFTER_GROUNDING", output: verdictText});
  }

  let classification = await classifyOutcome(verdictText);
  log.stages.push({stage: "CLASSIFY", output: classification});

  if (classification.outcome === "insufficient") {
    const outcome = await resolveClaimViaCollapse(store, groundResult, propositions, attempt, classification.missingAbout);
    log.stages.push({stage: "COLLAPSE", output: {
      proposedFact: outcome.proposedFact, verdicts: outcome.verdicts, clerk: outcome.clerk
    }});

    if (outcome.committed) {
      // Deliberately not awaiting indexing latency here -- this immediate re-retrieve
      // is exactly what tests whether a just-committed fact is searchable in time for
      // the same Attempt's settlement to use it.
      propositions = await store.retrieve(groundResult.entities, attempt);
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
  let committedFactText;
  if (classification.outcome === "plausible") {
    // Prefer a clean FACT_SHAPE state proposition (writeFact) over the raw verdict-log
    // text -- per reactive-collapse-findings, a state change buried in judgment prose
    // is too easy for a later reader to miss as contradicting a stale fact, which
    // defeats the recency-wins rule before it can even apply.
    const cleanFact = await writeFact(attempt, verdictText);
    committedFactText = cleanFact !== "" ? cleanFact : `结果：${attempt} —— ${verdictText}`;
    await store.append(committedFactText, groundResult.entities, height, "attempt-outcome");
  }
  log.stages.push({stage: "COMMIT", height, outcome: classification.outcome, committedFactText});

  const audited = await narrateWithAudit(store, groundResult, propositions, attempt, verdictText);
  log.stages.push({stage: "NARRATE_AUDIT", output: {
    draft: audited.draft, extractedClaims: audited.claims,
    checks: audited.checks.map(c => ({claim: c.claim, reachable: c.reachable, verdictText: c.verdictText})),
    collapses: (audited.collapses ?? []).map(c => ({claim: c.claim, proposedFact: c.proposedFact, committed: c.committed, height: c.height, clerkDecision: c.clerk.finalDecision})),
    regenerated: audited.regenerated, final: audited.text
  }});

  return {...log, height, kind: classification.outcome, narration: audited.text};
}
