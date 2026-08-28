// Follow-up to the first spike (see docs/semantic-intent-spike-findings-2026-08-28.md,
// "值得警惕、不能直接算数的部分"). The original discourse-pronoun-binding case could not
// distinguish real pronoun resolution from "there was only one spreadable object in the
// scene, so guessing worked." This adds a second placeable/deformable object (rug-1,
// NOT held) so elimination no longer produces a free right answer, and adds a second
// sub-case that pits recency against the holding-relation heuristic head-on.
//
// Left untouched: run.mjs, cases.mjs, world.mjs, results/latest.json from the first run
// (kept as-is for reproducibility). This script is additive and self-contained.

import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {baseEntities, withBlanketHeld} from "./world.mjs";
import {SEMANTIC_INTENT_JSON_SCHEMA, SEMANTIC_INTENT_SYSTEM_PROMPT, buildSemanticIntentUserPrompt} from "./prompts.mjs";
import {ACTION_PROPOSAL_JSON_SCHEMA, ACTION_PROPOSAL_SYSTEM_PROMPT, buildActionProposalUserPrompt}
  from "../../dist/src/ai/action-proposal-prompt.js";
import {parseActionProposal} from "../../dist/src/protocol/action-proposal.js";
import {legacyContext} from "./world.mjs";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const TOKEN_FILE = new URL("../../secret/cftoken.txt", import.meta.url);
const token = (await readFile(TOKEN_FILE, "utf8")).trim();
if (!token) throw new Error("secret/cftoken.txt is empty.");

function withRugDistractor(entities) {
  // rug-1 shares blanket-1's place/deformable affordances so "which slot affords
  // spreading" no longer has a unique answer -- resolving "它" now requires actually
  // tracking what was mentioned/held, not eliminating down to the only candidate.
  return [...entities, {slot: "rug-1", kind: "object", labels: ["地毯"], placement: "bedroom",
    properties: {rolled: true}, affordances: ["contact", "place", "move", "deformable"]}];
}

function richContextWithDiscourse(entities, discourse) {
  return {
    actorSlot: "actor",
    entities: entities.map(entity => ({
      slot: entity.slot, kind: entity.kind, labels: entity.labels, placement: entity.placement,
      ...(entity.properties === undefined ? {} : {properties: entity.properties}),
      ...(entity.spatial === undefined ? {} : {spatial: entity.spatial}),
      ...(entity.holding === undefined ? {} : {holding: entity.holding}),
      affordances: entity.affordances
    })),
    allowedRelations: ["open", "aperture_cm", "held_by", "placed_at", "occludes"],
    ...(discourse === undefined ? {} : {discourse})
  };
}

function extractText(body) {
  const result = body?.result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content;
  if (typeof result === "string") return result;
  const choice = result?.choices?.[0];
  throw new Error(`Workers AI response had no text (finish_reason=${choice?.finish_reason ?? "unknown"}).`);
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function callModel({system, user, jsonSchema}) {
  const started = performance.now();
  let body;
  let response;
  let attempts = 0;
  for (; attempts < 3; attempts += 1) {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          messages: [{role: "system", content: system}, {role: "user", content: user}],
          temperature: 0, reasoning_effort: "low", max_completion_tokens: 1800,
          reasoning: {enable_thinking: false},
          response_format: {type: "json_schema", json_schema: jsonSchema}
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );
    body = await response.json();
    const capacityError = response.status === 429 || body?.errors?.some(error => error.code === 3040 || error.code === 7505);
    if (!capacityError || attempts === 2) break;
    await delay(1_000 * (2 ** attempts));
  }
  if (!response.ok || body.success === false) {
    throw new Error(`Workers AI ${response.status}: ${JSON.stringify(body.errors ?? [])}`);
  }
  const raw = extractText(body);
  const choice = body?.result?.choices?.[0];
  let parsed = null;
  let parseError = null;
  try { parsed = parseJson(raw); } catch (error) { parseError = String(error); }
  return {latencyMs: Math.round(performance.now() - started), attempts: attempts + 1,
    finishReason: choice?.finish_reason ?? null, usage: body?.result?.usage ?? null, raw, parsed, parseError};
}

async function newArm(rawInput, entities, discourse) {
  const context = richContextWithDiscourse(entities, discourse);
  const result = await callModel({system: SEMANTIC_INTENT_SYSTEM_PROMPT,
    user: buildSemanticIntentUserPrompt(rawInput, context), jsonSchema: SEMANTIC_INTENT_JSON_SCHEMA});
  return {...result, context};
}

async function oldArm(rawInput, entities) {
  const context = legacyContext(entities);
  const result = await callModel({system: ACTION_PROPOSAL_SYSTEM_PROMPT,
    user: buildActionProposalUserPrompt(rawInput, 0, context), jsonSchema: ACTION_PROPOSAL_JSON_SCHEMA});
  let validation = "not_attempted";
  if (result.parsed !== null) {
    try { parseActionProposal(result.parsed, rawInput, context); validation = "valid"; }
    catch (error) { validation = `invalid: ${error instanceof Error ? error.message : String(error)}`; }
  }
  return {...result, context, validation};
}

const entities = withRugDistractor(withBlanketHeld(baseEntities()));
const results = [];

// Sub-case A: focus should land on the HELD object (blanket-1), matching the original
// (now-confounded) case, but this time rug-1 is available as a wrong answer.
{
  process.stdout.write("[A-heuristic-agreement] turn1 (new) ... ");
  const t1 = await newArm("看看手里有什么", entities);
  results.push({id: "A-heuristic-agreement-turn1", arm: "new", rawInput: "看看手里有什么", ...t1});
  console.log(t1.parseError ? "INVALID_JSON" : "ok");

  const recentFocus = t1.parsed?.roles?.theme ?? null;
  process.stdout.write(`[A-heuristic-agreement] turn2 (new, recentFocus=${recentFocus}) ... `);
  const t2 = await newArm("把它铺开", entities, {recentFocus, recentUtterance: "看看手里有什么"});
  results.push({id: "A-heuristic-agreement-turn2", arm: "new", rawInput: "把它铺开", expectedResolvedSlot: "blanket-1", ...t2});
  console.log(t2.parseError ? "INVALID_JSON" : "ok");

  process.stdout.write("[A-heuristic-agreement] turn2 (old, no discourse channel) ... ");
  const t2old = await oldArm("把它铺开", entities);
  results.push({id: "A-heuristic-agreement-turn2", arm: "old", rawInput: "把它铺开", expectedResolvedSlot: "blanket-1", ...t2old});
  console.log(t2old.parseError ? "INVALID_JSON" : t2old.validation === "valid" ? "ok" : "SCHEMA_FAIL");
}

// Sub-case B: the adversarial test. Turn 1 puts discourse focus on rug-1 (NOT held).
// If turn 2's "它" still resolves to blanket-1 (the held item) regardless, that proves
// the model is applying a "whatever is held" heuristic, not real recency-based
// discourse tracking -- the thing sub-case A alone could not distinguish.
{
  process.stdout.write("[B-recency-override] turn1 (new) ... ");
  const t1 = await newArm("看看那块卷起来的地毯", entities);
  results.push({id: "B-recency-override-turn1", arm: "new", rawInput: "看看那块卷起来的地毯", ...t1});
  console.log(t1.parseError ? "INVALID_JSON" : "ok");

  const recentFocus = t1.parsed?.roles?.theme ?? null;
  process.stdout.write(`[B-recency-override] turn2 (new, recentFocus=${recentFocus}) ... `);
  const t2 = await newArm("把它铺开", entities, {recentFocus, recentUtterance: "看看那块卷起来的地毯"});
  results.push({id: "B-recency-override-turn2", arm: "new", rawInput: "把它铺开", expectedResolvedSlot: "rug-1", ...t2});
  console.log(t2.parseError ? "INVALID_JSON" : "ok");

  process.stdout.write("[B-recency-override] turn2 (old, no discourse channel) ... ");
  const t2old = await oldArm("把它铺开", entities);
  results.push({id: "B-recency-override-turn2", arm: "old", rawInput: "把它铺开", expectedResolvedSlot: "rug-1", ...t2old});
  console.log(t2old.parseError ? "INVALID_JSON" : t2old.validation === "valid" ? "ok" : "SCHEMA_FAIL");
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), accountId: ACCOUNT_ID, model: MODEL, count: results.length, results};
await writeFile(new URL("./results/discourse-retest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("Wrote experiments/semantic-intent-spike/results/discourse-retest.json");
