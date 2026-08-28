// NEW arm: candidate SemanticIntentFrame prompt, testing architecture-redesign-plan-v0.1.md
// hypothesis A2 (model expresses intent/roles/method, not primitives/effects) and A3
// (persistent context -- holding/placement -- instead of per-turn amnesia).
//
// This is a spike prompt, not production. It has not gone through the same hardening
// as src/ai/action-proposal-prompt.ts.

export const SEMANTIC_INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "intent", "roles", "referenceExpressions", "unresolvedDependencies"],
  properties: {
    kind: {type: "string", enum: ["attempt", "query", "wait", "speech", "none", "invalid", "ambiguous"]},
    intent: {type: "string", enum: [
      "self_move", "object_place", "object_move", "apply_force", "hold", "release",
      "orient", "observe", "communicate", "wait", "none"
    ]},
    roles: {
      type: "object", additionalProperties: false, required: ["agent"],
      properties: {
        agent: {type: "string"}, theme: {type: "string"}, instrument: {type: "string"},
        source: {type: "string"}, destination: {type: "string"},
        destinationRelation: {type: "string", enum: ["at", "near", "into", "under", "onto", "toward", "blocking"]}
      }
    },
    method: {type: "string"},
    expectedOutcome: {type: "string"},
    perceptionFocus: {
      type: "object", additionalProperties: false, required: ["modality", "horizon"],
      properties: {
        modality: {type: "string", enum: ["vision", "hearing", "touch", "proprioception", "interoception"]},
        horizon: {type: "string", enum: ["ambient", "directional", "object", "body", "self"]},
        targetSlot: {type: "string"}
      }
    },
    referenceExpressions: {
      type: "array",
      items: {type: "object", additionalProperties: false, required: ["text", "resolvedSlot"],
        properties: {text: {type: "string"}, resolvedSlot: {type: ["string", "null"]}, note: {type: "string"}}}
    },
    unresolvedDependencies: {
      type: "array",
      items: {type: "object", additionalProperties: false, required: ["role", "reason"],
        properties: {role: {type: "string"}, reason: {type: "string"}}}
    }
  }
};

export const SEMANTIC_INTENT_SYSTEM_PROMPT = `你是非权威语义意图编译器。你只能在给定的世界语境（entities 及其属性、关系、当前持有物）内，把玩家的自然语言表达为一个语义意图候选；不裁决成功，不创建实体，不输出 Canonical ID 或世界效果，不把玩家断言当世界事实，不决定 unresolved 属性的值。
只输出一个 JSON 对象，字段为 kind、intent、roles、method（可省略）、expectedOutcome（可省略）、perceptionFocus（可省略）、referenceExpressions、unresolvedDependencies。

kind 只能是 attempt、query、wait、speech、none、invalid、ambiguous。

intent 只能是闭合词汇：self_move（主体自身移动/接近/进入某处，不改变其他对象状态）、object_place（把已获得或将获得的对象放置/铺开到某处）、object_move（移动一个对象本身，不一定被拿在手上，比如推/拖大件家具）、apply_force（施力但不必然移动，比如推门/敲）、hold（拿起/抓住）、release（放开/松手）、orient（转身/朝向）、observe（观察/查询，不改变世界）、communicate（说话/发声）、wait（等待）、none（无有效意图）。

roles 至少包含 agent（通常是 actor）。theme 是被观察或被改变状态的主要对象；instrument 是被用来达成效果的工具/材料；source 是起点；destination 是终点、目标位置或目标对象，只能引用世界语境里已给出的 slot，不能创造新 slot 名。destination 如果只是"靠近/面向"某物而不是"进入/成为其容纳关系"，必须用 destinationRelation 明确区分：at=精确定位、near=靠近不改变容纳关系、into=进入其空间容器、under=移到其下方、onto=移到其表面、toward=朝向、blocking=试图形成阻挡关系。不要把"主体走到某物旁边"和"某物被放置到主体身上/主体成为该物体的内容物"混为一谈；主体自身移动的 destination 语义上永远是"主体新的空间关系"，不是"主体变成该物体的内容物"。

method 是玩家表达的方式/手法的简短中性复述（比如"轻推""铺开""拖"），不得添加玩家没说的手法。expectedOutcome 是玩家似乎想达成的状态的简短复述，必须明确只是玩家的意图或期望，不是世界结果，不得断言已经发生、不得断言成功或失败。

perceptionFocus 只有当这次表达涉及主动观察时才输出：modality 是感官通道；horizon 是范围（ambient=环顾无目标、directional=朝某方向、object=看单个物体、body=身体内部感知、self=主体自身状态如位置姿态）；targetSlot 只在 horizon 为 directional/object 时给出，且必须是已知 slot。环顾/自身状态查询不得发明 targetSlot。

referenceExpressions 列出输入中每个指称表达（包括代词"它/这个/那个"）与其在世界语境或对话语境（discourse 字段）中最可能对应的 slot；如果无法在给定语境中确定对应 slot，resolvedSlot 必须是 null，不得猜测或发明一个新对象；note 可以简短说明消歧依据（比如"根据 discourse.recentFocus"）。

unresolvedDependencies 列出这个意图依赖但当前语境未给出确定值的东西（比如某属性是 unresolved、某目标未在语境中出现、某能力未知），每项给出 role（对应哪个语义角色或方面）和 reason；不得为了让 intent 显得完整而跳过应该列出的依赖。

如果玩家提到的对象、地点或角色在给定世界语境中完全找不到对应 slot，且无法从对话语境中合理绑定（比如声称一个从未被观察到、场景描述中也不存在的物品），kind 必须是 invalid 或 ambiguous，theme/destination 等角色不得指向任何 slot，只能通过 referenceExpressions（resolvedSlot=null）和 unresolvedDependencies（reason 说明为何无法绑定）表达；绝不能为了配合玩家的断言而创造一个新 slot 或假装该 slot 存在。

只输出 JSON，不得使用 Markdown、解释或额外字段。`;

export function buildSemanticIntentUserPrompt(rawInput, context) {
  return JSON.stringify({rawInput, context});
}
