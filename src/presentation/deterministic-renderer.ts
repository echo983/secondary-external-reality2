import type {ApprovedPresentationPacket} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";

export function renderApprovedPacket(packet: ApprovedPresentationPacket): string {
  const aperture = packet.approvedValues.find(value => typeof value === "number");
  const sound = packet.approvedValues.find(value => value === "quiet_hinge" || value === "hinge");
  const speed = packet.approvedValues.find(value => value === "slow" || value === "normal");
  if (typeof aperture !== "number" || typeof sound !== "string" || typeof speed !== "string") {
    throw new ProtocolError("INTERNAL_INVARIANT", "door packet lacks approved values");
  }
  const motionText = speed === "slow" ? "缓慢地" : "";
  const soundText = sound === "quiet_hinge" ? "一声很轻的摩擦声" : "摩擦声";
  return `门${motionText}移开，留下约 ${aperture} 厘米的缝；铰链发出${soundText}。`;
}

export function renderWaitPacket(packet: ApprovedPresentationPacket): string {
  if (packet.approvedValues.includes("whistle")) return "水壶发出了持续的鸣笛声。";
  if (packet.approvedValues.includes(true)) return "一声突发的警示打断了等待。";
  const elapsed = packet.approvedValues.find(value => typeof value === "number");
  if (typeof elapsed === "number") return `等待结束了；大约过去了 ${elapsed} 秒。`;
  throw new ProtocolError("INTERNAL_INVARIANT", "wait packet lacks an approved perceivable value");
}
