import type {PerceptionRequest} from "../perception/current-scene.js";

export function detectPerceptionRequest(rawInput: string): PerceptionRequest | undefined {
  const text = rawInput.trim().replace(/[。！？!?]+$/u, "");
  if (/趴|蹲|走|移动|靠近|爬/u.test(text)) return undefined;
  if (/看|瞧|观察|查看|检查/u.test(text) && /门外|门缝/u.test(text)) {
    return {mode: "ambient", horizon: "directional", targetId: "door-1"};
  }
  if (/^(看看|查看|观察|检查)(一下)?(门|房门)$/u.test(text)) {
    return {mode: "ambient", horizon: "object", targetId: "door-1"};
  }
  if (/^(看看|查看|观察|环顾)(一下)?(四周|周围|房间|这里)?$/u.test(text) || /环顾|看看四周|观察周围/u.test(text)) {
    return {mode: "ambient", horizon: "ambient"};
  }
  if (/^(听|听听|仔细听|侧耳听)(一下)?(四周|周围|外面|门外|这里)?$/u.test(text)) {
    return /外面|门外/u.test(text)
      ? {mode: "hearing", horizon: "directional", targetId: "door-1"}
      : {mode: "hearing", horizon: "ambient"};
  }
  if (/感觉.*(身体|自己)|检查.*身体|感受.*全身/u.test(text)) return {mode: "body", horizon: "body", targetId: "self"};
  return undefined;
}
