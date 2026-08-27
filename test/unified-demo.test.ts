import assert from "node:assert/strict";
import test from "node:test";
import type {ConstitutedInput} from "../src/domain/types.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";
import {settleOpenDoor} from "../src/world/open-door.js";
import {replayStrict} from "../src/world/replay.js";
import {materializeWaitExperience, settleWait} from "../src/world/wait-kettle.js";

test("one world composes door H1 and kettle Wait H2 with continuous roots", async () => {
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const experience = new InMemoryExperienceStore();
  const open: ConstitutedInput = {kind: "attempt", actorId: "self", unsupportedClaims: [], clauses: [{clauseIndex: 0,
    operation: "open", goal: "推门", method: "轻轻", targetIds: ["door-1"],
    modifiers: {speed: "slow", apertureCm: 4, noisePolicy: "minimize"}}]};
  const h1 = await settleOpenDoor(fixture.genesis, open, "attempt-1", world, experience, "2026-08-27T18:24:02.000Z");
  const wait: ConstitutedInput = {kind: "wait", actorId: "self", unsupportedClaims: [], clauses: [{clauseIndex: 0,
    operation: "wait", goal: "等五分钟", method: "等五分钟", targetIds: [], modifiers: {durationSeconds: 300}}]};
  const h2 = await settleWait(h1.snapshot, wait, "attempt-2", world, {}, "2026-08-27T18:29:02.000Z");
  const h2Experience = await materializeWaitExperience(h2.commit, experience, "2026-08-27T18:29:03.000Z");
  assert.equal(h2.commit.height, 2);
  assert.equal(h2Experience.experience.parentEpistemicRoot, h1.experience.epistemicRoot);
  assert.equal(replayStrict(fixture.genesis, world.commits).stateRoot, h2.snapshot.stateRoot);
  assert.deepEqual(world.commits.map(commit => commit.height), [1, 2]);
});
