import assert from "node:assert/strict";
import test from "node:test";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {requestInputProposal} from "../src/ai/model-adapter.js";
import type {ActionContext} from "../src/protocol/action-proposal.js";
import {ProtocolError} from "../src/protocol/errors.js";

const accountId = "account";
const apiToken = "token-for-test-only";
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  {status, headers: {"Content-Type": "application/json"}});

test("Qwen adapter extracts choices content and records telemetry", async () => {
  const content = JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0,
    goalSpan: {text: "开门", start: 0, end: 2}, targetMentions: [{text: "门", start: 1, end: 2}], modifierSpans: []}], unsupportedClaims: []});
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(init?.headers instanceof Headers ? init.headers.get("Authorization") : JSON.stringify(init?.headers)), /Bearer/u);
    assert.equal(JSON.parse(String(init?.body)).temperature, 0);
    assert.equal(JSON.parse(String(init?.body)).reasoning_effort, "low");
    assert.equal(JSON.parse(String(init?.body)).max_completion_tokens, 2000);
    return jsonResponse({success: true, result: {choices: [{message: {content, reasoning: "ignored"}, finish_reason: "stop"}],
      usage: {prompt_tokens: 10, completion_tokens: 20}}});
  }) as typeof fetch;
  const model = new CloudflareQwenModel({accountId, apiToken, fetchImpl, now: () => new Date("2026-08-27T12:00:00Z")});
  const proposal = await requestInputProposal(model, "开门");
  assert.equal(proposal.kind, "attempt");
  assert.equal(model.lastTelemetry?.attempts, 1);
  assert.equal(model.lastTelemetry?.promptTokens, 10);
  assert.equal(model.lastTelemetry?.finishReason, "stop");
});

test("capacity failures retry twice then succeed", async () => {
  let calls = 0;
  const delays: number[] = [];
  const content = JSON.stringify({kind: "none", clauses: [], unsupportedClaims: []});
  const fetchImpl = (async () => {
    calls += 1;
    return calls < 3 ? jsonResponse({success: false, errors: [{code: 3040}]}, 429)
      : jsonResponse({success: true, result: {response: content}});
  }) as typeof fetch;
  const model = new CloudflareQwenModel({accountId, apiToken, fetchImpl, delay: async ms => {delays.push(ms);}});
  assert.equal((await requestInputProposal(model, "")).kind, "none");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(model.lastTelemetry?.attempts, 3);
});

test("reasoning-only response is MODEL_NO_CONTENT and is not retried", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls += 1; return jsonResponse({success: true,
    result: {choices: [{message: {reasoning: "thinking"}, finish_reason: "length"}]}}); }) as typeof fetch;
  const model = new CloudflareQwenModel({accountId, apiToken, fetchImpl});
  await assert.rejects(requestInputProposal(model, "开门"),
    (error: unknown) => error instanceof ProtocolError && error.code === "MODEL_NO_CONTENT");
  assert.equal(calls, 1);
});

test("exhausted capacity and transport failures preserve boundary codes", async () => {
  const capacity = new CloudflareQwenModel({accountId, apiToken,
    fetchImpl: (async () => jsonResponse({success: false, errors: [{code: 7505}]}, 429)) as typeof fetch,
    delay: async () => {}});
  await assert.rejects(requestInputProposal(capacity, "开门"),
    (error: unknown) => error instanceof ProtocolError && error.code === "MODEL_CAPACITY");
  assert.equal(capacity.lastTelemetry?.attempts, 3);
  const timeout = new CloudflareQwenModel({accountId, apiToken,
    fetchImpl: (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch});
  await assert.rejects(requestInputProposal(timeout, "开门"),
    (error: unknown) => error instanceof ProtocolError && error.code === "MODEL_TIMEOUT");
});

test("action proposal requests JSON Schema output with thinking disabled", async () => {
  const context: ActionContext = {actorSlot: "actor", slots: [
    {slot: "actor", kind: "actor", label: "你", perceivable: true, affordances: ["perceive"]}
  ], allowedRelations: []};
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body.reasoning, {enable_thinking: false});
    assert.equal((body.response_format as {type?: string}).type, "json_schema");
    return jsonResponse({success: true, result: {response: JSON.stringify({clauseIndex: 0, primitives: [], targetSlots: [],
      kind: "none", conditions: [], effects: [], perceptionScopes: [], unresolvedDependencies: []})}});
  }) as typeof fetch;
  const model = new CloudflareQwenModel({accountId, apiToken, fetchImpl});
  assert.equal((await model.proposeAction("看看", 0, context)).content?.includes("clauseIndex"), true);
});
