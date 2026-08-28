import {readFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();
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

export async function callModel({system, user, jsonSchema, maxTokens = 1200, timeoutMs = 90_000}) {
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
            temperature: 0, reasoning_effort: "low", max_completion_tokens: maxTokens,
            reasoning: {enable_thinking: false},
            ...(jsonSchema === undefined ? {} : {response_format: {type: "json_schema", json_schema: jsonSchema}})
          }),
          signal: AbortSignal.timeout(timeoutMs)
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
  const raw = extractText(body).trim();
  return {latencyMs: Math.round(performance.now() - started), raw};
}
