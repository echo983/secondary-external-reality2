import type {ActionContext} from "../protocol/action-proposal.js";

const slotValueProperties = {objectSlot: {type: "string"}, value: {type: ["string", "number", "boolean", "null"]}} as const;

export const ACTION_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "clauseIndex", "primitives", "targetSlots", "conditions", "effects", "perceptionScopes", "unresolvedDependencies"],
  properties: {
    kind: {type: "string", enum: ["attempt", "query", "wait", "speech", "none", "invalid"]},
    clauseIndex: {type: "integer", minimum: 0},
    primitives: {type: "array", items: {type: "string", enum: [
      "perceive", "orient", "move", "contact", "apply_force", "hold", "release", "place",
      "change_relation", "communicate", "wait"
    ]}},
    targetSlots: {type: "array", items: {type: "string"}},
    conditions: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["kind", "subjectSlot", "predicate", "source"], properties: {
        kind: {type: "string", enum: ["fact", "capability", "relation", "reachability"]}, subjectSlot: {type: "string"},
        predicate: {type: "string"}, source: {type: "string", enum: ["world_slice", "operation_contract"]}, ...slotValueProperties
      }}},
    effects: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["kind", "subjectSlot", "field", "certainty"], properties: {
        kind: {type: "string", enum: ["observation_scope", "orientation", "placement", "contact", "force", "holding", "relation", "signal", "time"]},
        subjectSlot: {type: "string"}, field: {type: "string"}, certainty: {type: "string", enum: ["required", "possible"]},
        ...slotValueProperties
      }}},
    perceptionScopes: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["modality", "originSlot", "horizon", "targetSlots"], properties: {
        modality: {type: "string", enum: ["vision", "hearing", "touch", "proprioception", "interoception"]},
        originSlot: {type: "string"}, horizon: {type: "string", enum: ["ambient", "directional", "object", "body"]},
        targetSlots: {type: "array", items: {type: "string"}}
      }}},
    durationSeconds: {type: "number", minimum: 0, maximum: 3600},
    unresolvedDependencies: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["kind", "reason"], properties: {
        kind: {type: "string", enum: ["binding", "fact", "capability", "constraint"]}, reason: {type: "string"}, slot: {type: "string"}
      }}}
  }
} as const;

export const ACTION_PROPOSAL_SYSTEM_PROMPT = `你是非权威行动候选编译器。你只能在给定的 opaque slot、原语、关系和效果类型内描述玩家尝试；不裁决成功，不创建实体，不输出 Canonical ID 或 RealityDelta，不把玩家断言当世界事实。
只输出一个 JSON 对象，严格字段为 kind、clauseIndex、primitives、targetSlots、conditions、effects、perceptionScopes、durationSeconds（可省略）、unresolvedDependencies。
kind 只能是 attempt、query、wait、speech、none、invalid。询问当前可感知状态用 query；尝试改变世界用 attempt；等待用 wait；发声用 speech；空输入用 none；无法形成意图用 invalid。
允许 primitives：perceive, orient, move, contact, apply_force, hold, release, place, change_relation, communicate, wait。
允许 effect kind：observation_scope, orientation, placement, contact, force, holding, relation, signal, time。
targetSlots 只能引用上下文中已经由上一阶段绑定并批准的 slot；未提供的对象不能猜测或创建，只能写入 unresolvedDependencies。
conditions 字段：kind, subjectSlot, predicate, source，可选 objectSlot 或 value；source 只能是 world_slice 或 operation_contract。
effects 字段：kind, subjectSlot, field, certainty，可选 objectSlot 或 value；certainty 只能是 required 或 possible。效果只是待验证候选。
perceptionScopes 字段：modality, originSlot, horizon, targetSlots。环顾使用 actor 的 ambient scope 和空 targetSlots，不得虚构“四周”实体。
unresolvedDependencies 字段：kind, reason，可选 slot。不确定时写依赖，不要猜世界值。
只输出最小候选：通常 1–4 个 primitives、0–2 个 effects。conditions 只写当前世界切片或操作契约明确提供的前置条件；不要自行列举常识条件。
perceptionScopes 只描述玩家明确尝试进行的观察，不描述动作成功后可能得到的触觉或视觉反馈。没有 perceive primitive 时必须为 []。
ambient 只用于无目标环顾，targetSlots 必须为 []；朝门外听或看用 directional；检查单个物体用 object；感受自身用 body。
除 observation_scope 外，所有 effect certainty 必须是 possible。模型不能要求世界变化发生。
例1 输入“看看四周”：kind="query", primitives=["perceive"], targetSlots=[], effects=[{"kind":"observation_scope","subjectSlot":"actor","field":"vision","certainty":"required"}], perceptionScopes=[{"modality":"vision","originSlot":"actor","horizon":"ambient","targetSlots":[]}], 其余数组为空。
例2 输入“听听门外”：primitives=["perceive"], targetSlots=["door"]，perceptionScopes 使用 hearing/directional/["door"]。
例3 输入“用手推门”：primitives=["contact","apply_force","change_relation"], targetSlots=["door"]，世界变化 effects 全部 possible，perceptionScopes=[]。
身体姿态变化属于 move + placement；如果输出 placement effect，primitives 必须包含 move 或 place。
所有数组即使为空也必须输出。禁止 Markdown、解释和额外字段。`;

export function buildActionProposalUserPrompt(rawInput: string, clauseIndex: number, context: ActionContext): string {
  const safeContext = {
    actorSlot: context.actorSlot,
    slots: context.slots.map(slot => ({slot: slot.slot, kind: slot.kind, label: slot.label,
      perceivable: slot.perceivable, affordances: slot.affordances})),
    allowedRelations: context.allowedRelations
  };
  return JSON.stringify({rawInput, clauseIndex, context: safeContext});
}
