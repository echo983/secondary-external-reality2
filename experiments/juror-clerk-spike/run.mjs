import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {cases} from "./cases.mjs";
import {JUROR_SYSTEM_PROMPT, buildJurorUserPrompt, CLERK_SYSTEM_PROMPT, buildClerkUserPrompt} from "./prompts.mjs";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const TOKEN_FILE = new URL("../../secret/cftoken.txt", import.meta.url);
const token = (await readFile(TOKEN_FILE, "utf8")).trim();
if (!token) throw new Error("secret/cftoken.txt is empty.");

const CLERK_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["classifications", "vetoTriggered", "vetoReason", "finalDecision", "rule"],
  properties: {
    classifications: {type: "array", minItems: 3, maxItems: 3, items: {type: "string", enum: ["通过", "拒绝", "含糊"]}},
    vetoTriggered: {type: "boolean"},
    vetoReason: {type: "string"},
    finalDecision: {type: "string", enum: ["放行", "不放行"]},
    rule: {type: "string", enum: ["veto", "majority-pass", "majority-reject"]}
  }
};

function extractText(body) {
  const result = body?.result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content;
  if (typeof result === "string") return result;
  const choice = result?.choices?.[0];
  throw new Error(`Workers AI response had no text (finish_reason=${choice?.finish_reason ?? "unknown"}).`);
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function callModel({system, user, jsonSchema}) {
  const started = performance.now();
  let body;
  let response;
  let attempts = 0;
  for (; attempts < 4; attempts += 1) {
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
          body: JSON.stringify({
            messages: [{role: "system", content: system}, {role: "user", content: user}],
            temperature: 0, reasoning_effort: "low", max_completion_tokens: 900,
            reasoning: {enable_thinking: false},
            ...(jsonSchema === undefined ? {} : {response_format: {type: "json_schema", json_schema: jsonSchema}})
          }),
          signal: AbortSignal.timeout(60_000)
        }
      );
    } catch (cause) {
      if (attempts < 3) { await delay(1_000); continue; }
      throw cause;
    }
    body = await response.json();
    const capacityError = response.status === 429 || body?.errors?.some(error => error.code === 3040 || error.code === 7505);
    if (!capacityError || attempts === 3) break;
    await delay(1_000 * (2 ** attempts));
  }
  if (!response.ok || body.success === false) {
    throw new Error(`Workers AI ${response.status}: ${JSON.stringify(body.errors ?? [])}`);
  }
  const raw = extractText(body);
  const choice = body?.result?.choices?.[0];
  return {latencyMs: Math.round(performance.now() - started), finishReason: choice?.finish_reason ?? null, raw: raw.trim()};
}

const results = [];

for (const [index, testCase] of cases.entries()) {
  console.log(`[${index + 1}/${cases.length}] ${testCase.id}`);
  const jurorPrompt = buildJurorUserPrompt(testCase.context, testCase.claim);

  process.stdout.write("  jurors (3x, same source) ... ");
  const jurorOutcomes = [];
  for (let i = 0; i < 3; i += 1) {
    const outcome = await callModel({system: JUROR_SYSTEM_PROMPT, user: jurorPrompt});
    jurorOutcomes.push(outcome);
  }
  console.log("ok");

  process.stdout.write("  clerk ... ");
  const clerkUser = buildClerkUserPrompt(testCase.context, testCase.claim, jurorOutcomes.map(o => o.raw));
  let clerkOutcome;
  let clerkParsed = null;
  let clerkParseError = null;
  try {
    clerkOutcome = await callModel({system: CLERK_SYSTEM_PROMPT, user: clerkUser, jsonSchema: CLERK_JSON_SCHEMA});
    try { clerkParsed = JSON.parse(clerkOutcome.raw); } catch (error) { clerkParseError = String(error); }
    console.log(clerkParseError ? "INVALID_JSON" : "ok");
  } catch (error) {
    clerkOutcome = {error: String(error)};
    console.log("ERROR");
  }

  results.push({
    id: testCase.id, context: testCase.context, claim: testCase.claim, note: testCase.note,
    jurorVerdicts: jurorOutcomes.map(o => ({raw: o.raw, latencyMs: o.latencyMs})),
    clerk: {...clerkOutcome, parsed: clerkParsed, parseError: clerkParseError}
  });
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), accountId: ACCOUNT_ID, model: MODEL, count: results.length, results};
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("Wrote experiments/juror-clerk-spike/results/latest.json");
