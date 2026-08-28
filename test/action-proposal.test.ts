import assert from "node:assert/strict";
import test from "node:test";
import {parseActionProposal, resolvePerceptionScope, type ActionContext} from "../src/protocol/action-proposal.js";
import {ProtocolError} from "../src/protocol/errors.js";

const context: ActionContext = {
  actorSlot: "actor",
  slots: [
    {slot: "actor", kind: "actor", label: "你", perceivable: true,
      affordances: ["perceive", "orient", "move", "contact", "apply_force", "hold", "communicate"]},
    {slot: "room", kind: "space", label: "卧室", perceivable: true, affordances: ["contains"]},
    {slot: "door", kind: "object", label: "门", perceivable: true,
      affordances: ["contact", "apply_force", "openable", "occludes"]},
    {slot: "blanket", kind: "object", label: "毛毯", perceivable: true,
      affordances: ["hold", "move", "deformable"]}
  ],
  allowedRelations: ["open", "held_by", "placed_at", "occludes"]
};

function base(rawInput: string): Record<string, unknown> {
  void rawInput;
  return {kind: "attempt", clauseIndex: 0, primitives: [], targetSlots: [], conditions: [], effects: [], perceptionScopes: [],
    unresolvedDependencies: []};
}

function parse(rawInput: string, overrides: Record<string, unknown>): ReturnType<typeof parseActionProposal> {
  return parseActionProposal({...base(rawInput), ...overrides}, rawInput, context);
}

function expectInvalid(rawInput: string, overrides: Record<string, unknown>): void {
  assert.throws(() => parse(rawInput, overrides), error => error instanceof ProtocolError && error.code === "MODEL_INVALID_SCHEMA");
}

test("O01-O10 and Phase 8A offline action proposal corpus", async t => {
  await t.test("01 ambient look has an actor scope and no fabricated target", () => {
    const proposal = parse("看看四周", {primitives: ["perceive"], perceptionScopes: [
      {modality: "vision", originSlot: "actor", horizon: "ambient", targetSlots: []}
    ], effects: [{kind: "observation_scope", subjectSlot: "actor", field: "vision", certainty: "required"}]});
    assert.deepEqual(resolvePerceptionScope(proposal, context)?.targetSlots, []);
  });
  await t.test("02 listening outside uses a directional hearing scope", () => {
    const proposal = parse("听听门外", {primitives: ["orient", "perceive"], targetSlots: ["door"],
    perceptionScopes: [{modality: "hearing", originSlot: "actor", horizon: "directional", targetSlots: ["door"]}],
    effects: [{kind: "observation_scope", subjectSlot: "actor", field: "hearing", certainty: "required"}]});
    assert.deepEqual(proposal.primitives, ["orient", "perceive"]);
  });
  await t.test("03 body sensing needs no external entity", () => {
    const proposal = parse("感觉一下自己的身体", {primitives: ["perceive"], perceptionScopes: [
      {modality: "interoception", originSlot: "actor", horizon: "body", targetSlots: ["actor"]}
    ], effects: [{kind: "observation_scope", subjectSlot: "actor", field: "interoception", certainty: "required"}]});
    assert.equal(proposal.perceptionScopes[0]?.horizon, "body");
  });
  await t.test("04 pushing maps to contact and force rather than an open verb", () => {
    const raw = "用手推门";
    const proposal = parse(raw, {primitives: ["contact", "apply_force", "change_relation"],
      targetSlots: ["door"],
      effects: [{kind: "force", subjectSlot: "actor", field: "toward", objectSlot: "door", certainty: "possible"},
        {kind: "relation", subjectSlot: "door", field: "open", value: true, certainty: "possible"}]});
    assert.equal(proposal.primitives.includes("apply_force"), true);
  });
  await t.test("05 shoulder push shares the same primitives", () => {
    const raw = "用肩膀抵着门向前挤";
    const proposal = parse(raw, {primitives: ["contact", "apply_force", "change_relation"],
      targetSlots: ["door"],
      effects: [{kind: "force", subjectSlot: "actor", field: "toward", objectSlot: "door", certainty: "possible"},
        {kind: "relation", subjectSlot: "door", field: "open", value: true, certainty: "possible"}]});
    assert.deepEqual(proposal.primitives, ["contact", "apply_force", "change_relation"]);
  });
  await t.test("06 crouch and peer preserves ordered primitive composition", () => {
    const raw = "趴下来从门缝往外看";
    const proposal = parse(raw, {primitives: ["move", "orient", "perceive"],
      targetSlots: ["door"],
      effects: [{kind: "placement", subjectSlot: "actor", field: "posture", value: "prone", certainty: "possible"},
        {kind: "observation_scope", subjectSlot: "actor", field: "vision", certainty: "required"}],
      perceptionScopes: [{modality: "vision", originSlot: "actor", horizon: "directional", targetSlots: ["door"]}]});
    assert.deepEqual(proposal.primitives, ["move", "orient", "perceive"]);
  });
  await t.test("07 blanket action composes hold place and relation", () => {
    const raw = "把毛毯卷起来塞到门缝下面";
    const proposal = parse(raw, {primitives: ["hold", "place", "change_relation"], targetSlots: ["blanket", "door"],
    effects: [{kind: "holding", subjectSlot: "blanket", field: "held_by", objectSlot: "actor", certainty: "possible"},
      {kind: "relation", subjectSlot: "blanket", field: "occludes", objectSlot: "door", certainty: "possible"}]});
    assert.equal(proposal.effects.length, 2);
  });
  await t.test("08 speech emits a candidate signal without deciding a response", () => {
    const proposal = parse("我喊一声有人吗", {primitives: ["communicate"],
      effects: [{kind: "signal", subjectSlot: "actor", field: "speech", value: "有人吗", certainty: "possible"}]});
    assert.equal(proposal.effects[0]?.kind, "signal");
  });
  await t.test("09 wait requires and preserves bounded duration", () => {
    const proposal = parse("等十秒", {primitives: ["wait"], durationSeconds: 10,
      effects: [{kind: "time", subjectSlot: "actor", field: "elapsed", value: 10, certainty: "possible"}]});
    assert.equal(proposal.durationSeconds, 10);
  });
  await t.test("10 uncertainty is represented as a dependency rather than a guessed fact", () => {
    const proposal = parse("试着抬起毛毯", {primitives: ["hold"], unresolvedDependencies: [
      {kind: "capability", slot: "blanket", reason: "重量没有提供"}
    ], effects: [{kind: "holding", subjectSlot: "blanket", field: "held_by", objectSlot: "actor", certainty: "possible"}]});
    assert.equal(proposal.unresolvedDependencies[0]?.kind, "capability");
  });
  await t.test("11 unknown top-level fields fail closed", () => expectInvalid("看看", {success: true}));
  await t.test("12 target slots must be an array", () => expectInvalid("推门", {targetSlots: "door"}));
  await t.test("13 canonical or invented slots fail closed", () => expectInvalid("拿胶带", {
    primitives: ["hold"], targetSlots: ["entity:tape-1"]
  }));
  await t.test("14 unknown primitives fail closed", () => expectInvalid("踢门", {primitives: ["kick"]}));
  await t.test("15 effects need a matching primitive", () => expectInvalid("门开了", {effects: [
    {kind: "relation", subjectSlot: "door", field: "open", value: true, certainty: "possible"}
  ]}));
  await t.test("16 model cannot require a world-changing effect", () => expectInvalid("我把门推开", {
    primitives: ["change_relation"], effects: [
      {kind: "relation", subjectSlot: "door", field: "open", value: true, certainty: "required"}
    ]
  }));
  await t.test("17 relation effects stay inside the trusted vocabulary", () => expectInvalid("我拥有这扇门", {
    primitives: ["change_relation"], effects: [
      {kind: "relation", subjectSlot: "actor", field: "owns", objectSlot: "door", certainty: "possible"}
    ]
  }));
  await t.test("18 perceive cannot omit its scope", () => expectInvalid("看看", {primitives: ["perceive"]}));
  await t.test("19 ambient perception cannot invent a target", () => expectInvalid("看看四周", {primitives: ["perceive"],
    perceptionScopes: [{modality: "vision", originSlot: "actor", horizon: "ambient", targetSlots: ["door"]}],
    effects: [{kind: "observation_scope", subjectSlot: "actor", field: "vision", certainty: "required"}]
  }));
  await t.test("20 wait cannot smuggle an unbounded duration", () => expectInvalid("一直等", {
    primitives: ["wait"], durationSeconds: 999999,
    effects: [{kind: "time", subjectSlot: "actor", field: "elapsed", value: 999999, certainty: "possible"}]
  }));
});
