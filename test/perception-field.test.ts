import assert from "node:assert/strict";
import test from "node:test";
import {ALLOWED_MODEL, type ModelResponse, type ProposalModel} from "../src/ai/model-adapter.js";
import {InMemoryAuditStore} from "../src/audit/attempt-audit.js";
import {RuntimeSession} from "../src/runtime/runtime-session.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";
import {projectCurrentScene} from "../src/perception/current-scene.js";

class CountingModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;
  calls = 0;
  constructor(private readonly response?: ModelResponse) {}
  async propose(): Promise<ModelResponse> {
    this.calls += 1;
    if (this.response === undefined) throw new Error("perception fast path called the model");
    return this.response;
  }
}

function sessionWith(model: ProposalModel): {session: RuntimeSession; audit: InMemoryAuditStore} {
  const audit = new InMemoryAuditStore();
  return {session: new RuntimeSession({sessionId: "perception", actorId: "self", fixture: createDemoFixture(), model,
    worldStore: new InMemoryCommitStore(), experienceStore: new InMemoryExperienceStore(), auditStore: audit,
    now: () => new Date("2026-08-27T18:24:00.000Z")}), audit};
}

test("O01 initial scene is sourced from the current H0 world", () => {
  const fixture = createDemoFixture();
  const projected = projectCurrentScene(fixture.genesis, fixture, "self", "ambient");
  assert.match(projected.text, /卧室/u);
  assert.match(projected.text, /门关着/u);
  assert.match(projected.text, /床上的毛毯/u);
  assert.equal((projected.observations[0]?.sourceFactIds.length ?? 0) >= 6, true);
});

test("O02 targetless observation variants use a zero-model zero-Height fast path", async () => {
  const model = new CountingModel();
  const {session, audit} = sessionWith(model);
  for (const input of ["看看四周", "环顾周围", "查看"]) {
    const result = await session.handle(input);
    assert.equal(result.kind, "query");
    assert.equal(result.height, 0);
    assert.match(result.text, /卧室/u);
  }
  assert.equal(model.calls, 0);
  assert.deepEqual(audit.attempts.map(item => item.status), ["constituted", "constituted", "constituted"]);
  assert.equal(audit.attempts.every(item => (item.observations?.[0]?.sourceFactIds.length ?? 0) > 0), true);
});

test("O03/O04 hearing and body scopes expose only committed fixture facts", async () => {
  const model = new CountingModel();
  const {session} = sessionWith(model);
  assert.deepEqual(await session.handle("听听四周"), {kind: "query", height: 0,
    text: "你停下来听。房间里没有明显声响。"});
  assert.deepEqual(await session.handle("感觉一下自己的身体"), {kind: "query", height: 0,
    text: "你正站着，没有感觉到疼痛。"});
  assert.equal(model.calls, 0);
});

test("directional hearing and closed-door vision use explicit scopes", async () => {
  const model = new CountingModel();
  const {session} = sessionWith(model);
  assert.deepEqual(await session.handle("听听门外"), {kind: "query", height: 0,
    text: "你朝门外听。没有听见足以辨认的声响。"});
  assert.deepEqual(await session.handle("从门缝往外看"), {kind: "query", height: 0,
    text: "门关着，你看不到门外。"});
  assert.deepEqual(await session.handle("看看门"), {kind: "query", height: 0, text: "门关着。"});
  assert.equal(model.calls, 0);
});

test("a posture-changing look is not collapsed into a pure read", async () => {
  const model = new CountingModel();
  const {session} = sessionWith(model);
  const result = await session.handle("趴下来从门缝往外看");
  assert.equal(result.kind, "boundary");
  assert.equal(result.height, 0);
  assert.equal(model.calls, 1);
});

test("ambient projection reflects a committed door change", async () => {
  const raw = "轻轻推门，只开一条缝";
  const proposal = {kind: "attempt", clauses: [{clauseIndex: 0,
    goalSpan: {text: "推门", start: 2, end: 4}, methodSpan: {text: "轻轻", start: 0, end: 2},
    targetMentions: [{text: "门", start: 3, end: 4}], modifierSpans: [{text: "一条缝", start: 7, end: 10}]}],
    unsupportedClaims: []};
  const model = new CountingModel({content: JSON.stringify(proposal)});
  const {session} = sessionWith(model);
  assert.equal((await session.handle(raw)).kind, "world");
  const observed = await session.handle("看看四周");
  assert.match(observed.text, /门开着，留下约 4 厘米的缝/u);
  assert.deepEqual(await session.handle("从门缝往外看"), {kind: "query", height: 1,
    text: "透过门缝，你能看见有光的走廊的一小部分。"});
  assert.equal(observed.height, 1);
  assert.equal(model.calls, 1);
});
