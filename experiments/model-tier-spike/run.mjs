// A/B accuracy + latency test across candidate models for the three "mechanical"
// roles (GROUND, CLASSIFY, REACHABILITY_CLASSIFIER) flagged in
// docs/architecture-direction-consensus-2026-08-28.md section 13 as worth trying a
// lighter/faster model for. All three candidates are Cloudflare-self-hosted (the
// newly-loosened constraint), same prompts/schemas as the real pipeline, imported
// unmodified -- only the model id changes.

import {readFile, mkdir, writeFile} from "node:fs/promises";
import {
  GROUND_SYSTEM_PROMPT, GROUND_JSON_SCHEMA, buildGroundUserPrompt,
  OUTCOME_CLASSIFIER_SYSTEM_PROMPT, OUTCOME_CLASSIFIER_JSON_SCHEMA,
  REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, REACHABILITY_CLASSIFIER_JSON_SCHEMA
} from "../pipeline-integration-slice/prompts.mjs";
import {entityRegistry} from "../pipeline-integration-slice/world.mjs";
import {groundCases, classifyCases, reachabilityClassifierCases} from "./cases.mjs";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();

// Baseline (current production model) + two candidates spanning the range the user
// asked for: qwen3-30b-a3b-fp8 (same family as baseline, MoE so only ~3B params
// active per token -- the primary candidate) and llama-3.1-8b-instruct (different
// family, smaller, English-centric -- a deliberate lower-bound calibration point to
// see how bad "too low" actually looks for our all-Chinese prompts, not a real
// adoption candidate on its own).
const MODELS = [
  {id: "@cf/qwen/qwen3.8-27b", label: "baseline (current)", reasoningEffort: "low"},
  {id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "candidate: qwen3-30b-a3b (MoE, 3B active)", reasoningEffort: "low"},
  {id: "@cf/meta/llama-3.1-8b-instruct", label: "calibration floor: llama-3.1-8b (non-Qwen, smaller)", reasoningEffort: undefined}
];

const delay = ms => new Promise(r => setTimeout(r, ms));

async function callModel(modelConfig, {system, user, jsonSchema, maxTokens = 1800}) {
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${modelConfig.id}`,
        {
          method: "POST",
          headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
          body: JSON.stringify({
            messages: [{role: "system", content: system}, {role: "user", content: user}],
            temperature: 0, max_completion_tokens: maxTokens,
            ...(modelConfig.reasoningEffort ? {reasoning_effort: modelConfig.reasoningEffort} : {}),
            ...(jsonSchema === undefined ? {} : {response_format: {type: "json_schema", json_schema: jsonSchema}})
          }),
          signal: AbortSignal.timeout(90_000)
        }
      );
      const body = await res.json();
      if (body.success === false) {
        lastError = new Error(`API error: ${JSON.stringify(body.errors)}`);
        if (attempt < 2) { await delay(1500); continue; }
        throw lastError;
      }
      const choice = body?.result?.choices?.[0];
      const content = choice?.message?.content ?? body?.result?.response;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error(`no content (finish_reason=${choice?.finish_reason ?? "unknown"})`);
      }
      return {raw: content.trim(), latencyMs: Date.now() - startedAt};
    } catch (error) {
      lastError = error;
      if (attempt < 2) { await delay(1500); continue; }
    }
  }
  return {error: String(lastError), latencyMs: Date.now() - startedAt};
}

async function runGround(modelConfig, testCase) {
  const result = await callModel(modelConfig, {
    system: GROUND_SYSTEM_PROMPT, user: buildGroundUserPrompt(testCase.attempt, entityRegistry),
    jsonSchema: GROUND_JSON_SCHEMA, maxTokens: 1000
  });
  if (result.error) return {...result, correct: false};
  try {
    const parsed = JSON.parse(result.raw);
    const entitiesMatch = JSON.stringify([...parsed.entities].sort()) === JSON.stringify([...testCase.expectedEntities].sort());
    const unboundMatch = JSON.stringify([...parsed.unbound].sort()) === JSON.stringify([...testCase.expectedUnbound].sort());
    return {...result, parsed, correct: entitiesMatch && unboundMatch};
  } catch (e) {
    return {...result, correct: false, parseError: String(e)};
  }
}

async function runClassify(modelConfig, testCase) {
  const result = await callModel(modelConfig, {
    system: OUTCOME_CLASSIFIER_SYSTEM_PROMPT, user: testCase.verdictText,
    jsonSchema: OUTCOME_CLASSIFIER_JSON_SCHEMA, maxTokens: 800
  });
  if (result.error) return {...result, correct: false};
  try {
    const parsed = JSON.parse(result.raw);
    return {...result, parsed, correct: parsed.outcome === testCase.expectedOutcome};
  } catch (e) {
    return {...result, correct: false, parseError: String(e)};
  }
}

async function runReachabilityClassifier(modelConfig, testCase) {
  const result = await callModel(modelConfig, {
    system: REACHABILITY_CLASSIFIER_SYSTEM_PROMPT, user: testCase.verdictText,
    jsonSchema: REACHABILITY_CLASSIFIER_JSON_SCHEMA, maxTokens: 600
  });
  if (result.error) return {...result, correct: false};
  try {
    const parsed = JSON.parse(result.raw);
    return {...result, parsed, correct: parsed.reachable === testCase.expectedReachable};
  } catch (e) {
    return {...result, correct: false, parseError: String(e)};
  }
}

const suites = [
  {name: "GROUND", cases: groundCases, run: runGround},
  {name: "CLASSIFY", cases: classifyCases, run: runClassify},
  {name: "REACHABILITY_CLASSIFIER", cases: reachabilityClassifierCases, run: runReachabilityClassifier}
];

const report = {generatedAt: new Date().toISOString(), models: MODELS.map(m => m.id), suites: []};

for (const suite of suites) {
  console.log(`\n=== ${suite.name} ===`);
  const suiteReport = {name: suite.name, models: []};
  for (const modelConfig of MODELS) {
    console.log(`\n-- ${modelConfig.label} (${modelConfig.id}) --`);
    const results = [];
    for (const [i, testCase] of suite.cases.entries()) {
      const r = await suite.run(modelConfig, testCase);
      results.push({case: i, correct: r.correct, latencyMs: r.latencyMs, error: r.error, parsed: r.parsed});
      console.log(`  [${i}] ${r.correct ? "OK  " : "FAIL"} ${r.latencyMs}ms${r.error ? ` ERROR: ${r.error}` : ""}`);
    }
    const correctCount = results.filter(r => r.correct).length;
    const avgLatency = Math.round(results.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / results.length);
    console.log(`  => ${correctCount}/${suite.cases.length} correct, avg latency ${avgLatency}ms`);
    suiteReport.models.push({modelId: modelConfig.id, label: modelConfig.label, correctCount, total: suite.cases.length, avgLatencyMs: avgLatency, results});
  }
  report.suites.push(suiteReport);
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("\nWrote experiments/model-tier-spike/results/latest.json");
