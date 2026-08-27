export type WorldId = string;
export type EntityId = string;
export type FactId = string;
export type EventId = string;
export type ProcessId = string;
export type AttemptId = string;
export type Height = number;
export type WorldInstant = string;
export type SemanticAddress = string;
export type JsonScalar = string | number | boolean | null;

export interface WorldBasis {
  worldId: WorldId;
  schemaVersion: string;
  fixtureVersion: string;
  genesisHash: string;
}

export interface CanonicalFact {
  factId: FactId;
  address: SemanticAddress;
  value: JsonScalar | readonly string[];
  status: "active" | "ended" | "corrected";
  canonicalHeight: Height;
  validFromWorldTime: WorldInstant;
  validUntilWorldTime?: WorldInstant;
  sourceRef: EventId | string;
  revision: number;
}

export interface CanonicalConstraint {
  constraintId: string;
  kind: "eq" | "neq" | "in" | "exists" | "range" | "relation";
  operands: readonly JsonScalar[];
  canonicalHeight: Height;
  sourceRef: string;
}

export interface TruthCell {
  address: SemanticAddress;
  domain: readonly JsonScalar[] | {kind: string; schemaRef: string};
  constraints: readonly CanonicalConstraint[];
  resolvedValue?: JsonScalar;
  revision: number;
}

export interface CanonicalEvent {
  eventId: EventId;
  kind: string;
  participants: readonly EntityId[];
  causedBy: readonly string[];
  worldTime: WorldInstant;
  payload: Readonly<Record<string, JsonScalar | readonly string[]>>;
}

export interface RealityDelta {
  events: readonly CanonicalEvent[];
  addFacts: readonly unknown[];
  endFactIds: readonly FactId[];
  addConstraints: readonly unknown[];
  processChanges: readonly unknown[];
}

export interface ObservationSeed {
  observerId: EntityId;
  modality: "vision" | "hearing" | "touch" | "temperature" | "pain" |
    "proprioception" | "interoception" | "testimony";
  sourceFactIds: readonly FactId[];
  sourceEventIds: readonly EventId[];
  perceivableFields: readonly string[];
  forbiddenSourceLabels: readonly string[];
  scope: string;
  salience: number;
}

export interface SettlementCommit {
  worldBasis: WorldBasis;
  height: Height;
  parentHeight: Height;
  parentStateRoot: string;
  worldTimeStart: WorldInstant;
  worldTimeEnd: WorldInstant;
  dependencyRevisions: Readonly<Record<SemanticAddress, number>>;
  attemptRefs: readonly AttemptId[];
  delta: RealityDelta;
  observationSeeds: readonly ObservationSeed[];
  stateRoot: string;
  committedAt: string;
}

export const EMPTY_REALITY_DELTA: RealityDelta = Object.freeze({
  events: Object.freeze([]),
  addFacts: Object.freeze([]),
  endFactIds: Object.freeze([]),
  addConstraints: Object.freeze([]),
  processChanges: Object.freeze([])
});
