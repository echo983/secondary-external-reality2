import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {allCases} from "./cases.mjs";
import {promptFor} from "./prompts.mjs";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const TOKEN_FILE = new URL("../../secret/cftoken.txt", import.meta.url);
const smoke = process.argv.includes("--smoke");
const idsArgument = process.argv.find(argument => argument.startsWith("--ids="));
const requestedIds = idsArgument?.slice("--ids=".length).split(",").filter(Boolean) ?? [];
const selected = requestedIds.length > 0
  ? requestedIds.map(id => allCases.find(test => test.id === id))
  : smoke
  ? ["obs-cat-motive", "intent-hidden-claim", "collapse-dramatic-option", "para-open-slit-1"]
      .map(id => allCases.find(test => test.id === id))
  : allCases;

if (selected.some(test => !test)) throw new Error("Smoke case selection is invalid.");

const token = (await readFile(TOKEN_FILE, "utf8")).trim();
if (!token) throw new Error("secret/cftoken.txt is empty.");

function extractText(body) {
  const result = body?.result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (typeof result?.choices?.[0]?.message?.content === "string") {
    return result.choices[0].message.content;
  }
  if (typeof result === "string") return result;
  const choice = result?.choices?.[0];
  throw new Error(`Workers AI response did not contain text (finish_reason=${choice?.finish_reason ?? "unknown"}, reasoning_chars=${choice?.message?.reasoning?.length ?? 0}).`);
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function callModel(test) {
  const prompt = promptFor(test);
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
          messages: [
            {role: "system", content: prompt.system},
            {role: "user", content: prompt.user}
          ],
          temperature: 0,
          max_tokens: 1400
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );
    body = await response.json();
    const capacityError = response.status === 429 || body?.errors?.some(error => error.code === 3040);
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
    id: test.id,
    suite: test.suite,
    groupId: test.groupId ?? null,
    model: MODEL,
    temperature: 0,
    latencyMs: Math.round(performance.now() - started),
    attempts: attempts + 1,
    finishReason: choice?.finish_reason ?? null,
    usage: body?.result?.usage ?? null,
    raw,
    parsed,
    parseError
  };
}

const results = [];
for (const [index, test] of selected.entries()) {
  process.stdout.write(`[${index + 1}/${selected.length}] ${test.suite}/${test.id} ... `);
  try {
    const result = await callModel(test);
    results.push(result);
    console.log(result.parseError ? "INVALID_JSON" : "ok");
  } catch (error) {
    results.push({id: test.id, suite: test.suite, groupId: test.groupId ?? null, model: MODEL, error: String(error)});
    console.log("ERROR");
  }
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const mode = requestedIds.length > 0 ? "selected" : smoke ? "smoke" : "full";
const filename = mode === "selected" ? "latest-selected.json" : mode === "smoke" ? "latest-smoke.json" : "latest-full.json";
const report = {
  generatedAt: new Date().toISOString(),
  accountId: ACCOUNT_ID,
  model: MODEL,
  mode,
  count: results.length,
  results
};
await writeFile(new URL(`./results/${filename}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote experiments/qwen-boundary/results/${filename}`);
