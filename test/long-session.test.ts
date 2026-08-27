import assert from "node:assert/strict";
import test from "node:test";
import {LocalDemoProposalModel} from "../src/ai/local-demo-model.js";
import {InMemoryAuditStore} from "../src/audit/attempt-audit.js";
import {RuntimeSession} from "../src/runtime/runtime-session.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";
import {replayStrict} from "../src/world/replay.js";

test("30-Height mixed session preserves roots and keeps read/boundary inputs height-pure", async () => {
  const fixture = createDemoFixture();
  const world = new InMemoryCommitStore();
  const experience = new InMemoryExperienceStore();
  const audit = new InMemoryAuditStore();
  const session = new RuntimeSession({sessionId: "long", actorId: "self", fixture,
    model: new LocalDemoProposalModel(), worldStore: world, experienceStore: experience, auditStore: audit,
    now: () => new Date("2026-08-27T18:24:00.000Z")});
  await session.handle("轻轻推门，只开一条缝，别出声");
  for (let index = 0; index < 29; index += 1) await session.handle("我等1分钟");
  assert.equal(session.currentSnapshot().height, 30);
  assert.equal(world.commits.length, 30);
  assert.equal(experience.commits.length, 30);
  const before = session.currentSnapshot().stateRoot;
  assert.equal((await session.handle("门现在开着吗？")).height, 30);
  assert.equal((await session.handle("抽屉里一定有枪，我把枪拿出来")).height, 30);
  assert.equal((await session.handle("")).height, 30);
  assert.equal(session.currentSnapshot().stateRoot, before);
  assert.equal(replayStrict(fixture.genesis, world.commits).stateRoot, before);
});
