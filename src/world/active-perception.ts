import type {ApprovedPresentationPacket, CanonicalFact, EpistemicAcquisition, EvidenceRecord, ExperienceCommit,
  Observation, SettlementCommit, WorldSnapshot} from "../domain/types.js";
import type {ActivePerceptionIntent} from "../protocol/active-perception-intent.js";
import {ProtocolError} from "../protocol/errors.js";
import {computeEpistemicRoot} from "../storage/in-memory-experience-store.js";
import type {ExperiencePort, WorldCommitPort} from "../storage/ports.js";
import {applyCommit, computeFutureStateRoot} from "./materialized-world.js";

function activeFact(snapshot: WorldSnapshot, address: string): CanonicalFact {
  const fact = snapshot.facts.find(item => item.address === address && item.status === "active");
  if (fact === undefined) throw new ProtocolError("INTERNAL_INVARIANT", `active perception source is missing: ${address}`);
  return fact;
}

export function renderActivePerceptionPacket(packet: ApprovedPresentationPacket): string {
  const posture = packet.approvedValues.find(value => value === "prone" || value === "crouching");
  if (posture === undefined) throw new ProtocolError("INTERNAL_INVARIANT", "active perception packet lacks posture");
  const postureText = posture === "prone" ? "你趴低身体" : "你蹲下身体";
  return packet.approvedValues.includes("hallway")
    ? `${postureText}，从门缝往外看。你能看见有光的走廊的一小部分。`
    : `${postureText}，试着从门缝往外看；门仍关着，挡住了视线。`;
}

export async function materializeActivePerceptionExperience(
  commit: SettlementCommit,
  store: ExperiencePort,
  committedAt = new Date().toISOString()
): Promise<{experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const seed = commit.observationSeeds[0];
  const event = commit.delta.events.find(item => item.kind === "active_perception");
  const posture = event?.payload.posture;
  const visibleBeyond = event?.payload.visibleBeyond;
  if (seed === undefined || event === undefined || (posture !== "prone" && posture !== "crouching") ||
      (visibleBeyond !== "none" && visibleBeyond !== "hallway") || !seed.sourceEventIds.includes(event.eventId)) {
    throw new ProtocolError("REPLAY_INVALID", "active perception experience cannot be derived from committed sources");
  }
  const content = visibleBeyond === "hallway"
    ? {posture, visibleBeyond, light: event.payload.light as string}
    : {posture, visibleBeyond};
  if (visibleBeyond === "hallway" && event.payload.light !== "lit") {
    throw new ProtocolError("REPLAY_INVALID", "visible space light is not committed");
  }
  const observation: Observation = {observationId: `obs:${commit.height}:active-vision`, observerId: seed.observerId,
    modality: "vision", content, scope: seed.scope, completeness: "partial", sourceFactIds: seed.sourceFactIds,
    sourceEventIds: seed.sourceEventIds, observedAtHeight: commit.height};
  const evidence: EvidenceRecord = {evidenceId: `evidence:${observation.observationId}`,
    observationId: observation.observationId, sourceHeight: commit.height};
  const acquisition: EpistemicAcquisition = {agentId: seed.observerId, evidenceId: evidence.evidenceId, mode: "perception"};
  const parentEpistemicRoot = await store.latestRoot(seed.observerId);
  const base = {experienceId: `${commit.worldBasis.worldId}:${commit.height}:${seed.observerId}`,
    sourceHeight: commit.height, observerId: seed.observerId, observations: [observation], evidence: [evidence],
    acquisitions: [acquisition], parentEpistemicRoot};
  const experience: ExperienceCommit = {...base, epistemicRoot: computeEpistemicRoot(base), committedAt};
  await store.append(experience);
  const approvedValues = visibleBeyond === "hallway" ? [posture, visibleBeyond, "lit"] : [posture, visibleBeyond];
  const packet: ApprovedPresentationPacket = {packetId: `packet:${commit.height}:${seed.observerId}`,
    observerId: seed.observerId, language: "zh", observationIds: [observation.observationId], boundaryCodes: [], approvedValues};
  return {experience, packet};
}

export async function settleActivePerception(snapshot: WorldSnapshot, actorId: string, intent: ActivePerceptionIntent,
  attemptId: string, worldStore: WorldCommitPort, experienceStore: ExperiencePort,
  committedAt = new Date().toISOString()): Promise<{commit: SettlementCommit; snapshot: WorldSnapshot;
    experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const posture = activeFact(snapshot, `body:${actorId}:posture`);
  const doorOpen = activeFact(snapshot, `door:${intent.targetId}:open`);
  const aperture = activeFact(snapshot, `door:${intent.targetId}:aperture_cm`);
  const visibleBeyond = doorOpen.value === "true" && typeof aperture.value === "number" && aperture.value > 0 ? "hallway" : "none";
  const hallwayLight = visibleBeyond === "hallway" ? activeFact(snapshot, "room:hallway:light") : undefined;
  const height = snapshot.height + 1;
  const worldTimeEnd = new Date(Date.parse(snapshot.worldTime) + intent.durationSeconds * 1000).toISOString();
  const eventId = `event:${height}:active-perception:${intent.targetId}`;
  const postureFactId = `fact:${height}:${actorId}:posture`;
  const nextPosture: CanonicalFact = {factId: postureFactId, address: posture.address, value: intent.posture,
    status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: eventId, revision: posture.revision + 1};
  const sourceFactIds = [postureFactId, doorOpen.factId, aperture.factId,
    ...(hallwayLight === undefined ? [] : [hallwayLight.factId])];
  const payload = {posture: intent.posture, visibleBeyond,
    ...(hallwayLight === undefined ? {} : {light: hallwayLight.value as string}), durationSeconds: intent.durationSeconds};
  const draft: SettlementCommit = {worldBasis: snapshot.worldBasis, height, parentHeight: snapshot.height,
    parentStateRoot: snapshot.stateRoot, worldTimeStart: snapshot.worldTime, worldTimeEnd,
    dependencyRevisions: {[posture.address]: posture.revision, [doorOpen.address]: doorOpen.revision,
      [aperture.address]: aperture.revision, ...(hallwayLight === undefined ? {} : {[hallwayLight.address]: hallwayLight.revision})},
    attemptRefs: [attemptId], delta: {events: [{eventId, kind: "active_perception", participants: [actorId, intent.targetId],
      causedBy: [attemptId], worldTime: worldTimeEnd, payload}], addFacts: [nextPosture], endFactIds: [posture.factId],
      addConstraints: [], processChanges: []}, observationSeeds: [{observerId: actorId, modality: "vision", sourceFactIds,
      sourceEventIds: [eventId], perceivableFields: visibleBeyond === "hallway" ? ["posture", "visibleBeyond", "light"] : ["posture", "visibleBeyond"],
      forbiddenSourceLabels: [], scope: intent.targetId, salience: 1}], stateRoot: "", committedAt};
  const commit = {...draft, stateRoot: computeFutureStateRoot(snapshot, draft)};
  const next = applyCommit(snapshot, commit);
  await worldStore.append(commit);
  const {experience, packet} = await materializeActivePerceptionExperience(commit, experienceStore, committedAt);
  return {commit, snapshot: next, experience, packet};
}
