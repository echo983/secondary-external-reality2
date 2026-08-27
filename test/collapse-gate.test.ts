import assert from "node:assert/strict";
import test from "node:test";
import {FakeProposalModel} from "../src/ai/model-adapter.js";
import {InMemoryAuditStore, type RawInput} from "../src/audit/attempt-audit.js";
import {authorizeCollapse, collapseNeeded} from "../src/protocol/collapse-policy.js";
import {constituteAndScreen, screenGroundedPrefix} from "../src/protocol/grounding-gate.js";
import {ProtocolError} from "../src/protocol/errors.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import type {FixtureEntity} from "../src/world/door-fixture.js";

test("V3/L06 unsupported gun claim stops at grounding with zero Height and zero Canon", async () => {
  const text = "抽屉里一定有枪，我把枪拿出来";
  const content = JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0,
    goalSpan: {text: "把枪拿出来", start: 9, end: 14}, targetMentions: [{text: "枪", start: 10, end: 11}], modifierSpans: []}],
    unsupportedClaims: [{text: "抽屉里一定有枪", start: 0, end: 7}]});
  const rawInput: RawInput = {sessionId: "s", actorId: "self", text, receivedAt: "2026-08-27T12:00:00Z", language: "zh"};
  const auditStore = new InMemoryAuditStore();
  const commitStore = new InMemoryCommitStore();
  const result = await constituteAndScreen(rawInput, new FakeProposalModel({content}), [], auditStore);
  assert.equal(result.decision?.boundaryCode, "TARGET_UNGROUNDED");
  assert.deepEqual(result.decision?.executablePrefix, []);
  assert.equal(result.heightCreated, false);
  assert.equal(result.audit.status, "boundary");
  assert.equal(commitStore.commits.length, 0);
});

test("conditional sequence preserves a grounded prefix but never grounds the gun suffix", () => {
  const entities: FixtureEntity[] = [{entityId: "drawer-1", kind: "door", aliases: ["抽屉"], perceivableBy: ["self"]}];
  const decision = screenGroundedPrefix({kind: "attempt", unsupportedClaims: [], clauses: [
    {clauseIndex: 0, goalSpan: {text: "打开抽屉", start: 0, end: 4}, targetMentions: [{text: "抽屉", start: 2, end: 4}], modifierSpans: []},
    {clauseIndex: 1, goalSpan: {text: "拿枪", start: 8, end: 10}, targetMentions: [{text: "枪", start: 9, end: 10}], modifierSpans: [], conditionalOn: 0}
  ]}, "self", entities);
  assert.deepEqual(decision, {executablePrefix: [0], stoppedAtClause: 1, boundaryCode: "TARGET_UNGROUNDED"});
});

test("L01/L05 non-blocking or high-radius questions cannot Collapse", () => {
  assert.equal(collapseNeeded(false), false);
  assert.throws(() => authorizeCollapse({address: "door:color", blockingReason: "completeness", requestedConstraintKind: "in",
    allowedDomain: ["red", "blue"], dependencySource: "player-claim", radius: "local"}, []),
  (error: unknown) => error instanceof ProtocolError && error.code === "COLLAPSE_NOT_AUTHORIZED");
  assert.throws(() => authorizeCollapse({address: "person:family", blockingReason: "drama", requestedConstraintKind: "exists",
    allowedDomain: [true, false], dependencySource: "world-rule", radius: "persistent"}, []),
  (error: unknown) => error instanceof ProtocolError && error.code === "COLLAPSE_NOT_AUTHORIZED");
});

test("registered local finite-domain dependency is the only accepted Collapse shape", () => {
  const request = {address: "surface:step:load_band", blockingReason: "stepping requires a load band",
    requestedConstraintKind: "in", allowedDomain: ["low", "medium", "high"], dependencySource: "operation-contract", radius: "local"};
  assert.equal(authorizeCollapse(request, [{address: request.address, allowedDomain: request.allowedDomain, radius: "local"}]).address,
    "surface:step:load_band");
  assert.throws(() => authorizeCollapse({...request, inventedHistory: true},
    [{address: request.address, allowedDomain: request.allowedDomain, radius: "local"}]), /unknown or missing/u);
});
