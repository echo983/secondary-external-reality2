import type {ApprovedPresentationPacket, CanonicalFact, ConstitutedInput, EpistemicAcquisition, EvidenceRecord,
  ExperienceCommit, Observation, SettlementCommit, WorldSnapshot} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {InMemoryCommitStore} from "../storage/in-memory-commit-store.js";
import {computeEpistemicRoot, InMemoryExperienceStore} from "../storage/in-memory-experience-store.js";
import {applyCommit, computeFutureStateRoot} from "./materialized-world.js";

export interface WaitPolicy {interruptAt?: string}

export async function materializeWaitExperience(
  commit: SettlementCommit,
  store: InMemoryExperienceStore,
  committedAt = new Date().toISOString()
): Promise<{experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const seed = commit.observationSeeds[0];
  if (seed === undefined) throw new ProtocolError("REPLAY_INVALID", "wait commit has no perceivable result");
  const sourceEvent = commit.delta.events.find(event => seed.sourceEventIds.includes(event.eventId));
  if (sourceEvent === undefined) throw new ProtocolError("REPLAY_INVALID", "wait observation source is missing");
  const content = Object.fromEntries(seed.perceivableFields.flatMap(field =>
    sourceEvent.payload[field] === undefined ? [] : [[field, sourceEvent.payload[field]]]
  ));
  if (Object.keys(content).length !== seed.perceivableFields.length) {
    throw new ProtocolError("REPLAY_INVALID", "wait observation field is not committed");
  }
  const observation: Observation = {
    observationId: `obs:${commit.height}:${seed.modality}`, observerId: seed.observerId, modality: seed.modality,
    content, scope: seed.scope, completeness: "partial", sourceFactIds: seed.sourceFactIds,
    sourceEventIds: seed.sourceEventIds, observedAtHeight: commit.height
  };
  const evidence: EvidenceRecord = {evidenceId: `evidence:${observation.observationId}`,
    observationId: observation.observationId, sourceHeight: commit.height};
  const acquisition: EpistemicAcquisition = {agentId: seed.observerId, evidenceId: evidence.evidenceId,
    mode: seed.modality === "testimony" ? "testimony" : "perception"};
  const parentEpistemicRoot = store.commits.filter(item => item.observerId === seed.observerId).at(-1)?.epistemicRoot ?? "genesis";
  const base = {experienceId: `${commit.worldBasis.worldId}:${commit.height}:${seed.observerId}`,
    sourceHeight: commit.height, observerId: seed.observerId, observations: [observation], evidence: [evidence],
    acquisitions: [acquisition], parentEpistemicRoot};
  const experience: ExperienceCommit = {...base, epistemicRoot: computeEpistemicRoot(base), committedAt};
  await store.append(experience);
  const packet: ApprovedPresentationPacket = {packetId: `packet:${commit.height}:${seed.observerId}`,
    observerId: seed.observerId, language: "zh", observationIds: [observation.observationId], boundaryCodes: [],
    approvedValues: Object.values(content).flatMap(value => Array.isArray(value) ? value : [value])};
  return {experience, packet};
}

export async function settleWait(
  snapshot: WorldSnapshot,
  input: ConstitutedInput,
  attemptId: string,
  store: InMemoryCommitStore,
  policy: WaitPolicy = {},
  committedAt = new Date().toISOString()
): Promise<{commit: SettlementCommit; snapshot: WorldSnapshot}> {
  const clause = input.clauses[0];
  const duration = clause?.modifiers.durationSeconds;
  if (input.kind !== "wait" || clause?.operation !== "wait" || typeof duration !== "number") {
    throw new ProtocolError("INPUT_INVALID", "wait contract requires a duration");
  }
  const requestedEndMs = Date.parse(snapshot.worldTime) + duration * 1000;
  const interruptMs = policy.interruptAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(policy.interruptAt);
  const endMs = Math.min(requestedEndMs, interruptMs);
  const worldTimeEnd = new Date(endMs).toISOString();
  const height = snapshot.height + 1;
  const process = snapshot.processes.find(item => item.kind === "kettle_heating");
  const dueMs = process?.nextSemanticTransitionAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(process.nextSemanticTransitionAt);
  const kettleDue = process !== undefined && dueMs <= endMs;
  const prior = snapshot.facts.find(item => item.address === "kettle:kettle-1:state" && item.status === "active");
  const eventId = `event:${height}:kettle-boiling`;
  const factId = `fact:${height}:kettle-state`;
  const events = kettleDue ? [
    {eventId, kind: "kettle_boiling", participants: ["kettle-1"], causedBy: [process?.processId as string],
      worldTime: process?.nextSemanticTransitionAt as string, payload: {state: "boiling"}},
    {eventId: `event:${height}:kettle-whistle`, kind: "kettle_whistle", participants: ["kettle-1", input.actorId],
      causedBy: [eventId], worldTime: process?.nextSemanticTransitionAt as string, payload: {sound: "whistle"}}
  ] : policy.interruptAt !== undefined ? [
    {eventId: `event:${height}:danger`, kind: "danger_interrupt", participants: [input.actorId], causedBy: ["schedule"],
      worldTime: worldTimeEnd, payload: {danger: true}}
  ] : [];
  const addFacts: CanonicalFact[] = kettleDue && prior !== undefined ? [{factId, address: prior.address, value: "boiling", status: "active",
    canonicalHeight: height, validFromWorldTime: process?.nextSemanticTransitionAt as string, sourceRef: eventId, revision: prior.revision + 1}] : [];
  const draft: SettlementCommit = {
    worldBasis: snapshot.worldBasis, height, parentHeight: snapshot.height, parentStateRoot: snapshot.stateRoot,
    worldTimeStart: snapshot.worldTime, worldTimeEnd, dependencyRevisions: {},
    attemptRefs: [attemptId], delta: {events, addFacts, endFactIds: addFacts.length === 0 || prior === undefined ? [] : [prior.factId],
      addConstraints: [], processChanges: kettleDue && process !== undefined ? [{processId: process.processId, expectedRevision: process.revision,
        next: {processId: process.processId, kind: process.kind, ...(process.ownerRef === undefined ? {} : {ownerRef: process.ownerRef}), state: {phase: "boiling"},
          lastEvaluatedAt: worldTimeEnd, revision: process.revision + 1}}] : []},
    observationSeeds: kettleDue ? [{observerId: input.actorId, modality: "hearing", sourceFactIds: [factId],
      sourceEventIds: [`event:${height}:kettle-whistle`], perceivableFields: ["sound"], forbiddenSourceLabels: ["temperature"],
      scope: "kitchen", salience: 1}] : policy.interruptAt !== undefined ? [{observerId: input.actorId, modality: "hearing", sourceFactIds: [],
      sourceEventIds: [`event:${height}:danger`], perceivableFields: ["danger"], forbiddenSourceLabels: [], scope: "kitchen", salience: 1}] : [],
    stateRoot: "", committedAt
  };
  const commit = {...draft, stateRoot: computeFutureStateRoot(snapshot, draft)};
  const next = applyCommit(snapshot, commit);
  await store.append(commit);
  return {commit, snapshot: next};
}
