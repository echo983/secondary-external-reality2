import type {CanonicalFact, Observation, WorldSnapshot} from "../domain/types.js";
import type {DemoFixture} from "../world/demo-fixture.js";
import {ProtocolError} from "../protocol/errors.js";

export type PerceptionMode = "ambient" | "hearing" | "body";
export interface PerceptionRequest {
  mode: PerceptionMode;
  horizon: "ambient" | "directional" | "object" | "body";
  targetId?: string;
}

export interface SceneProjection {
  mode: PerceptionMode;
  observations: readonly Observation[];
  text: string;
}

function activeFact(snapshot: WorldSnapshot, address: string): CanonicalFact {
  const fact = snapshot.facts.find(item => item.address === address && item.status === "active");
  if (fact === undefined) throw new ProtocolError("INTERNAL_INVARIANT", `perception source is missing: ${address}`);
  return fact;
}

function observation(snapshot: WorldSnapshot, mode: PerceptionMode, content: Record<string, string | number>,
  sourceFactIds: readonly string[], scope: string, modality: Observation["modality"]): Observation {
  return {observationId: `read:${snapshot.height}:${mode}:${modality}`, observerId: "self", modality, content,
    scope, completeness: "partial", sourceFactIds, sourceEventIds: [], observedAtHeight: snapshot.height};
}

export function projectCurrentScene(
  snapshot: WorldSnapshot,
  fixture: DemoFixture,
  actorId: string,
  input: PerceptionMode | PerceptionRequest
): SceneProjection {
  const request: PerceptionRequest = typeof input === "string"
    ? {mode: input, horizon: input === "body" ? "body" : "ambient"}
    : input;
  const mode = request.mode;
  const placement = activeFact(snapshot, `placement:${actorId}`);
  if (typeof placement.value !== "string") throw new ProtocolError("INTERNAL_INVARIANT", "actor placement is invalid");
  const room = fixture.entities.find(entity => entity.entityId === placement.value && entity.kind === "room");
  if (room === undefined) throw new ProtocolError("INTERNAL_INVARIANT", "actor room is absent from fixture");

  if (mode === "hearing") {
    const soundRoom = request.horizon === "directional" && request.targetId === "door-1" ? "hallway" : room.entityId;
    const sound = activeFact(snapshot, `room:${soundRoom}:ambient_sound`);
    const text = request.horizon === "directional" && request.targetId === "door-1"
      ? sound.value === "quiet" ? "你朝门外听。没有听见足以辨认的声响。" : `你朝门外听见${String(sound.value)}。`
      : sound.value === "quiet" ? "你停下来听。房间里没有明显声响。" : `你听见${String(sound.value)}。`;
    return {mode, observations: [observation(snapshot, mode, {ambientSound: String(sound.value)},
      [placement.factId, sound.factId], soundRoom, "hearing")], text};
  }

  if (mode === "body") {
    const posture = activeFact(snapshot, `body:${actorId}:posture`);
    const pain = activeFact(snapshot, `body:${actorId}:pain`);
    const postureText = posture.value === "standing" ? "你正站着" : `你的姿态是${String(posture.value)}`;
    const painText = pain.value === "none" ? "，没有感觉到疼痛。" : `，你感觉到${String(pain.value)}。`;
    return {mode, observations: [observation(snapshot, mode,
      {posture: String(posture.value), pain: String(pain.value)}, [placement.factId, posture.factId, pain.factId], actorId,
      "proprioception")], text: `${postureText}${painText}`};
  }

  const light = activeFact(snapshot, `room:${room.entityId}:light`);
  const doorOpen = activeFact(snapshot, "door:door-1:open");
  const aperture = activeFact(snapshot, "door:door-1:aperture_cm");
  if ((request.horizon === "directional" || request.horizon === "object") && request.targetId === "door-1") {
    if (request.horizon === "object") {
      const text = doorOpen.value === "true"
        ? `门开着${typeof aperture.value === "number" ? `，开口约 ${aperture.value} 厘米` : ""}。`
        : "门关着。";
      return {mode, observations: [observation(snapshot, mode,
        {doorOpen: String(doorOpen.value), apertureCm: Number(aperture.value)},
        [placement.factId, doorOpen.factId, aperture.factId], "door-1", "vision")], text};
    }
    if (doorOpen.value !== "true" || aperture.value === 0) {
      return {mode, observations: [observation(snapshot, mode, {doorOpen: "false", visibleBeyond: "none"},
        [placement.factId, doorOpen.factId, aperture.factId], "door-1", "vision")], text: "门关着，你看不到门外。"};
    }
    const otherSide = activeFact(snapshot, "door:door-1:other_side");
    const hallwayLight = activeFact(snapshot, "room:hallway:light");
    return {mode, observations: [observation(snapshot, mode,
      {doorOpen: "true", apertureCm: Number(aperture.value), visibleSpace: "走廊", light: String(hallwayLight.value)},
      [placement.factId, doorOpen.factId, aperture.factId, otherSide.factId, hallwayLight.factId], "hallway", "vision")],
      text: "透过门缝，你能看见有光的走廊的一小部分。"};
  }
  const bedPlacement = activeFact(snapshot, "placement:bed-1");
  const blanketPlacement = activeFact(snapshot, "placement:blanket-1");
  const doorText = doorOpen.value === "true"
    ? `一扇门开着${typeof aperture.value === "number" ? `，留下约 ${aperture.value} 厘米的缝` : ""}`
    : "一扇门关着";
  const lightText = light.value === "lit" ? "有光" : String(light.value);
  const text = `你站在一间${lightText}的卧室里。你能看见${doorText}、一张床和床上的毛毯。`;
  const sources = [placement.factId, light.factId, doorOpen.factId, aperture.factId, bedPlacement.factId, blanketPlacement.factId];
  return {mode, observations: [observation(snapshot, mode,
    {room: "卧室", light: lightText, doorOpen: String(doorOpen.value), apertureCm: Number(aperture.value),
      visibleObjects: "门、床、毛毯"}, sources, room.entityId, "vision")], text};
}
