# SemanticIntentFrame 可行性спайк（真实 Qwen）

日期：2026-08-28
分支：`experiment/semantic-intent-spike`（不基于此文档做任何合并/发布决策）
触发：`architecture-redesign-plan-v0.1.md` A2/A3 假设——"模型只表达意图/角色/方法，而不是 primitives/effects"以及"给模型持续世界语境而不是每轮失忆的 opaque slot"——在写四份正式设计文档（D1–D4）前，先用真实 `@cf/qwen/qwen3.8-27b` 做最小可行性验证，回答"这条路线值不值得投入设计"，而不是"这条路线的完整接口长什么样"。
产物：`experiments/semantic-intent-spike/`（`world.mjs`、`cases.mjs`、`prompts.mjs`、`run.mjs`、`results/latest.json`）

## 方法

9 个静态案例 + 1 个两轮指代消解案例，每个静态案例同时跑两条臂：

- **NEW**：本次起草的 `SemanticIntentFrame` prompt/schema（`prompts.mjs`），世界语境包含 placement、properties（含声明为 `"unresolved"` 的属性）、当前 holding 关系；
- **OLD**：生产环境现用的 `ACTION_PROPOSAL_SYSTEM_PROMPT`/`ACTION_PROPOSAL_JSON_SCHEMA`（直接从 `dist/src/ai/action-proposal-prompt.js` 导入，未做任何改动），世界语境是生产实际使用的 opaque slot（`action-scene.ts` 的真实形状：slot/kind/label/perceivable/affordances，不含 placement/properties/holding）。

两臂使用同一批实体源（`world.mjs`），保证行为差异只来自 prompt/语境形状，不是场景被我动了手脚。OLD 臂的输出额外跑生产的 `parseActionProposal` 校验，判断是否会在真实 runtime 里通过 `VALIDATE`。全部 21 次调用均为真实 Cloudflare Workers AI 请求（`temperature=0`），无 mock、无本地 fake，未触碰 `secret/` 之外的任何东西。

## 结论先行

**A2/A3 的核心方向值得继续投入 D2/D3 设计**，理由不是抽象论证，而是这次真实调用**逐字复现了两轮真人测试报告的两个具体 bug**，并且新 prompt 结构性地避免了它们；但也暴露了三个新 prompt 自身需要在设计阶段补的漏洞，以及一个测试设计上的混杂因素（下方"不能算数的部分"）。这不是"架构已验证"，只是"值得把 D1–D4 写下去，而不是继续在纸面猜测"。

## 复现的真实 bug（强证据）

### 1. "走到门前去" —— OLD 臂原样复现了 `human-test-direction-review-2026-08-28.md` #1

OLD 臂输出：
```json
{"primitives":["move"],"targetSlots":["door-1"],
 "effects":[{"kind":"placement","field":"at","subjectSlot":"actor","objectSlot":"door-1"}]}
```
这就是真人测试记录里"错误地把 `placement:self` 写成 `door-1`"的同一形状——`field="at"` 把"主体走到门前"和"主体被放置为 door-1 的内容/位置"编码成同一件事，door-1 不是房间，下游按房间语义读取必然出问题。这不是我编的失败案例，是同一 schema 在同一输入上产生了同一种混淆，真实复现了导致下一步"我在哪里"内部不变量失败的根因。

NEW 臂输出：`roles.destination="door-1", destinationRelation="near"`。因为 schema 强制模型在"精确定位/进入容器/靠近/移到下方/移到表面/朝向/阻挡"之间选一个，模型选对了 `near`——结构上就不可能再产生"主体成为门的内容物"这种混淆。

### 2. "把毛毯堵到门缝下面"（已持有毛毯）—— OLD 臂复现 #2

OLD 臂在语境完全没告诉它"演员已经拿着毛毯"的情况下（因为生产 opaque slot 语境本来就不包含 holding 状态），输出 `primitives:["hold","place"]`——重新执行了一次 hold。这正是真人测试报告里"组合计划没有根据当前状态消除幂等前缀"的那个 bug。这次实验证明了根因的一部分：**不是规划逻辑忘了检查状态，是模型从一开始就没有被给过"当前已经拿着"这个信息**，所以它按"从头开始"的默认脚本生成候选。

NEW 臂（语境包含 `actor.holding=["blanket-1"]`）输出 `intent="object_place"`，没有 hold 步骤，并且主动把"毛毯能否塞进门缝"列进 `unresolvedDependencies`（对应 fixture 里真实存在的 `fit:blanket-1:under_gap:door-1` TruthCell）——没有要求重新拿取。

## 新 prompt 暴露的问题（不是免费午餐）

1. **kind 与 intent 不自洽**："看看门外"、"查看毛毯"两个纯查询案例，`intent="observe"` 但 `kind` 却给了 `"attempt"` 而不是 `"query"`。旧 schema 有硬规则"`query` 必须带 `perceive` primitive"，新 schema 没有等价约束。D2 必须把"observe ⟺ query"这类闭合规则写进 validator，不能指望模型自己保持一致。
2. **"看看门外"越权解析穿透了遮挡**：新 prompt 直接把 `targetSlot` 解析成 `hallway`（门另一侧的房间），而不是 `door-1`（正在被看的、当前关闭的物体）。旧 prompt 保守地停在 `door-1`。这说明新 schema 的 `perceptionFocus.targetSlot` 定义得不够严格，容易诱导模型替可信层做"隔着关闭的门能看到走廊"这个应由 occlusion policy 决定的判断。需要在 D2 里明确"感知 target 必须是被直接指向的最近对象，不能预判遮挡结果"。
3. **旧 schema 诱导数值幻觉**："轻轻推门，只开一条缝"，OLD 臂给出 `aperture_cm: 2`（一个模型编的具体数字），NEW 臂完全不产生这类数值，只记录 `method` 的定性描述。这是对 A5 的一个侧面佐证：允许模型在 effect 里填具体数值，就是在鼓励它替代本该由确定性层（或 Collapse）决定的结果。
4. **gun-induction 下 OLD 臂直接 `MODEL_INVALID_SCHEMA`**：模型很自然地想把"抽屉""枪"作为 `unresolvedDependencies[].slot` 写出来，但旧 schema 的 `assertSlot` 要求 `slot` 必须引用已知 slot，于是校验直接失败（`validation: invalid: unresolvedDependencies[0].slot references an unknown slot`）。新 schema 的 `referenceExpressions[].resolvedSlot: string|null` 允许"提到但确认绑定失败"这件事本身合法存在，不会让一次合理的模型行为变成 schema 崩溃。这是新方向一个具体的、非空想的健壮性收益。

## 值得警惕、不能直接算数的部分

- **两轮指代消解案例结果不干净**。Turn 1"看看手里有什么"，NEW 臂没能把 `theme` 解析到 `blanket-1`（只給了 `roles.theme=actor`），于是我脚本里派生的 `discourse.recentFocus` 传到 Turn 2 时是 `null`。但 Turn 2"把它铺开"两条臂居然都独立猜对了 `blanket-1`——大概率不是靠指代消解成功，而是因为这个六实体玩具世界里 `blanket-1` 是唯一带 `place`/`deformable` affordance 的物体，"能被铺开的东西"本来就只有一个候选。**这个案例没有真正测出 discourse 机制是否有效**，需要在场景里加至少一个干扰对象（比如同时有地毯和毛毯都能"铺"）重测，才能说这件事成立或不成立。
- 样本量很小（每个 case 只跑了 1 次，`temperature=0` 但 Cloudflare 端不保证严格确定性），不构成统计意义上的可靠性证据，只能定性说明"结构上是否可能"。
- "毛毯铺到地面"案例两臂都成功，是因为当前 fixture（`demo-fixture.ts`）在 `c478587` 提交里已经补了 `floor-1` 实体——这个案例现在测不出 D2 想验证的东西了，只是回归确认没有变差。

## 延迟

NEW 臂 11 次调用：中位 ≈15.8s，范围 7.2s–38.3s（首次调用最慢，可能是冷启动）。OLD 臂 10 次：中位 ≈13.6s，范围 5.5s–42.2s。两者量级相当，新 prompt 没有系统性地更慢，但也没有解决 `phase8d-free-session-evaluation-2026-08-28.md` 已经指出的"11 秒中位、近 30–45 秒 P95 对文字 VR 仍然太慢"的问题——这是独立于本次架构方向的另一个轴，两种 prompt 都没有改善它。

## 建议

1. 不要因为这次结果就跳过 `architecture-redesign-plan-v0.1.md` 的 R0–R4；这次 spike 只解决了"模型能不能做到"这一个最大的不确定性，D2/D3 里"依赖图如何展开到叶子属性""Collapse 跨动作复用"等设计问题这次完全没有触及。
2. 写 D2（`semantic-operation-architecture.md`）时可以直接把本次验证过的 `SemanticIntentFrame` 草案作为起点，但要在最小接口草案里补上：`kind`/`intent` 一致性约束、感知 target 不得穿透遮挡、以及"提到但未绑定"的合法表达方式（已经证明比旧 schema 健壮）。
3. 在正式设计 D3 前，用一个带干扰物的场景重跑指代消解案例，不要带着"discourse 机制已验证"的错误印象进入设计。
4. 延迟问题需要单独立项处理（比如探索更小的 `max_completion_tokens`、更激进的 prompt 裁剪，或接受它作为已知产品约束），不属于这次架构方向要解决的范围。

## 原始数据

完整 21 条请求/响应（含 latency、finishReason、usage、schema 校验结果）见 `experiments/semantic-intent-spike/results/latest.json`。
