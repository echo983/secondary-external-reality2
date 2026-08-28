import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {turns} from "./cases.mjs";
import {WORLD_FEEDBACK_SYSTEM_PROMPT} from "./prompts.mjs";

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

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function callModel(messages) {
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
            messages, temperature: 0, reasoning_effort: "low", max_completion_tokens: 3000,
            reasoning: {enable_thinking: false}
          }),
          signal: AbortSignal.timeout(150_000)
        }
      );
    } catch (cause) {
      if (attempts < 3) { await delay(1_000); continue; } // retry on timeout/network error
      throw cause;
    }
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
  return {latencyMs: Math.round(performance.now() - started), attempts: attempts + 1,
    finishReason: choice?.finish_reason ?? null, usage: body?.result?.usage ?? null, raw: raw.trim()};
}

const messages = [{role: "system", content: WORLD_FEEDBACK_SYSTEM_PROMPT}];
const results = [];

for (const [index, turn] of turns.entries()) {
  const userContent = `Attempt("${turn.attempt}")`;
  messages.push({role: "user", content: userContent});
  process.stdout.write(`[${index + 1}/${turns.length}] ${turn.id} ... `);
  try {
    const outcome = await callModel(messages);
    messages.push({role: "assistant", content: outcome.raw});
    results.push({id: turn.id, attempt: turn.attempt, check: turn.check, ...outcome});
    console.log("ok");
  } catch (error) {
    results.push({id: turn.id, attempt: turn.attempt, check: turn.check, error: String(error)});
    console.log("ERROR");
    break; // subsequent turns depend on conversation continuity; stop on first failure
  }
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), accountId: ACCOUNT_ID, model: MODEL, count: results.length, results};
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("Wrote experiments/world-feedback-narration-spike/results/latest.json");
