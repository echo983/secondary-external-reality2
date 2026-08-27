import type {
  ApprovedPresentationPacket, CanonicalFact, ConstitutedInput, EvidenceRecord, EpistemicAcquisition,
  ExperienceCommit, Observation, ObservationSeed, SettlementCommit, WorldSnapshot
} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {InMemoryCommitStore} from "../storage/in-memory-commit-store.js";
import {computeEpistemicRoot, InMemoryExperienceStore} from "../storage/in-memory-experience-store.js";
import {applyCommit, computeFutureStateRoot} from "./materialized-world.js";

function activeFact(snapshot: WorldSnapshot, address: string): CanonicalFact {
  const found = snapshot.facts.find(fact => fact.address === address && fact.status === "active");
  if (found === undefined) throw new ProtocolError("INTERNAL_INVARIANT", `missing active fact ${address}`);
  return found;
}

export interface DoorSettlement {
  commit: SettlementCommit;
  snapshot: WorldSnapshot;
  experience: ExperienceCommit;
  packet: ApprovedPresentationPacket;
}

export async function materializeDoorExperience(
  commit: SettlementCommit,
  experienceStore: InMemoryExperienceStore,
  committedAt = new Date().toISOString()
): Promise<{experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const observerId = commit.observationSeeds[0]?.observerId;
  const event = commit.delta.events.find(item => item.kind === "door_opened");
  const apertureCm = event?.payload.apertureCm;
  const speed = event?.payload.speed;
  const sound = event?.payload.sound;
  const doorId = event?.participants[1];
  if (observerId === undefined || event === undefined || doorId === undefined || typeof apertureCm !== "number" ||
      (speed !== "slow" && speed !== "normal") || (sound !== "quiet_hinge" && sound !== "hinge")) {
    throw new ProtocolError("REPLAY_INVALID", "door experience cannot be derived from committed sources");
  }
  const openFactId = commit.delta.addFacts.find(item => item.address === `door:${doorId}:open`)?.factId;
  const apertureFactId = commit.delta.addFacts.find(item => item.address === `door:${doorId}:aperture_cm`)?.factId;
  if (openFactId === undefined || apertureFactId === undefined) {
    throw new ProtocolError("REPLAY_INVALID", "door experience lacks committed facts");
  }
  const height = commit.height;
  const observations: Observation[] = [
    {observationId: `obs:${height}:vision`, observerId, modality: "vision", content: {apertureCm},
      scope: doorId, completeness: "partial", sourceFactIds: [openFactId, apertureFactId], sourceEventIds: [event.eventId], observedAtHeight: height},
    {observationId: `obs:${height}:hearing`, observerId, modality: "hearing", content: {sound},
      scope: doorId, completeness: "partial", sourceFactIds: [], sourceEventIds: [event.eventId], observedAtHeight: height},
    {observationId: `obs:${height}:touch`, observerId, modality: "touch", content: {motion: speed},
      scope: doorId, completeness: "partial", sourceFactIds: [apertureFactId], sourceEventIds: [event.eventId], observedAtHeight: height}
  ];
  const evidence: EvidenceRecord[] = observations.map(observation => ({
    evidenceId: `evidence:${observation.observationId}`, observationId: observation.observationId, sourceHeight: height
  }));
  const acquisitions: EpistemicAcquisition[] = evidence.map(item => ({agentId: observerId, evidenceId: item.evidenceId, mode: "perception"}));
  const parentEpistemicRoot = experienceStore.commits.filter(item => item.observerId === observerId).at(-1)?.epistemicRoot ?? "genesis";
  const experienceBase = {experienceId: `${commit.worldBasis.worldId}:${height}:${observerId}`, sourceHeight: height,
    observerId, observations, evidence, acquisitions, parentEpistemicRoot};
  const experience: ExperienceCommit = {...experienceBase, epistemicRoot: computeEpistemicRoot(experienceBase), committedAt};
  await experienceStore.append(experience);
  const packet: ApprovedPresentationPacket = {
    packetId: `packet:${height}:${observerId}`, observerId, language: "zh",
    observationIds: observations.map(item => item.observationId), boundaryCodes: [], approvedValues: [apertureCm, sound, speed]
  };
  return {experience, packet};
}

export async function settleOpenDoor(
  snapshot: WorldSnapshot,
  input: ConstitutedInput,
  attemptId: string,
  commitStore: InMemoryCommitStore,
  experienceStore: InMemoryExperienceStore,
  committedAt = new Date().toISOString()
): Promise<DoorSettlement> {
  const clause = input.clauses[0];
  if (input.kind !== "attempt" || clause?.operation !== "open" || clause.targetIds.length !== 1) {
    throw new ProtocolError("CAPABILITY_UNSUPPORTED", "open contract requires one grounded target");
  }
  const doorId = clause.targetIds[0] as string;
  if (doorId !== "door-1") throw new ProtocolError("TARGET_UNGROUNDED", "target is not the fixture door");
  const locked = activeFact(snapshot, `door:${doorId}:locked`);
  if (locked.value !== "false") throw new ProtocolError("PRECONDITION_FAILED", "door is locked");
  const priorOpen = activeFact(snapshot, `door:${doorId}:open`);
  const priorAperture = activeFact(snapshot, `door:${doorId}:aperture_cm`);
  const apertureCm = typeof clause.modifiers.apertureCm === "number" ? clause.modifiers.apertureCm : 80;
  const speed = clause.modifiers.speed === "slow" ? "slow" : "normal";
  const sound = clause.modifiers.noisePolicy === "minimize" && speed === "slow" ? "quiet_hinge" : "hinge";
  const height = snapshot.height + 1;
  const worldTimeEnd = new Date(Date.parse(snapshot.worldTime) + 2_000).toISOString();
  const eventId = `event:${height}:open:${doorId}`;
  const openFactId = `fact:${height}:${doorId}:open`;
  const apertureFactId = `fact:${height}:${doorId}:aperture`;
  const fact = (factId: string, address: string, value: string | number, revision: number): CanonicalFact => ({
    factId, address, value, status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd,
    sourceRef: eventId, revision
  });
  const seeds: ObservationSeed[] = [
    {observerId: input.actorId, modality: "vision", sourceFactIds: [openFactId, apertureFactId], sourceEventIds: [eventId],
      perceivableFields: ["apertureCm"], forbiddenSourceLabels: [], scope: doorId, salience: 1},
    {observerId: input.actorId, modality: "hearing", sourceFactIds: [], sourceEventIds: [eventId],
      perceivableFields: ["sound"], forbiddenSourceLabels: [], scope: doorId, salience: 0.6},
    {observerId: input.actorId, modality: "touch", sourceFactIds: [apertureFactId], sourceEventIds: [eventId],
      perceivableFields: ["motion"], forbiddenSourceLabels: [], scope: doorId, salience: 0.7}
  ];
  const draft: SettlementCommit = {
    worldBasis: snapshot.worldBasis,
    height,
    parentHeight: snapshot.height,
    parentStateRoot: snapshot.stateRoot,
    worldTimeStart: snapshot.worldTime,
    worldTimeEnd,
    dependencyRevisions: {
      [`door:${doorId}:locked`]: locked.revision,
      [`door:${doorId}:open`]: priorOpen.revision,
      [`door:${doorId}:aperture_cm`]: priorAperture.revision
    },
    attemptRefs: [attemptId],
    delta: {
      events: [{eventId, kind: "door_opened", participants: [input.actorId, doorId], causedBy: [attemptId], worldTime: worldTimeEnd,
        payload: {apertureCm, speed, sound}}],
      addFacts: [
        fact(openFactId, `door:${doorId}:open`, "true", priorOpen.revision + 1),
        fact(apertureFactId, `door:${doorId}:aperture_cm`, apertureCm, priorAperture.revision + 1)
      ],
      endFactIds: [priorOpen.factId, priorAperture.factId],
      addConstraints: [], processChanges: []
    },
    observationSeeds: seeds,
    stateRoot: "",
    committedAt
  };
  const commit = {...draft, stateRoot: computeFutureStateRoot(snapshot, draft)};
  const next = applyCommit(snapshot, commit);
  await commitStore.append(commit);

  const {experience, packet} = await materializeDoorExperience(commit, experienceStore, committedAt);
  return {commit, snapshot: next, experience, packet};
}
