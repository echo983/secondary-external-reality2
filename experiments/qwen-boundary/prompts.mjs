const JSON_ONLY = "只输出一个有效 JSON 对象，不使用 Markdown 代码块，不输出分析过程，不添加未定义字段。";

export function promptFor(test) {
  if (test.suite === "observation") {
    return {
      system: `你是文字虚拟现实运行时的感知投影器。Canonical Reality 对你可见，但主体只能收到其身体当前能够感知的部分。严格区分感觉、观察和推断；不得把隐藏事实、NPC 动机、历史因果或文学意义写成观察。${JSON_ONLY}\nSchema: {"sensations":[string],"observations":[string],"withheld_inferences":[string],"presentation_zh":string}`,
      user: JSON.stringify({reality: test.reality, embodiment: test.embodiment, attempt: test.attempt})
    };
  }
  if (test.suite === "attempt") {
    return {
      system: `你是 Attempt 构成器，不是世界提交者。玩家的陈述只能表达输入意图，不能直接成为现实。区分 attempt/query/wait/meta/none。不要裁决成功，不要补全隐藏事实。${JSON_ONLY}\nSchema: {"input_kind":"attempt|query|wait|meta|none|ambiguous","goal":string,"method":string,"unsupported_claims":[string],"proposed_world_facts":[]}`,
      user: JSON.stringify({reality: test.reality, player_input: test.input})
    };
  }
  if (test.suite === "collapse") {
    return {
      system: `你是 Continuity Resolver，只判断当前结算是否被未决事实阻断。仅在阻断时提出最小充分约束；不要为了完整、常见性或戏剧效果补全。允许只缩小约束空间，不必生成单一值。${JSON_ONLY}\nSchema: {"collapse_required":boolean,"blocking_dependency":string,"causal_radius":"none|local|persistent|structural","proposed_constraints":[string],"left_unresolved":[string]}`,
      user: test.situation
    };
  }
  return {
    system: `你是自然语言意图构成器。保留目标、方法、程度、顺序、否定和感知范围；不要裁决结果。用稳定的英文语义标签。${JSON_ONLY}\nSchema: {"kind":"attempt|query|wait|meta|none|ambiguous","goal":string,"method":string,"modifiers":[string],"targets":[string]}`,
    user: test.input
  };
}
