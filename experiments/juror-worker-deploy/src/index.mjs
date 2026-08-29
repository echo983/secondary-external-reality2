// Deployment probe for docs/architecture-direction-consensus-2026-08-28.md section 12:
// the juror+clerk role, actually deployed as a stateless Cloudflare Worker calling
// Workers AI through the native `AI` binding, instead of the local Node scripts (REST
// fetch) every other experiment in this repo uses. This is the first real cloud
// deployment in the whole project. Two things this exists to test empirically, not
// argue about on paper:
//   1. Concurrent requests to this Worker are NOT serialized (unlike a Durable-Object-
//      backed Agent instance, which explicitly queues same-identity calls) -- see
//      test/concurrency-test.mjs.
//   2. A plain Worker can call AI Search's REST API directly, same as the local
//      ai-search-retrieval-spike client does -- see the /search-test route.
//
// Juror/clerk prompts and proposition rendering are imported unmodified from the
// already-validated pipeline-integration-slice / shared modules -- this file only
// adapts the *transport* (Workers AI binding instead of REST fetch), not the logic.

import {
  JUROR_SYSTEM_PROMPT, buildJurorUserPrompt,
  CLERK_SYSTEM_PROMPT, buildClerkUserPrompt, CLERK_JSON_SCHEMA
} from "../../pipeline-integration-slice/prompts.mjs";

const MODEL = "@cf/qwen/qwen3.8-27b";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Retry-on-transient-failure, ported back from pipeline-integration-slice/client.mjs's
// REST fetch retry loop -- dropped when this Worker was first written, restored here
// after pipeline-worker-deploy hit a bare `TypeError: fetch failed` (see
// docs/pipeline-worker-deploy-findings-2026-08-29.md).
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
    temperature: 0,
    // reasoning_effort: "low" is the real, documented lever for this model (values:
    // low/medium/xhigh-default). `reasoning: {enable_thinking: false}` is not a real
    // parameter -- removed, see docs/reasoning-token-diagnosis-findings-2026-08-29.md.
    reasoning_effort: "low",
    max_completion_tokens: maxTokens,
    ...(jsonSchema === undefined ? {} : {response_format: {type: "json_schema", json_schema: jsonSchema}})
  }), {label: "AI.run"});
  return extractText(body).trim();
}

// Same shape as pipeline.mjs's runJurorsAndClerk (3 jurors via Promise.all, then
// clerk aggregation) -- unchanged logic, only the model transport differs.
async function runJurorsAndClerk(env, propositions, proposedFact) {
  const jurorsStartedAt = Date.now();
  const verdicts = await Promise.all([1, 2, 3].map(() =>
    callModel(env, {system: JUROR_SYSTEM_PROMPT, user: buildJurorUserPrompt(propositions, proposedFact), maxTokens: 1800})
  ));
  const jurorsElapsedMs = Date.now() - jurorsStartedAt;
  const clerkRaw = await callModel(env, {
    system: CLERK_SYSTEM_PROMPT, user: buildClerkUserPrompt(propositions, proposedFact, verdicts),
    jsonSchema: CLERK_JSON_SCHEMA, maxTokens: 1800
  });
  return {verdicts, clerk: JSON.parse(clerkRaw), jurorsElapsedMs};
}

async function searchAiSearch(env, query) {
  const startedAt = Date.now();
  return withRetry(async () => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/ai-search/instances/${env.AI_SEARCH_INSTANCE}/search`,
      {
        method: "POST",
        headers: {Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json"},
        body: JSON.stringify({query})
      }
    );
    const body = await response.json();
    return {ok: response.ok, status: response.status, elapsedMs: Date.now() - startedAt, result: body.success ? body.result : body};
  }, {label: `search "${query}"`});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/juror" && request.method === "POST") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({error: "invalid JSON body"}, {status: 400});
      }
      const {propositions, proposedFact} = payload;
      if (!Array.isArray(propositions) || typeof proposedFact !== "string") {
        return Response.json({error: "expected {propositions: array, proposedFact: string}"}, {status: 400});
      }
      const startedAt = Date.now();
      try {
        const result = await runJurorsAndClerk(env, propositions, proposedFact);
        return Response.json({...result, totalElapsedMs: Date.now() - startedAt, handledAt: new Date().toISOString()});
      } catch (error) {
        return Response.json({error: String(error), totalElapsedMs: Date.now() - startedAt}, {status: 502});
      }
    }

    if (url.pathname === "/search-test" && request.method === "GET") {
      if (!env.CF_API_TOKEN) return Response.json({error: "CF_API_TOKEN secret not configured on this Worker"}, {status: 500});
      const query = url.searchParams.get("q") ?? "毛毯";
      const result = await searchAiSearch(env, query);
      return Response.json(result);
    }

    return new Response(
      "sr2-juror-worker\nPOST /juror {propositions: [{text, height}], proposedFact: string}\nGET /search-test?q=...\n",
      {status: 200, headers: {"content-type": "text/plain; charset=utf-8"}}
    );
  }
};
