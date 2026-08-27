import assert from "node:assert/strict";
import test from "node:test";
import type {CanonicalFact, ExperienceCommit, RealityDelta, SettlementCommit, WorldBasis, WorldSnapshot} from "../src/domain/types.js";
import {canonicalJson, sha256Canonical} from "../src/protocol/canonical-json.js";
import {ProtocolError} from "../src/protocol/errors.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {computeEpistemicRoot, InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {applyCommit, computeFutureStateRoot, createGenesis} from "../src/world/materialized-world.js";
import {replayDiagnostic, replayStrict} from "../src/world/replay.js";

const basis: WorldBasis = {worldId: "world-1", schemaVersion: "1", fixtureVersion: "1", genesisHash: "genesis-1"};
const emptyDelta = (): RealityDelta => ({events: [], addFacts: [], endFactIds: [], addConstraints: [], processChanges: []});

function fact(factId: string, address: string, value: string, height: number, revision = 1): CanonicalFact {
  return {factId, address, value, status: "active", canonicalHeight: height,
    validFromWorldTime: "2026-08-27T12:00:00.000Z", sourceRef: `event-${height}`, revision};
}

function draftCommit(snapshot: WorldSnapshot, delta: RealityDelta, endTime: string): SettlementCommit {
  const draft: SettlementCommit = {
    worldBasis: basis,
    height: snapshot.height + 1,
    parentHeight: snapshot.height,
    parentStateRoot: snapshot.stateRoot,
    worldTimeStart: snapshot.worldTime,
    worldTimeEnd: endTime,
    dependencyRevisions: {},
    attemptRefs: [],
    delta,
    observationSeeds: [],
    stateRoot: "",
    committedAt: "2026-08-27T12:00:00.000Z"
  };
  return {...draft, stateRoot: computeFutureStateRoot(snapshot, draft)};
}

test("canonical JSON has a frozen Unicode and negative-zero SHA-256 vector", () => {
  const value = {"😀": true, z: -0, a: "猫"};
  assert.equal(canonicalJson(value), "{\"a\":\"猫\",\"z\":0,\"😀\":true}");
  assert.equal(sha256Canonical(value), "f4c91fc1e55c53aa8045268b77f130cd0d715bfccd77961939fa2516f7f75e8c");
});

test("C01/C06 replacing placement ends the old exclusive fact", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const first = draftCommit(genesis, {...emptyDelta(), addFacts: [fact("f1", "placement:key", "table", 1)]}, "2026-08-27T12:00:01.000Z");
  const h1 = applyCommit(genesis, first);
  const second = draftCommit(h1, {...emptyDelta(), endFactIds: ["f1"], addFacts: [fact("f2", "placement:key", "self", 2)]}, "2026-08-27T12:00:02.000Z");
  const h2 = applyCommit(h1, second);
  assert.equal(h2.facts.find(item => item.factId === "f1")?.status, "ended");
  assert.equal(h2.facts.find(item => item.factId === "f2")?.status, "active");
});

test("C06 rejects two active values at one single-value address", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const commit = {...draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z"),
    delta: {...emptyDelta(), addFacts: [fact("f1", "placement:self", "bedroom", 1), fact("f2", "placement:self", "kitchen", 1)]}};
  assert.throws(() => computeFutureStateRoot(genesis, commit),
    (error: unknown) => error instanceof ProtocolError && error.code === "REPLAY_INVALID");
});

test("C05 rejects a containment/placement cycle", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const commit = {...draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z"),
    delta: {...emptyDelta(), addFacts: [fact("f1", "placement:a", "b", 1), fact("f2", "placement:b", "a", 1)]}};
  assert.throws(() => computeFutureStateRoot(genesis, commit), (error: unknown) => error instanceof ProtocolError && error.code === "REPLAY_INVALID");
});

test("C08 commit append is idempotent and conflicting identity is rejected", async () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const commit = draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z");
  const store = new InMemoryCommitStore();
  assert.equal(await store.append(commit), "committed");
  assert.equal(await store.append(structuredClone(commit)), "idempotent");
  await assert.rejects(store.append({...commit, committedAt: "2026-08-27T12:00:02.000Z"}),
    (error: unknown) => error instanceof ProtocolError && error.code === "REVISION_CONFLICT");
});

test("height gaps and wrong parent roots are rejected by the append boundary", async () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const first = draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z");
  const h1 = applyCommit(genesis, first);
  const second = draftCommit(h1, emptyDelta(), "2026-08-27T12:00:02.000Z");
  const store = new InMemoryCommitStore();
  await store.append(first);
  await assert.rejects(store.append({...second, height: 3}),
    (error: unknown) => error instanceof ProtocolError && error.code === "REVISION_CONFLICT");
  await assert.rejects(store.append({...second, parentStateRoot: "wrong"}),
    (error: unknown) => error instanceof ProtocolError && error.code === "REVISION_CONFLICT");
});

test("F06 stale fact dependency is rejected", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const first = draftCommit(genesis, {...emptyDelta(), addFacts: [fact("f1", "door:open", "false", 1, 2)]}, "2026-08-27T12:00:01.000Z");
  const h1 = applyCommit(genesis, first);
  const second = {...draftCommit(h1, emptyDelta(), "2026-08-27T12:00:02.000Z"), dependencyRevisions: {"door:open": 1}};
  assert.throws(() => applyCommit(h1, second), (error: unknown) => error instanceof ProtocolError && error.code === "REVISION_CONFLICT");
});

test("F08 100-height replay reaches the identical state root", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const commits: SettlementCommit[] = [];
  let snapshot = genesis;
  for (let height = 1; height <= 100; height += 1) {
    const commit = draftCommit(snapshot, emptyDelta(), new Date(Date.parse(snapshot.worldTime) + 1000).toISOString());
    commits.push(commit);
    snapshot = applyCommit(snapshot, commit);
  }
  const replayed = replayStrict(genesis, commits);
  assert.equal(replayed.height, 100);
  assert.equal(replayed.stateRoot, snapshot.stateRoot);
  assert.deepEqual(replayDiagnostic(genesis, commits).issues, []);
});

test("diagnostic replay stops at corruption and reports its height", () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const commit = {...draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z"), stateRoot: "corrupt"};
  const result = replayDiagnostic(genesis, [commit]);
  assert.equal(result.snapshot.height, 0);
  assert.deepEqual(result.issues.map(issue => issue.height), [1]);
});

test("experience ledger detects a committed world height pending recovery", async () => {
  const genesis = createGenesis(basis, "2026-08-27T12:00:00.000Z");
  const worldCommit = draftCommit(genesis, emptyDelta(), "2026-08-27T12:00:01.000Z");
  worldCommit.observationSeeds = [{observerId: "self", modality: "hearing", sourceFactIds: [], sourceEventIds: [],
    perceivableFields: ["sound"], forbiddenSourceLabels: [], scope: "room", salience: 1}];
  const store = new InMemoryExperienceStore();
  assert.deepEqual(store.pending([worldCommit], "self").map(item => item.height), [1]);
  const base: Omit<ExperienceCommit, "epistemicRoot" | "committedAt"> = {
    experienceId: "world-1:1:self", sourceHeight: 1, observerId: "self", observations: [], evidence: [], acquisitions: [],
    parentEpistemicRoot: "genesis"
  };
  const experience: ExperienceCommit = {...base, epistemicRoot: computeEpistemicRoot(base), committedAt: "2026-08-27T12:00:02.000Z"};
  assert.equal(await store.append(experience), "committed");
  assert.equal(await store.append(structuredClone(experience)), "idempotent");
  assert.deepEqual(store.pending([worldCommit], "self"), []);
});
