import assert from "node:assert/strict";
import test from "node:test";
import {ALLOWED_MODEL, type ModelResponse, type ProposalModel} from "../src/ai/model-adapter.js";
import {InMemoryAuditStore} from "../src/audit/attempt-audit.js";
import {RuntimeSession} from "../src/runtime/runtime-session.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";

class QueueModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;
  constructor(private readonly responses: ModelResponse[]) {}
  async propose(): Promise<ModelResponse> {
    const response = this.responses.shift();
    if (response === undefined) throw new Error("test model queue exhausted");
    return response;
  }
}

const encoded = (value: unknown): ModelResponse => ({content: JSON.stringify(value)});

test("RuntimeSession composes world, query, adversarial, none, and wait without false Heights", async () => {
  const proposals = [
    {kind: "attempt", clauses: [{clauseIndex: 0, goalSpan: {text: "推门", start: 2, end: 4},
      methodSpan: {text: "轻轻", start: 0, end: 2}, targetMentions: [{text: "门", start: 3, end: 4}],
      modifierSpans: [{text: "一条缝", start: 7, end: 10}, {text: "别出声", start: 11, end: 14}]}], unsupportedClaims: []},
    {kind: "query", clauses: [{clauseIndex: 0, goalSpan: {text: "门现在开着吗", start: 0, end: 6},
      targetMentions: [{text: "门", start: 0, end: 1}], modifierSpans: []}], unsupportedClaims: []},
    {kind: "attempt", clauses: [{clauseIndex: 0, goalSpan: {text: "把枪拿出来", start: 9, end: 14},
      targetMentions: [{text: "枪", start: 10, end: 11}], modifierSpans: []}],
      unsupportedClaims: [{text: "抽屉里一定有枪", start: 0, end: 7}]},
    {kind: "none", clauses: [], unsupportedClaims: []},
    {kind: "wait", clauses: [{clauseIndex: 0, goalSpan: {text: "等五分钟", start: 1, end: 5},
      targetMentions: [], modifierSpans: []}], unsupportedClaims: []}
  ];
  const worldStore = new InMemoryCommitStore();
  const experienceStore = new InMemoryExperienceStore();
  const auditStore = new InMemoryAuditStore();
  let nowMs = Date.parse("2026-08-27T18:24:00.000Z");
  const session = new RuntimeSession({sessionId: "session", actorId: "self", fixture: createDemoFixture(),
    model: new QueueModel(proposals.map(encoded)), worldStore, experienceStore, auditStore,
    now: () => new Date(nowMs += 1000)});

  const opened = await session.handle("轻轻推门，只开一条缝，别出声");
  assert.deepEqual([opened.kind, opened.height], ["world", 1]);
  const query = await session.handle("门现在开着吗？");
  assert.deepEqual(query, {kind: "query", height: 1, text: "门现在开着。"});
  const gun = await session.handle("抽屉里一定有枪，我把枪拿出来");
  assert.equal(gun.kind, "boundary");
  assert.equal(gun.height, 1);
  const none = await session.handle("");
  assert.deepEqual([none.kind, none.height], ["none", 1]);
  const waited = await session.handle("我等五分钟");
  assert.deepEqual([waited.kind, waited.height], ["world", 2]);
  assert.equal(worldStore.commits.length, 2);
  assert.equal(experienceStore.commits.length, 2);
  assert.equal(auditStore.attempts.length, 5);
  assert.deepEqual(auditStore.attempts.map(item => item.status), ["committed", "boundary", "boundary", "boundary", "committed"]);
});
