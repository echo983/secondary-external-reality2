import assert from "node:assert/strict";
import test from "node:test";
import {FakeProposalModel, requestInputProposal} from "../src/ai/model-adapter.js";
import {compileInput} from "../src/protocol/compiler.js";
import {renderWaitPacket} from "../src/presentation/deterministic-renderer.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createKettleFixture} from "../src/world/kettle-fixture.js";
import {materializeWaitExperience, settleWait} from "../src/world/wait-kettle.js";

async function waitInput() {
  const raw = "我等五分钟";
  const content = JSON.stringify({kind: "wait", clauses: [{clauseIndex: 0,
    goalSpan: {text: "等五分钟", start: 1, end: 5}, targetMentions: [], modifierSpans: []}], unsupportedClaims: []});
  return compileInput(await requestInputProposal(new FakeProposalModel({content}), raw), raw, "self", []);
}

test("V2/T01 Wait advances five minutes and settles kettle at its due instant", async () => {
  const fixture = createKettleFixture();
  const result = await settleWait(fixture.genesis, await waitInput(), "attempt-wait", new InMemoryCommitStore(), {},
    "2026-08-27T18:29:00.000Z");
  assert.equal(result.commit.worldTimeEnd, "2026-08-27T18:29:00.000Z");
  assert.deepEqual(result.commit.delta.events.map(item => [item.kind, item.worldTime]), [
    ["kettle_boiling", "2026-08-27T18:27:00.000Z"],
    ["kettle_whistle", "2026-08-27T18:27:00.000Z"]
  ]);
  assert.equal(result.snapshot.facts.find(item => item.address === "kettle:kettle-1:state" && item.status === "active")?.value, "boiling");
  assert.equal(result.commit.observationSeeds[0]?.modality, "hearing");
  assert.deepEqual(result.commit.observationSeeds[0]?.forbiddenSourceLabels, ["temperature"]);
  const experienceStore = new InMemoryExperienceStore();
  const materialized = await materializeWaitExperience(result.commit, experienceStore, "2026-08-27T18:29:01.000Z");
  assert.deepEqual(materialized.experience.observations[0]?.content, {sound: "whistle"});
  assert.equal(Object.hasOwn(materialized.experience.observations[0]?.content ?? {}, "temperature"), false);
  assert.equal(renderWaitPacket(materialized.packet), "水壶发出了持续的鸣笛声。");
  const recoveryStore = new InMemoryExperienceStore();
  const recovered = await materializeWaitExperience(result.commit, recoveryStore, "2026-08-27T18:29:02.000Z");
  assert.equal(recovered.experience.epistemicRoot, materialized.experience.epistemicRoot);
});

test("T02 danger interrupts Wait before the kettle transition", async () => {
  const fixture = createKettleFixture();
  const result = await settleWait(fixture.genesis, await waitInput(), "attempt-wait", new InMemoryCommitStore(),
    {interruptAt: "2026-08-27T18:26:00.000Z"}, "2026-08-27T18:26:00.000Z");
  assert.equal(result.commit.worldTimeEnd, "2026-08-27T18:26:00.000Z");
  assert.deepEqual(result.commit.delta.events.map(item => item.kind), ["danger_interrupt"]);
  assert.equal(result.snapshot.processes[0]?.revision, 1);
  const materialized = await materializeWaitExperience(result.commit, new InMemoryExperienceStore());
  assert.equal(renderWaitPacket(materialized.packet), "一声突发的警示打断了等待。");
});

test("a later Wait still creates a sourced elapsed-time experience", async () => {
  const fixture = createKettleFixture();
  const store = new InMemoryCommitStore();
  const first = await settleWait(fixture.genesis, await waitInput(), "wait-1", store);
  const second = await settleWait(first.snapshot, await waitInput(), "wait-2", store);
  assert.deepEqual(second.commit.delta.events.map(item => item.kind), ["wait_elapsed"]);
  const projected = await materializeWaitExperience(second.commit, new InMemoryExperienceStore());
  assert.deepEqual(projected.experience.observations[0]?.content, {elapsedSeconds: 300});
  assert.equal(renderWaitPacket(projected.packet), "等待结束了；大约过去了 300 秒。");
});
