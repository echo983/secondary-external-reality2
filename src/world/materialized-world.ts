import type {
  CanonicalFact, ProcessState, SettlementCommit, TruthCell, WorldBasis, WorldSnapshot
} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {sha256Canonical} from "../protocol/canonical-json.js";

function byId<T>(values: readonly T[], id: (value: T) => string): T[] {
  return [...values].sort((a, b) => {
    const left = Array.from(id(a), character => character.codePointAt(0) as number);
    const right = Array.from(id(b), character => character.codePointAt(0) as number);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number);
    }
    return left.length - right.length;
  });
}

function statePayload(snapshot: Omit<WorldSnapshot, "stateRoot">): unknown {
  return {
    worldBasis: snapshot.worldBasis,
    height: snapshot.height,
    worldTime: snapshot.worldTime,
    facts: byId(snapshot.facts, fact => fact.factId),
    constraints: byId(snapshot.constraints, constraint => constraint.constraintId),
    events: byId(snapshot.events, event => event.eventId),
    processes: byId(snapshot.processes, process => process.processId),
    truthCells: byId(snapshot.truthCells, cell => cell.address)
  };
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new ProtocolError("REPLAY_INVALID", `duplicate ${label}`);
}

function validatePlacementAcyclic(facts: readonly CanonicalFact[]): void {
  const parent = new Map<string, string>();
  for (const fact of facts) {
    if (fact.status !== "active" || !fact.address.startsWith("placement:")) continue;
    if (typeof fact.value !== "string") throw new ProtocolError("REPLAY_INVALID", "placement value must be an entity/location id");
    const child = fact.address.slice("placement:".length);
    parent.set(child, fact.value);
  }
  for (const child of parent.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = child;
    while (cursor !== undefined) {
      if (visited.has(cursor)) throw new ProtocolError("REPLAY_INVALID", "placement cycle");
      visited.add(cursor);
      cursor = parent.get(cursor);
    }
  }
}

function validateWorld(
  facts: readonly CanonicalFact[],
  processes: readonly ProcessState[],
  constraintIds: readonly string[],
  eventIds: readonly string[]
  , truthCells: readonly TruthCell[]
): void {
  assertUnique(facts.map(fact => fact.factId), "fact id");
  assertUnique(processes.map(process => process.processId), "process id");
  assertUnique(constraintIds, "constraint id");
  assertUnique(eventIds, "event id");
  assertUnique(truthCells.map(cell => cell.address), "truth cell address");
  for (const cell of truthCells) {
    if (cell.revision < 1) throw new ProtocolError("REPLAY_INVALID", "truth cell revision is invalid");
    if (Array.isArray(cell.domain) && cell.resolvedValue !== undefined && !cell.domain.includes(cell.resolvedValue)) {
      throw new ProtocolError("REPLAY_INVALID", "truth cell value is outside its domain");
    }
  }
  const activeAddresses = facts.filter(fact => fact.status === "active").map(fact => fact.address);
  assertUnique(activeAddresses, "active single-value address");
  validatePlacementAcyclic(facts);
}

export function createGenesis(
  worldBasis: WorldBasis,
  worldTime: string,
  initial: Partial<Pick<WorldSnapshot, "facts" | "constraints" | "events" | "processes" | "truthCells">> = {}
): WorldSnapshot {
  const withoutRoot = {
    worldBasis,
    height: 0,
    worldTime,
    facts: initial.facts ?? [],
    constraints: initial.constraints ?? [],
    events: initial.events ?? [],
    processes: initial.processes ?? [],
    truthCells: initial.truthCells ?? []
  };
  validateWorld(withoutRoot.facts, withoutRoot.processes,
    withoutRoot.constraints.map(item => item.constraintId), withoutRoot.events.map(item => item.eventId), withoutRoot.truthCells);
  return {...withoutRoot, stateRoot: sha256Canonical(statePayload(withoutRoot))};
}

function apply(snapshot: WorldSnapshot, commit: SettlementCommit, verifyRoot: boolean): WorldSnapshot {
  if (commit.worldBasis.worldId !== snapshot.worldBasis.worldId ||
      commit.worldBasis.schemaVersion !== snapshot.worldBasis.schemaVersion ||
      commit.worldBasis.fixtureVersion !== snapshot.worldBasis.fixtureVersion ||
      commit.worldBasis.genesisHash !== snapshot.worldBasis.genesisHash) {
    throw new ProtocolError("REPLAY_INVALID", "world basis mismatch");
  }
  if (commit.parentHeight !== snapshot.height || commit.height !== snapshot.height + 1 ||
      commit.parentStateRoot !== snapshot.stateRoot) {
    throw new ProtocolError("REPLAY_INVALID", "height, parent, or state root is discontinuous");
  }
  const start = Date.parse(commit.worldTimeStart);
  const end = Date.parse(commit.worldTimeEnd);
  if (commit.worldTimeStart !== snapshot.worldTime || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new ProtocolError("REPLAY_INVALID", "world time is discontinuous");
  }
  const activeByAddress = new Map(snapshot.facts.filter(fact => fact.status === "active").map(fact => [fact.address, fact]));
  for (const [address, revision] of Object.entries(commit.dependencyRevisions)) {
    if (activeByAddress.get(address)?.revision !== revision) throw new ProtocolError("REVISION_CONFLICT", `stale dependency: ${address}`);
  }
  const ended = new Set(commit.delta.endFactIds);
  for (const factId of ended) {
    if (!snapshot.facts.some(fact => fact.factId === factId && fact.status === "active")) {
      throw new ProtocolError("REPLAY_INVALID", `cannot end inactive fact: ${factId}`);
    }
  }
  const facts = snapshot.facts.map(fact => ended.has(fact.factId)
    ? {...fact, status: "ended" as const, validUntilWorldTime: commit.worldTimeEnd}
    : fact).concat(commit.delta.addFacts);
  if (commit.delta.addFacts.some(fact => fact.canonicalHeight !== commit.height || fact.revision < 1)) {
    throw new ProtocolError("REPLAY_INVALID", "new fact height or revision is invalid");
  }
  const processMap = new Map(snapshot.processes.map(process => [process.processId, process]));
  for (const change of commit.delta.processChanges) {
    const current = processMap.get(change.processId);
    if (change.expectedRevision !== undefined && current?.revision !== change.expectedRevision) {
      throw new ProtocolError("REVISION_CONFLICT", `stale process: ${change.processId}`);
    }
    processMap.set(change.processId, change.next);
  }
  const truthCellMap = new Map(snapshot.truthCells.map(cell => [cell.address, cell]));
  for (const change of commit.delta.truthCellChanges ?? []) {
    const current = truthCellMap.get(change.address);
    if (current?.revision !== change.expectedRevision || change.next.address !== change.address ||
        change.next.revision !== change.expectedRevision + 1) {
      throw new ProtocolError("REVISION_CONFLICT", `stale or invalid truth cell: ${change.address}`);
    }
    truthCellMap.set(change.address, change.next);
  }
  for (const record of commit.collapseRecords ?? []) {
    const change = (commit.delta.truthCellChanges ?? []).find(item => item.address === record.address);
    if (change === undefined || record.priorRevision !== change.expectedRevision ||
        record.resultingRevision !== change.next.revision ||
        !change.next.constraints.some(item => item.constraintId === record.constraintId) ||
        !commit.delta.addConstraints.some(item => item.constraintId === record.constraintId)) {
      throw new ProtocolError("REPLAY_INVALID", "collapse record is not backed by its truth-cell constraint");
    }
  }
  const withoutRoot = {
    worldBasis: snapshot.worldBasis,
    height: commit.height,
    worldTime: commit.worldTimeEnd,
    facts,
    constraints: snapshot.constraints.concat(commit.delta.addConstraints),
    events: snapshot.events.concat(commit.delta.events),
    processes: [...processMap.values()],
    truthCells: [...truthCellMap.values()]
  };
  const factIds = new Set(withoutRoot.facts.map(fact => fact.factId));
  const eventIds = new Set(withoutRoot.events.map(event => event.eventId));
  for (const seed of commit.observationSeeds) {
    if (seed.sourceFactIds.some(id => !factIds.has(id)) || seed.sourceEventIds.some(id => !eventIds.has(id))) {
      throw new ProtocolError("REPLAY_INVALID", "observation seed has an uncommitted source");
    }
  }
  validateWorld(
    withoutRoot.facts,
    withoutRoot.processes,
    withoutRoot.constraints.map(constraint => constraint.constraintId),
    withoutRoot.events.map(event => event.eventId),
    withoutRoot.truthCells
  );
  const next = {...withoutRoot, stateRoot: sha256Canonical(statePayload(withoutRoot))};
  if (verifyRoot && next.stateRoot !== commit.stateRoot) throw new ProtocolError("REPLAY_INVALID", "commit state root does not match future state");
  return next;
}

export function applyCommit(snapshot: WorldSnapshot, commit: SettlementCommit): WorldSnapshot {
  return apply(snapshot, commit, true);
}

export function computeFutureStateRoot(snapshot: WorldSnapshot, commit: SettlementCommit): string {
  return apply(snapshot, commit, false).stateRoot;
}
