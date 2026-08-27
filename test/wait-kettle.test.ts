import assert from "node:assert/strict";
import test from "node:test";
import {FakeProposalModel, requestInputProposal} from "../src/ai/model-adapter.js";
import {compileInput} from "../src/protocol/compiler.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {createKettleFixture} from "../src/world/kettle-fixture.js";
import {settleWait} from "../src/world/wait-kettle.js";

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
});

test("T02 danger interrupts Wait before the kettle transition", async () => {
  const fixture = createKettleFixture();
  const result = await settleWait(fixture.genesis, await waitInput(), "attempt-wait", new InMemoryCommitStore(),
    {interruptAt: "2026-08-27T18:26:00.000Z"}, "2026-08-27T18:26:00.000Z");
  assert.equal(result.commit.worldTimeEnd, "2026-08-27T18:26:00.000Z");
  assert.deepEqual(result.commit.delta.events.map(item => item.kind), ["danger_interrupt"]);
  assert.equal(result.snapshot.processes[0]?.revision, 1);
});
