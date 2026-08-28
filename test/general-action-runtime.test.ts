import assert from "node:assert/strict";
import test from "node:test";
import {ALLOWED_MODEL, type ModelResponse, type ProposalModel} from "../src/ai/model-adapter.js";
import {InMemoryAuditStore} from "../src/audit/attempt-audit.js";
import {RuntimeSession} from "../src/runtime/runtime-session.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";
import {buildActionScene} from "../src/world/action-scene.js";
import {constitutePrimitiveAction} from "../src/protocol/primitive-action.js";
import type {ActionProposal} from "../src/protocol/action-proposal.js";
import {ProtocolError} from "../src/protocol/errors.js";
import {LocalDemoProposalModel} from "../src/ai/local-demo-model.js";
import {replayStrict} from "../src/world/replay.js";

test("runtime action scene exposes opaque grounded slots and declared affordances", () => {
  const fixture = createDemoFixture();
  const scene = buildActionScene(fixture.genesis, fixture, "self");
  assert.equal(scene.context.actorSlot, "actor");
  assert.equal(scene.context.slots.some(slot => slot.slot.includes("door-1")), false);
  assert.equal(scene.context.slots.some(slot => /走廊/u.test(slot.label)), false);
  const door = scene.context.slots.find(slot => /门/u.test(slot.label));
  assert.equal(door?.affordances.includes("relation:open"), true);
});

test("trusted primitive constitution rejects effects unsupported by target affordance", () => {
  const fixture = createDemoFixture();
  const scene = buildActionScene(fixture.genesis, fixture, "self");
  const bed = scene.context.slots.find(slot => /床/u.test(slot.label))?.slot as string;
  const proposal: ActionProposal = {kind: "attempt", clauseIndex: 0,
    primitives: ["contact", "apply_force", "change_relation"], targetSlots: [bed], conditions: [],
    effects: [{kind: "relation", subjectSlot: bed, field: "open", value: true, certainty: "possible"}],
    perceptionScopes: [], unresolvedDependencies: []};
  assert.throws(() => constitutePrimitiveAction(proposal, "self", scene.context.slots, scene.entityBySlot),
    error => error instanceof ProtocolError && error.code === "CAPABILITY_UNSUPPORTED");
});

class UnifiedModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;
  legacyCalls = 0;
  actionCalls = 0;
  async propose(): Promise<ModelResponse> { this.legacyCalls += 1; throw new Error("legacy path must not run"); }
  async proposeAction(_input: string, clauseIndex: number, context: import("../src/protocol/action-proposal.js").ActionContext): Promise<ModelResponse> {
    this.actionCalls += 1;
    const door = context.slots.find(slot => /门/u.test(slot.label))?.slot as string;
    return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "apply_force", "change_relation"],
      targetSlots: [door], conditions: [], effects: [
        {kind: "force", subjectSlot: "actor", field: "toward", objectSlot: door, certainty: "possible"},
        {kind: "relation", subjectSlot: door, field: "open", value: true, certainty: "possible"}],
      perceptionScopes: [], unresolvedDependencies: []})};
  }
}

test("normal action uses one unified proposal call and commits only after trusted validation", async () => {
  const model = new UnifiedModel();
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const session = new RuntimeSession({sessionId: "unified", actorId: "self", fixture, model, worldStore: world,
    experienceStore: new InMemoryExperienceStore(), auditStore: new InMemoryAuditStore(),
    now: () => new Date("2026-08-28T12:00:00.000Z")});
  const result = await session.handle("用肩膀顶开门");
  assert.deepEqual([result.kind, result.height], ["world", 1]);
  assert.equal(model.actionCalls, 1);
  assert.equal(model.legacyCalls, 0);
  assert.equal(world.commits[0]?.delta.events[0]?.kind, "door_opened");
});

test("hold, place, move, and communicate compose through generic world commits", async () => {
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const experience = new InMemoryExperienceStore();
  const session = new RuntimeSession({sessionId: "primitive-sequence", actorId: "self", fixture,
    model: new LocalDemoProposalModel(), worldStore: world, experienceStore: experience,
    auditStore: new InMemoryAuditStore(), now: () => new Date("2026-08-28T12:00:00.000Z")});
  assert.match((await session.handle("拿起毛毯")).text, /拿起了毛毯/u);
  assert.equal(session.currentSnapshot().facts.find(fact => fact.address === "placement:blanket-1" && fact.status === "active")?.value, "self");
  assert.match((await session.handle("松开毛毯")).text, /松开了毛毯/u);
  await session.handle("拿起毛毯");
  assert.match((await session.handle("把毛毯放到床上")).text, /放到了床上/u);
  const impossible = await session.handle("把毛毯放到床上");
  assert.equal(impossible.kind, "boundary");
  if (impossible.kind === "boundary") assert.equal(impossible.code, "PRECONDITION_FAILED");
  assert.equal(session.currentSnapshot().height, 4);
  assert.match((await session.handle("转身面向门")).text, /面向门/u);
  await session.handle("推开门");
  assert.match((await session.handle("穿过门去走廊")).text, /来到走廊/u);
  assert.match((await session.handle("看看四周")).text, /有光的走廊/u);
  assert.match((await session.handle("喊一声有人吗")).text, /有人吗/u);
  assert.equal(session.currentSnapshot().height, 8);
  assert.equal(world.commits.length, 8);
  assert.equal(experience.commits.length, 8);
  assert.deepEqual(world.commits.slice(0, 5).map(commit => commit.delta.events[0]?.kind),
    ["object_held", "object_released", "object_held", "object_placed", "actor_oriented"]);
  assert.deepEqual(world.commits.slice(6).map(commit => commit.delta.events[0]?.kind), ["actor_moved", "speech"]);
});

test("one input can settle an ordered hold then place sequence", async () => {
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const session = new RuntimeSession({sessionId: "composed", actorId: "self", fixture,
    model: new LocalDemoProposalModel(), worldStore: world, experienceStore: new InMemoryExperienceStore(),
    auditStore: new InMemoryAuditStore(), now: () => new Date("2026-08-28T12:00:00.000Z")});
  const result = await session.handle("拿起毛毯再放到床上");
  assert.equal(result.kind, "world");
  assert.equal(result.height, 2);
  assert.match(result.text, /拿起了毛毯.*放到了床上/u);
  assert.deepEqual(world.commits.map(commit => commit.delta.events[0]?.kind), ["object_held", "object_placed"]);
  assert.equal(world.commits[0]?.attemptRefs[0], world.commits[1]?.attemptRefs[0]);
});

test("approaching an object preserves room placement and location queries remain valid", async () => {
  const fixture = createDemoFixture();
  const session = new RuntimeSession({sessionId: "approach", actorId: "self", fixture,
    model: new LocalDemoProposalModel(), worldStore: new InMemoryCommitStore(), experienceStore: new InMemoryExperienceStore(),
    auditStore: new InMemoryAuditStore(), now: () => new Date("2026-08-28T12:00:00.000Z")});
  assert.match((await session.handle("走到门前去")).text, /走到门前/u);
  assert.equal(session.currentSnapshot().facts.find(fact => fact.address === "placement:self" && fact.status === "active")?.value, "bedroom");
  assert.match((await session.handle("我在哪里")).text, /卧室.*门前/u);
  assert.match((await session.handle("看看我的位置")).text, /卧室.*门前/u);
});

test("drag and occluding placement are distinct generic object relations", async () => {
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const session = new RuntimeSession({sessionId: "occlusion", actorId: "self", fixture,
    model: new LocalDemoProposalModel(), worldStore: world, experienceStore: new InMemoryExperienceStore(),
    auditStore: new InMemoryAuditStore(), now: () => new Date("2026-08-28T12:00:00.000Z")});
  assert.match((await session.handle("把毛毯拖到门边")).text, /拖到了门边/u);
  assert.equal(session.currentSnapshot().facts.some(fact => fact.address === "relation:blanket-1:occludes:door-1" && fact.status === "active"), false);
  await session.handle("拿起毛毯");
  const beforePlacement = session.currentSnapshot().height;
  assert.match((await session.handle("用毛毯堵住门")).text, /放到/u);
  assert.equal(session.currentSnapshot().height, beforePlacement + 1, "an already-held blanket must not create a redundant hold commit");
  const collapseCommits = world.commits.filter(commit => (commit.collapseRecords?.length ?? 0) > 0);
  assert.equal(collapseCommits.length, 1);
  assert.equal(collapseCommits[0]?.collapseRecords?.[0]?.address, "fit:blanket-1:under_gap:door-1");
  assert.equal(collapseCommits[0]?.delta.truthCellChanges?.[0]?.next.resolvedValue, true);
  assert.equal(session.currentSnapshot().truthCells[0]?.resolvedValue, true);
  assert.equal(replayStrict(fixture.genesis, world.commits).stateRoot, session.currentSnapshot().stateRoot);
  assert.equal(session.currentSnapshot().facts.some(fact => fact.address === "relation:blanket-1:occludes:door-1" && fact.status === "active"), true);
  await session.handle("推开门");
  assert.match((await session.handle("从门缝往外看")).text, /毛毯挡在门缝处/u);
  await session.handle("拿起毛毯");
  assert.match((await session.handle("从门缝往外看")).text, /有光的走廊/u);
  assert.equal(world.commits.filter(commit => (commit.collapseRecords?.length ?? 0) > 0).length, 1);
});
