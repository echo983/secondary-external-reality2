import type {ApprovedPresentationPacket, CanonicalFact, ConstitutedInput, EpistemicAcquisition, EvidenceRecord,
  ExperienceCommit, Observation, SettlementCommit, WorldSnapshot} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {resolveCollapse} from "../protocol/deterministic-collapse.js";
import {computeEpistemicRoot} from "../storage/in-memory-experience-store.js";
import type {ExperiencePort, WorldCommitPort} from "../storage/ports.js";
import {applyCommit, computeFutureStateRoot} from "./materialized-world.js";
import {createDemoFixture} from "./demo-fixture.js";

function activeFact(snapshot: WorldSnapshot, address: string): CanonicalFact {
  const fact = snapshot.facts.find(item => item.address === address && item.status === "active");
  if (fact === undefined) throw new ProtocolError("PRECONDITION_FAILED", `missing active fact ${address}`);
  return fact;
}

export function renderPrimitivePacket(packet: ApprovedPresentationPacket): string {
  const [kind, first, second] = packet.approvedValues;
  const subject = first;
  if (kind === "object_held") return `你拿起了${subject === "blanket-1" ? "毛毯" : "那个物体"}。`;
  if (kind === "object_released") return `你松开了${subject === "blanket-1" ? "毛毯" : "那个物体"}。`;
  if (kind === "object_placed") return second === "door-1" ? "你把毛毯放到门缝处并塞了进去，它留在了那里。" : `你把${subject === "blanket-1" ? "毛毯" : "那个物体"}放到了${second === "bed-1" ? "床上" : "那里"}。`;
  if (kind === "placement_blocked") return "你把毛毯往门缝里塞；毛毯叠起来太厚，塞不进去。";
  if (kind === "object_dragged") return second === "door-1" ? "你把毛毯拖到了门边。" : "你拖动了那个物体。";
  if (kind === "actor_moved") return first === "hallway" ? "你穿过门，来到走廊。" : "你移动到了新的位置。";
  if (kind === "actor_approached") return first === "door-1" ? "你走到门前。" : "你走近了目标。";
  if (kind === "actor_oriented") return first === "door-1" ? "你转身面向门。" : "你改变了朝向。";
  if (kind === "speech") return `你说：“${String(first)}”`;
  throw new ProtocolError("INTERNAL_INVARIANT", "primitive packet is not renderable");
}

export async function materializePrimitiveExperience(commit: SettlementCommit, store: ExperiencePort,
  committedAt = new Date().toISOString()): Promise<{experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const seed = commit.observationSeeds[0];
  const event = commit.delta.events.find(item => seed?.sourceEventIds.includes(item.eventId));
  if (seed === undefined || event === undefined || !["object_held", "object_released", "object_placed", "object_dragged", "placement_blocked", "actor_moved", "actor_approached", "actor_oriented", "speech"].includes(event.kind)) {
    throw new ProtocolError("REPLAY_INVALID", "primitive experience lacks a committed event");
  }
  const content = Object.fromEntries(seed.perceivableFields.flatMap(field =>
    event.payload[field] === undefined ? [] : [[field, event.payload[field]]]
  ));
  if (Object.keys(content).length !== seed.perceivableFields.length) throw new ProtocolError("REPLAY_INVALID", "primitive field is absent");
  const observation: Observation = {observationId: `obs:${commit.height}:primitive`, observerId: seed.observerId,
    modality: seed.modality, content, scope: seed.scope, completeness: "partial", sourceFactIds: seed.sourceFactIds,
    sourceEventIds: seed.sourceEventIds, observedAtHeight: commit.height};
  const evidence: EvidenceRecord = {evidenceId: `evidence:${observation.observationId}`,
    observationId: observation.observationId, sourceHeight: commit.height};
  const acquisition: EpistemicAcquisition = {agentId: seed.observerId, evidenceId: evidence.evidenceId, mode: "perception"};
  const parentEpistemicRoot = await store.latestRoot(seed.observerId);
  const base = {experienceId: `${commit.worldBasis.worldId}:${commit.height}:${seed.observerId}`, sourceHeight: commit.height,
    observerId: seed.observerId, observations: [observation], evidence: [evidence], acquisitions: [acquisition], parentEpistemicRoot};
  const experience: ExperienceCommit = {...base, epistemicRoot: computeEpistemicRoot(base), committedAt};
  await store.append(experience);
  const values = [event.kind, ...seed.perceivableFields.map(field => event.payload[field]).flatMap(value =>
    Array.isArray(value) ? value : value === undefined ? [] : [value])];
  return {experience, packet: {packetId: `packet:${commit.height}:${seed.observerId}`, observerId: seed.observerId,
    language: "zh", observationIds: [observation.observationId], boundaryCodes: [], approvedValues: values}};
}

export async function settlePrimitiveWorld(snapshot: WorldSnapshot, input: ConstitutedInput, attemptId: string,
  worldStore: WorldCommitPort, experienceStore: ExperiencePort, committedAt = new Date().toISOString()): Promise<{
    commit: SettlementCommit; snapshot: WorldSnapshot; experience: ExperienceCommit; packet: ApprovedPresentationPacket}> {
  const clause = input.clauses[0];
  const operation = clause?.operation;
  if (input.kind !== "attempt" && input.kind !== "speech") throw new ProtocolError("INPUT_INVALID", "primitive operation kind is invalid");
  if (clause === undefined) throw new ProtocolError("INPUT_INVALID", "primitive operation clause is absent");
  const height = snapshot.height + 1;
  const duration = operation === "primitive:move" ? 4 : operation === "primitive:speech" ? 1 : 2;
  const worldTimeEnd = new Date(Date.parse(snapshot.worldTime) + duration * 1000).toISOString();
  let kind: "object_held" | "object_released" | "object_placed" | "object_dragged" | "placement_blocked" | "actor_moved" | "actor_approached" | "actor_oriented" | "speech";
  let participants: string[];
  let payload: Record<string, string | number>;
  let addFacts: CanonicalFact[] = [];
  let endFactIds: string[] = [];
  const dependencyRevisions: Record<string, number> = {};
  let addConstraints: SettlementCommit["delta"]["addConstraints"] = [];
  let truthCellChanges: NonNullable<SettlementCommit["delta"]["truthCellChanges"]> = [];
  let collapseRecords: NonNullable<SettlementCommit["collapseRecords"]> = [];
  if (operation === "primitive:hold") {
    const objectId = clause.targetIds[0];
    if (objectId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "hold target is absent");
    const placement = activeFact(snapshot, `placement:${objectId}`);
    if (placement.value === input.actorId) throw new ProtocolError("PRECONDITION_FAILED", "object is already held");
    kind = "object_held"; participants = [input.actorId, objectId]; payload = {subject: objectId};
    dependencyRevisions[placement.address] = placement.revision;
    addFacts = [{factId: `fact:${height}:placement:${objectId}`, address: placement.address, value: input.actorId,
      status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: placement.revision + 1}];
    endFactIds = [placement.factId];
    if (objectId === "blanket-1") {
      const occlusion = snapshot.facts.find(fact => fact.address === "relation:blanket-1:occludes:door-1" && fact.status === "active");
      if (occlusion !== undefined) {
        dependencyRevisions[occlusion.address] = occlusion.revision;
        endFactIds.push(occlusion.factId);
      }
    }
  } else if (operation === "primitive:release") {
    const objectId = clause.targetIds[0];
    if (objectId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "release target is absent");
    const placement = activeFact(snapshot, `placement:${objectId}`);
    const actorPlacement = activeFact(snapshot, `placement:${input.actorId}`);
    if (placement.value !== input.actorId || typeof actorPlacement.value !== "string") {
      throw new ProtocolError("PRECONDITION_FAILED", "actor is not holding the object");
    }
    kind = "object_released"; participants = [input.actorId, objectId]; payload = {subject: objectId, destination: actorPlacement.value};
    dependencyRevisions[placement.address] = placement.revision;
    dependencyRevisions[actorPlacement.address] = actorPlacement.revision;
    addFacts = [{factId: `fact:${height}:placement:${objectId}`, address: placement.address, value: actorPlacement.value,
      status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: placement.revision + 1}];
    endFactIds = [placement.factId];
  } else if (operation === "primitive:place" || operation === "primitive:drag") {
    const [objectId, destinationId] = clause.targetIds;
    if (objectId === undefined || destinationId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "place targets are absent");
    const placement = activeFact(snapshot, `placement:${objectId}`);
    if (operation === "primitive:place" && placement.value !== input.actorId) {
      throw new ProtocolError("PRECONDITION_FAILED", "actor is not holding the object");
    }
    if (operation === "primitive:drag" && placement.value === input.actorId) {
      throw new ProtocolError("PRECONDITION_FAILED", "held object should be placed rather than dragged");
    }
    kind = operation === "primitive:drag" ? "object_dragged" : "object_placed";
    participants = [input.actorId, objectId, destinationId]; payload = {subject: objectId, destination: destinationId};
    if (objectId === "blanket-1" && destinationId === "door-1" && clause.modifiers.occludes === true) {
      const address = "fit:blanket-1:under_gap:door-1";
      const cell = snapshot.truthCells.find(item => item.address === address);
      if (cell === undefined) throw new ProtocolError("INTERNAL_INVARIANT", "blanket fit truth cell is absent");
      let fits = cell.resolvedValue;
      if (fits === undefined) {
        const resolution = resolveCollapse(snapshot.worldBasis, cell, {address,
          blockingReason: "placing the blanket under the door requires knowing whether it physically fits",
          requestedConstraintKind: "eq", allowedDomain: [true, false], dependencySource: "world-rule", radius: "local"},
        createDemoFixture().collapseRegistrations, height);
        fits = resolution.change.next.resolvedValue;
        addConstraints = [resolution.constraint]; truthCellChanges = [resolution.change]; collapseRecords = [resolution.record];
      }
      if (fits !== true) kind = "placement_blocked";
    }
    dependencyRevisions[placement.address] = placement.revision;
    if (kind !== "placement_blocked") {
      addFacts = [{factId: `fact:${height}:placement:${objectId}`, address: placement.address, value: destinationId,
        status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: placement.revision + 1}];
      endFactIds = [placement.factId];
    }
    if (objectId === "blanket-1") {
      const relationAddress = "relation:blanket-1:occludes:door-1";
      const priorRelation = snapshot.facts.find(fact => fact.address === relationAddress && fact.status === "active");
      if (priorRelation !== undefined && kind !== "placement_blocked") {
        dependencyRevisions[relationAddress] = priorRelation.revision;
        endFactIds.push(priorRelation.factId);
      }
      if (kind !== "placement_blocked" && destinationId === "door-1" && clause.modifiers.occludes === true) addFacts.push({factId: `fact:${height}:blanket-occludes-door`, address: relationAddress,
        value: "true", status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd,
        sourceRef: `event:${height}:primitive`, revision: (priorRelation?.revision ?? 0) + 1});
    }
  } else if (operation === "primitive:approach") {
    const targetId = clause.targetIds[0];
    if (targetId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "approach target is absent");
    const address = `relation:${input.actorId}:near:${targetId}`;
    const prior = snapshot.facts.find(fact => fact.address === address && fact.status === "active");
    kind = "actor_approached"; participants = [input.actorId, targetId]; payload = {target: targetId};
    if (prior !== undefined) { dependencyRevisions[address] = prior.revision; endFactIds = [prior.factId]; }
    addFacts = [{factId: `fact:${height}:near:${input.actorId}:${targetId}`, address, value: "true", status: "active",
      canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: (prior?.revision ?? 0) + 1}];
  } else if (operation === "primitive:move") {
    const destinationId = clause.targetIds[0];
    if (destinationId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "move destination is absent");
    const placement = activeFact(snapshot, `placement:${input.actorId}`);
    if (destinationId === "hallway" && activeFact(snapshot, "door:door-1:open").value !== "true") {
      throw new ProtocolError("PRECONDITION_FAILED", "closed door blocks movement");
    }
    kind = "actor_moved"; participants = [input.actorId, destinationId]; payload = {destination: destinationId};
    dependencyRevisions[placement.address] = placement.revision;
    addFacts = [{factId: `fact:${height}:placement:${input.actorId}`, address: placement.address, value: destinationId,
      status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: placement.revision + 1}];
    endFactIds = [placement.factId];
  } else if (operation === "primitive:orient") {
    const targetId = clause.targetIds[0];
    if (targetId === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "orientation target is absent");
    const orientation = activeFact(snapshot, `body:${input.actorId}:orientation`);
    kind = "actor_oriented"; participants = [input.actorId, targetId]; payload = {target: targetId};
    dependencyRevisions[orientation.address] = orientation.revision;
    addFacts = [{factId: `fact:${height}:orientation:${input.actorId}`, address: orientation.address, value: targetId,
      status: "active", canonicalHeight: height, validFromWorldTime: worldTimeEnd, sourceRef: `event:${height}:primitive`, revision: orientation.revision + 1}];
    endFactIds = [orientation.factId];
  } else if (operation === "primitive:speech") {
    const speech = clause.modifiers.speech;
    if (typeof speech !== "string" || speech === "") throw new ProtocolError("INPUT_INVALID", "speech content is absent");
    kind = "speech"; participants = [input.actorId]; payload = {speech};
  } else throw new ProtocolError("CAPABILITY_UNSUPPORTED", "unknown primitive world operation");
  const eventId = `event:${height}:primitive`;
  addFacts = addFacts.map(fact => ({...fact, sourceRef: eventId}));
  const fields = kind === "object_held" ? ["subject"] : kind === "object_released" ? ["subject", "destination"]
    : kind === "object_placed" || kind === "object_dragged" || kind === "placement_blocked" ? ["subject", "destination"] : kind === "actor_moved" ? ["destination"]
    : kind === "actor_approached" || kind === "actor_oriented" ? ["target"] : ["speech"];
  const draft: SettlementCommit = {worldBasis: snapshot.worldBasis, height, parentHeight: snapshot.height,
    parentStateRoot: snapshot.stateRoot, worldTimeStart: snapshot.worldTime, worldTimeEnd, dependencyRevisions,
    attemptRefs: [attemptId], delta: {events: [{eventId, kind, participants, causedBy: [attemptId], worldTime: worldTimeEnd, payload}],
      addFacts, endFactIds, addConstraints, processChanges: [], truthCellChanges}, observationSeeds: [{observerId: input.actorId,
      modality: kind === "speech" ? "hearing" : "proprioception", sourceFactIds: addFacts.map(fact => fact.factId),
      sourceEventIds: [eventId], perceivableFields: fields, forbiddenSourceLabels: [], scope: participants[1] ?? input.actorId, salience: 1}],
    collapseRecords, stateRoot: "", committedAt};
  const commit = {...draft, stateRoot: computeFutureStateRoot(snapshot, draft)};
  const next = applyCommit(snapshot, commit);
  await worldStore.append(commit);
  const projected = await materializePrimitiveExperience(commit, experienceStore, committedAt);
  return {commit, snapshot: next, ...projected};
}
