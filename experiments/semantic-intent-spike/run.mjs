import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {cases, discourseCase} from "./cases.mjs";
import {richContext, legacyContext} from "./world.mjs";
import {SEMANTIC_INTENT_JSON_SCHEMA, SEMANTIC_INTENT_SYSTEM_PROMPT, buildSemanticIntentUserPrompt} from "./prompts.mjs";
import {ACTION_PROPOSAL_JSON_SCHEMA, ACTION_PROPOSAL_SYSTEM_PROMPT, buildActionProposalUserPrompt}
  from "../../dist/src/ai/action-proposal-prompt.js";
import {parseActionProposal} from "../../dist/src/protocol/action-proposal.js";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const TOKEN_FILE = new URL("../../secret/cftoken.txt", import.meta.url);

const token = (await readFile(TOKEN_FILE, "utf8")).trim();
if (!token) throw new Error("secret/cftoken.txt is empty.");

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
  return {
    latencyMs: Math.round(performance.now() - started), attempts: attempts + 1,
    finishReason: choice?.finish_reason ?? null, usage: body?.result?.usage ?? null,
    raw, parsed, parseError
  };
}

async function runNewArm(rawInput, entities, discourse) {
  const context = richContext(entities, discourse);
  const result = await callModel({
    system: SEMANTIC_INTENT_SYSTEM_PROMPT,
    user: buildSemanticIntentUserPrompt(rawInput, context),
    jsonSchema: SEMANTIC_INTENT_JSON_SCHEMA
  });
  return {...result, context};
}

async function runOldArm(rawInput, entities) {
  const context = legacyContext(entities);
  const result = await callModel({
    system: ACTION_PROPOSAL_SYSTEM_PROMPT,
    user: buildActionProposalUserPrompt(rawInput, 0, context),
    jsonSchema: ACTION_PROPOSAL_JSON_SCHEMA
  });
  let validation = "not_attempted";
  if (result.parsed !== null) {
    try { parseActionProposal(result.parsed, rawInput, context); validation = "valid"; }
    catch (error) { validation = `invalid: ${error instanceof Error ? error.message : String(error)}`; }
  }
  return {...result, context, validation};
}

const results = [];

for (const [index, testCase] of cases.entries()) {
  process.stdout.write(`[${index + 1}/${cases.length}] ${testCase.id} (new) ... `);
  try {
    const outcome = await runNewArm(testCase.rawInput, testCase.entities);
    results.push({id: testCase.id, suite: testCase.suite, arm: "new", rawInput: testCase.rawInput,
      expectation: testCase.expectation, ...outcome});
    console.log(outcome.parseError ? "INVALID_JSON" : "ok");
  } catch (error) {
    results.push({id: testCase.id, suite: testCase.suite, arm: "new", rawInput: testCase.rawInput, error: String(error)});
    console.log("ERROR");
  }

  process.stdout.write(`[${index + 1}/${cases.length}] ${testCase.id} (old) ... `);
  try {
    const outcome = await runOldArm(testCase.rawInput, testCase.entities);
    results.push({id: testCase.id, suite: testCase.suite, arm: "old", rawInput: testCase.rawInput,
      expectation: testCase.expectation, ...outcome});
    console.log(outcome.parseError ? "INVALID_JSON" : outcome.validation === "valid" ? "ok" : "SCHEMA_FAIL");
  } catch (error) {
    results.push({id: testCase.id, suite: testCase.suite, arm: "old", rawInput: testCase.rawInput, error: String(error)});
    console.log("ERROR");
  }
}

// Discourse case: two dependent turns per arm.
process.stdout.write(`[discourse] turn1 (new) ... `);
let discourseTurn1New;
try {
  discourseTurn1New = await runNewArm(discourseCase.turn1RawInput, discourseCase.entities);
  results.push({id: `${discourseCase.id}-turn1`, suite: discourseCase.suite, arm: "new",
    rawInput: discourseCase.turn1RawInput, expectation: discourseCase.expectation, ...discourseTurn1New});
  console.log(discourseTurn1New.parseError ? "INVALID_JSON" : "ok");
} catch (error) {
  results.push({id: `${discourseCase.id}-turn1`, suite: discourseCase.suite, arm: "new",
    rawInput: discourseCase.turn1RawInput, error: String(error)});
  console.log("ERROR");
}

const recentFocus = discourseTurn1New?.parsed?.roles?.theme ?? null;
process.stdout.write(`[discourse] turn2 (new, recentFocus=${recentFocus}) ... `);
try {
  const outcome = await runNewArm(discourseCase.turn2RawInput, discourseCase.entities,
    {recentFocus, recentUtterance: discourseCase.turn1RawInput});
  results.push({id: `${discourseCase.id}-turn2`, suite: discourseCase.suite, arm: "new",
    rawInput: discourseCase.turn2RawInput, expectation: discourseCase.expectation, ...outcome});
  console.log(outcome.parseError ? "INVALID_JSON" : "ok");
} catch (error) {
  results.push({id: `${discourseCase.id}-turn2`, suite: discourseCase.suite, arm: "new",
    rawInput: discourseCase.turn2RawInput, error: String(error)});
  console.log("ERROR");
}

// Old arm has no discourse channel at all -- turn 2 gets only the static legacy
// context, same as production would give it. This is expected to fail to resolve
// "它" and is recorded as evidence, not a bug in the harness.
process.stdout.write(`[discourse] turn2 (old, no discourse channel) ... `);
try {
  const outcome = await runOldArm(discourseCase.turn2RawInput, discourseCase.entities);
  results.push({id: `${discourseCase.id}-turn2`, suite: discourseCase.suite, arm: "old",
    rawInput: discourseCase.turn2RawInput, expectation: discourseCase.expectation, ...outcome});
  console.log(outcome.parseError ? "INVALID_JSON" : outcome.validation === "valid" ? "ok" : "SCHEMA_FAIL");
} catch (error) {
  results.push({id: `${discourseCase.id}-turn2`, suite: discourseCase.suite, arm: "old",
    rawInput: discourseCase.turn2RawInput, error: String(error)});
  console.log("ERROR");
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), accountId: ACCOUNT_ID, model: MODEL, count: results.length, results};
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("Wrote experiments/semantic-intent-spike/results/latest.json");
