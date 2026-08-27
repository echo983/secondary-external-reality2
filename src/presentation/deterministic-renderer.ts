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
