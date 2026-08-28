export interface ActivePerceptionIntent {
  posture: "prone" | "crouching";
  modality: "vision";
  targetId: "door-1";
  durationSeconds: number;
}

/** A narrow language adapter for the supported posture + perception primitives. */
export function detectActivePerceptionIntent(rawInput: string): ActivePerceptionIntent | undefined {
  const text = rawInput.trim().replace(/[。！？!?]+$/u, "");
  const posture = /趴|伏低|俯身/u.test(text) ? "prone" : /蹲|屈膝/u.test(text) ? "crouching" : undefined;
  if (posture === undefined || !/看|瞧|观察|查看/u.test(text) || !/门外|门缝/u.test(text)) return undefined;
  return {posture, modality: "vision", targetId: "door-1", durationSeconds: 3};
}
