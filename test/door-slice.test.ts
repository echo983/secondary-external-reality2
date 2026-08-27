import assert from "node:assert/strict";
import test from "node:test";
import {FakeProposalModel, requestInputProposal} from "../src/ai/model-adapter.js";
import {renderApprovedPacket} from "../src/presentation/deterministic-renderer.js";
import {compileInput} from "../src/protocol/compiler.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDoorFixture} from "../src/world/door-fixture.js";
import {materializeDoorExperience, settleOpenDoor} from "../src/world/open-door.js";
import {replayStrict} from "../src/world/replay.js";

test("V1/I02 slow quiet slit opening completes Commit to Observation", async () => {
  const raw = "轻轻推门，只开一条缝，别出声";
  const content = JSON.stringify({
    kind: "attempt",
    clauses: [{
      clauseIndex: 0,
      goalSpan: {text: "轻轻推门，只开一条缝", start: 0, end: 10},
      methodSpan: {text: "轻轻", start: 0, end: 2},
      targetMentions: [{text: "门", start: 3, end: 4}],
      modifierSpans: [
        {text: "轻轻", start: 0, end: 2},
        {text: "一条缝", start: 7, end: 10},
        {text: "别出声", start: 11, end: 14}
      ]
    }],
    unsupportedClaims: []
  });
  const fixture = createDoorFixture();
  const proposal = await requestInputProposal(new FakeProposalModel({content}), raw);
  const constituted = compileInput(proposal, raw, "self", fixture.entities);
  assert.deepEqual(constituted.clauses[0]?.modifiers, {speed: "slow", apertureCm: 4, noisePolicy: "minimize"});
  assert.deepEqual(constituted.clauses[0]?.targetIds, ["door-1"]);

  const commits = new InMemoryCommitStore();
  const experiences = new InMemoryExperienceStore();
  const result = await settleOpenDoor(fixture.genesis, constituted, "attempt-1", commits, experiences,
    "2026-08-27T12:00:02.000Z");

  assert.equal(result.commit.height, 1);
  assert.equal(result.commit.delta.events[0]?.kind, "door_opened");
  assert.equal(result.snapshot.facts.find(fact => fact.address === "door:door-1:aperture_cm" && fact.status === "active")?.value, 4);
  assert.deepEqual(result.experience.observations.map(item => item.modality), ["vision", "hearing", "touch"]);
  assert.equal(result.experience.observations.some(item => Object.values(item.content).includes("Bob")), false);
  assert.equal(renderApprovedPacket(result.packet), "门缓慢地移开，留下约 4 厘米的缝；铰链发出一声很轻的摩擦声。");
  assert.equal(replayStrict(fixture.genesis, commits.commits).stateRoot, result.snapshot.stateRoot);

  const recoveredStore = new InMemoryExperienceStore();
  assert.deepEqual(recoveredStore.pending(commits.commits, "self").map(item => item.height), [1]);
  const recovered = await materializeDoorExperience(result.commit, recoveredStore, "2026-08-27T12:00:03.000Z");
  assert.equal(recovered.experience.epistemicRoot, result.experience.epistemicRoot);
  assert.deepEqual(recoveredStore.pending(commits.commits, "self"), []);
});

test("observation seed cannot cite an uncommitted hidden source", async () => {
  const fixture = createDoorFixture();
  const raw = "推门";
  const content = JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0,
    goalSpan: {text: raw, start: 0, end: 2}, targetMentions: [{text: "门", start: 1, end: 2}], modifierSpans: []}], unsupportedClaims: []});
  const proposal = await requestInputProposal(new FakeProposalModel({content}), raw);
  const constituted = compileInput(proposal, raw, "self", fixture.entities);
  const result = await settleOpenDoor(fixture.genesis, constituted, "attempt-1", new InMemoryCommitStore(),
    new InMemoryExperienceStore(), "2026-08-27T12:00:02.000Z");
  const corrupt = {...result.commit, observationSeeds: [{...result.commit.observationSeeds[0]!, sourceEventIds: ["hidden-bob"]}]};
  assert.throws(() => replayStrict(fixture.genesis, [corrupt]), /uncommitted source/u);
});
