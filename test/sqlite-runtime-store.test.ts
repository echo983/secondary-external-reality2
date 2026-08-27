import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {FakeProposalModel, requestInputProposal} from "../src/ai/model-adapter.js";
import {compileInput} from "../src/protocol/compiler.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {SqliteRuntimeStore} from "../src/storage/sqlite-runtime-store.js";
import {createDoorFixture} from "../src/world/door-fixture.js";
import {settleOpenDoor} from "../src/world/open-door.js";
import {replayStrict} from "../src/world/replay.js";

async function doorSettlement() {
  const fixture = createDoorFixture();
  const raw = "轻轻推门，只开一条缝，别出声";
  const content = JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0,
    goalSpan: {text: "推门", start: 2, end: 4}, methodSpan: {text: "轻轻", start: 0, end: 2},
    targetMentions: [{text: "门", start: 3, end: 4}], modifierSpans: [{text: "一条缝", start: 7, end: 10},
      {text: "别出声", start: 11, end: 14}]}], unsupportedClaims: []});
  const input = compileInput(await requestInputProposal(new FakeProposalModel({content}), raw), raw, "self", fixture.entities);
  const result = await settleOpenDoor(fixture.genesis, input, "attempt-sqlite", new InMemoryCommitStore(),
    new InMemoryExperienceStore(), "2026-08-27T12:00:02.000Z");
  return {fixture, result};
}

test("SQLite persists world, detects pending experience, and replays after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ser-sqlite-"));
  const filename = join(directory, "runtime.sqlite");
  try {
    const {fixture, result} = await doorSettlement();
    let store = new SqliteRuntimeStore(filename);
    assert.equal(store.appendWorld(result.commit), "committed");
    assert.equal(store.appendWorld(structuredClone(result.commit)), "idempotent");
    assert.deepEqual(store.pending("self").map(item => item.height), [1]);
    store.close();

    store = new SqliteRuntimeStore(filename);
    const replayed = replayStrict(fixture.genesis, store.readWorld(1));
    assert.equal(replayed.stateRoot, result.snapshot.stateRoot);
    assert.equal(store.appendExperience(result.experience), "committed");
    assert.equal(store.appendExperience(structuredClone(result.experience)), "idempotent");
    assert.deepEqual(store.pending("self"), []);
    store.appendAttempt({attemptId: "attempt-sqlite", rawInput: {sessionId: "s", actorId: "self", text: "开门",
      receivedAt: "2026-08-27T12:00:00.000Z", language: "zh"}, status: "committed", committedHeight: 1});
    const exported = store.exportJsonl();
    assert.match(exported, /"height":1/u);
    assert.match(exported, /"experienceId":"door-demo:1:self"/u);
    assert.doesNotMatch(exported, /cftoken|Bearer|token-for/u);
    store.close();
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
