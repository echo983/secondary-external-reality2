export type WorldId = string;
export type EntityId = string;
export type FactId = string;
export type EventId = string;
export type ProcessId = string;
export type AttemptId = string;
export type ObservationId = string;
export type EvidenceId = string;
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

export interface ProcessState {
  processId: ProcessId;
  kind: string;
  ownerRef?: EntityId;
  state: Readonly<Record<string, JsonScalar>>;
  lastEvaluatedAt: WorldInstant;
  nextSemanticTransitionAt?: WorldInstant;
  revision: number;
}

export interface ProcessChange {
  processId: ProcessId;
  expectedRevision?: number;
  next: ProcessState;
}

export interface RealityDelta {
  events: readonly CanonicalEvent[];
  addFacts: readonly CanonicalFact[];
  endFactIds: readonly FactId[];
  addConstraints: readonly CanonicalConstraint[];
  processChanges: readonly ProcessChange[];
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

export interface WorldSnapshot {
  worldBasis: WorldBasis;
  height: Height;
  worldTime: WorldInstant;
  facts: readonly CanonicalFact[];
  constraints: readonly CanonicalConstraint[];
  events: readonly CanonicalEvent[];
  processes: readonly ProcessState[];
  stateRoot: string;
}

export interface Observation {
  observationId: ObservationId;
  observerId: EntityId;
  modality: ObservationSeed["modality"];
  content: Readonly<Record<string, JsonScalar | readonly string[]>>;
  scope: string;
  completeness: "partial" | "complete_for_scope";
  sourceFactIds: readonly FactId[];
  sourceEventIds: readonly EventId[];
  observedAtHeight: Height;
}

export interface EvidenceRecord {
  evidenceId: EvidenceId;
  observationId: ObservationId;
  sourceHeight: Height;
}

export interface EpistemicAcquisition {
  agentId: EntityId;
  evidenceId: EvidenceId;
  mode: "perception" | "testimony";
}

export interface ExperienceCommit {
  experienceId: string;
  sourceHeight: Height;
  observerId: EntityId;
  observations: readonly Observation[];
  evidence: readonly EvidenceRecord[];
  acquisitions: readonly EpistemicAcquisition[];
  parentEpistemicRoot: string;
  epistemicRoot: string;
  committedAt: string;
}

export const EMPTY_REALITY_DELTA: RealityDelta = Object.freeze({
  events: Object.freeze([]),
  addFacts: Object.freeze([]),
  endFactIds: Object.freeze([]),
  addConstraints: Object.freeze([]),
  processChanges: Object.freeze([])
});
