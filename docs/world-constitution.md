# 世界宪法 v0.1

状态：reviewed draft
日期：2026-08-27
适用范围：文字虚拟现实 Demo 的 Canonical Reality、主体认识、世界结算与呈现
上位目标：`demo-goals.md`

## 0. 规范用语

- **必须**：实现不得违反；
- **不得**：明确禁止；
- **应该**：默认遵循，偏离必须记录理由；
- **可以**：允许但不要求；
- **暂缓**：首版不实现，但协议不得封死扩展位置。

本文定义不变量和权限，不定义数据库表、模型 Prompt、界面布局或具体场景内容。

## 1. 权威层级

世界中的权威顺序为：

```text
World Constitution
    ↓
Finalized Canonical History
    ↓
Current Canonical Reality
    ↓
Settlement Protocol and Deterministic Policy
    ↓
Validated Proposals
    ↓
LLM Proposals
    ↓
Presentation
```

规则：

1. 下层不得修改、覆盖或重新解释上层的权威内容；
2. LLM 输出默认没有世界权力；
3. Presentation 只能表达已经批准的信息，不能创造事实；
4. 任何实际世界变化必须通过唯一 Commit 边界；
5. 已 Finalize 的历史不能原地编辑。

## 2. 世界事实的种类

### 2.1 Canonical Fact

`CanonicalFact` 是世界当前承认的命题或约束。它必须至少具有：

- 稳定身份或规范地址；
- 内容或约束；
- `canonicalHeight`；
- `validFromWorldTime`；
- 可选 `validUntilWorldTime`；
- 来源事件、Collapse 或创世依据；
- 当前状态。

### 2.2 Event

`Event` 表示在世界中发生的事情。事件与事件后的状态不同：

```text
Event: 玩家尝试站起但腿麻，坐回沙发
State: 玩家仍坐在沙发上
```

事件必须有参与者、发生时间、因果来源和结果引用。没有状态变化的失败 Attempt 仍可以构成事件，但是否进入 Canon Log 由 Runtime Protocol 决定。

### 2.3 RealityDelta

`RealityDelta` 是一个 Height 中准备提交的最小现实变化集合，可以包括：

- 新事实；
- 事实终止；
- 实体/关系变化；
- Process 状态变化；
- 事件；
- 新增约束；
- 产生 Observation 所需的已结算信号。

任何子系统不得绕开 RealityDelta 直接更新物化世界。

### 2.4 Materialized State

当前世界状态是 Genesis 与 Finalized Commit Log 的派生视图。它可以缓存、重建和替换，但不能成为历史之外的第二权威来源。

## 3. 真值与未决状态

系统必须区分：

- `TRUE`：命题已被 Canon 支持；
- `FALSE`：命题的否定已被 Canon 支持；
- `ABSENT_IN_SCOPE`：在一个已经合法完整观察或穷举的范围内不存在；
- `UNRESOLVED`：有合法地址或约束空间，但尚未确定到当前所问程度；
- `UNKNOWN_TO_AGENT`：世界可能已定，但该主体没有合法认识路径；
- `UNSUPPORTED`：当前内核没有表达或裁决该命题的能力；
- `INVALID`：命题、引用或输入不满足协议。

规则：

1. `UNRESOLVED` 不等于随机、不等于不存在；
2. `UNKNOWN_TO_AGENT` 不得通过 Presentation 泄漏；
3. `ABSENT_IN_SCOPE` 必须有完整 scope 的合法依据；
4. `UNSUPPORTED` 不得由 LLM 临时扩展 Schema 解决；
5. 不得把模型置信度当作真值状态。

## 4. 双时间与历史最终性

### 4.1 World Height

`WorldHeight` 是逻辑和事务顺序。每个 Finalized Height：

- 具有唯一编号；
- 引用唯一 parent；
- 包含已批准输入、结算和 RealityDelta；
- 一经 Finalize 不得修改。

Height 不等于回合，也不等于固定秒数。

### 4.2 World Time

`WorldTime` 表示世界内部时间。不同 Height 可以推进不同长度：

- 瞬时反应可能小于一秒；
- 仔细搜索可能数分钟；
- 明确等待可以推进更长时间；
- Meta 输入可能不推进显著 World Time。

### 4.3 回溯有效事实

后来确定的过去事实必须同时记录：

```text
validFromWorldTime = 它在世界中从何时成立
canonicalHeight = 系统在哪个 Height 确定它
```

这不修改旧 Height。它是在当前 Height 新增一条有效时间指向过去的 Canonical Fact。

### 4.4 纠错

发现旧提交违法或损坏时，不得静默编辑。必须：

- 在 diagnostic replay 中报告；
- 阻止继续依赖不可信状态，或
- 通过显式 Correction Event/迁移记录说明修正来源和范围。

实现阶段必须区分世界内事实变化与系统数据纠错。

## 5. 主体输入与权限

玩家输入至少区分：

- `Attempt`：试图通过某种方法造成世界变化；
- `Query`：请求当前可获得的信息；
- `Recall`：请求已有认识或记忆；
- `Wait`：明确允许一段 World Time 推进；
- `Speech`：主体在世界内发出表达；
- `Meta`：对系统、界面或规则的请求；
- `None`：没有形成输入；
- `Ambiguous/Invalid`：无法安全构成。

规则：

1. 玩家只能提交意图、询问和表达，不能直接提交现实；
2. “我打开门”与“我试图打开门”在世界权限上等价；
3. 玩家可以声明主体当前想法、目标和注意方向，但不能借此声明外部事实；
4. 玩家关于隐藏事实、NPC 动机或结果的断言默认不受支持；
5. 输入中的不受支持断言不得成为 Collapse 的证据；
6. 有序动作必须保留顺序，后一步不能假设前一步成功；
7. 没有 Attempt 与“试图保持不动”不同；
8. Query 不得修改 Canon 或迫使无关事实坍缩；
9. Meta 请求不能绕过主体认识边界读取隐藏世界。

## 6. 行动裁决

### 6.1 Fiction First

裁决必须先读取当前现实、主体能力、方法、目标和阻力，再决定是否需要不确定性处理。不得先选择一个戏剧结果再补理由。

### 6.2 直接结果

当满足以下条件时，行动应该直接结算，不强制随机性：

- 结果由已定事实唯一支持；
- 没有有意义的阻力；
- 失败不会产生独立有意义的世界分支；
- 不依赖未决投影。

### 6.3 不确定结果

首版不预设骰子。Runtime Protocol 必须定义有限、可审计的不确定性来源。LLM 自由选择不是随机机制，也不是合法裁决依据。

### 6.4 失败、部分结果与代价

- 失败必须来源于已提交事实、合法 Process、明确不确定性机制或动作方法；
- 部分结果必须说明哪些目标已经实现、哪些未实现；
- 代价必须与行动因果相关，不得为了“故事更有趣”添加；
- 已发生的动作序列前缀不得因后续失败被叙述回滚；
- 失败反馈应该包含主体自然可感知的具体阻力，但不得附赠隐藏原因。

### 6.5 不可能与不支持

- 物理或逻辑不可能应按当前事实失败；
- 内核不支持应返回 `UNSUPPORTED`，不得伪装成世界内不可能；
- 信息不足不自动等于失败，应判断是否允许合法 Collapse、保守部分结果或澄清。

## 7. 世界变化来源

RealityDelta 可以由以下来源提出：

1. `Intentional`：主体的 Deliberative Attempt；
2. `Reactive`：刺激触发的即时反应；
3. `Endogenous`：实体内部持续过程；
4. `Exogenous`：环境、远端主体或外部过程；
5. `Collapse`：当前结算必要的最小 Canonical Constraint；
6. `Correction`：显式数据纠错，不属于普通世界事件。

所有来源都必须进入同一 Settlement 与 Commit 边界。身体系统、天气系统和 NPC 控制器都没有直接写权限。

## 8. 自主过程与世界时间

### 8.1 Process

`Process` 表示不依赖当前玩家 Attempt 仍会推进的因果过程，例如：

- 水壶加热；
- 饥饿或疲劳；
- 伤口流血；
- 日照变化；
- NPC 在别处的行为计划。

### 8.2 调度

- Process 应按 World Time、状态和触发条件计算；
- 不需要每毫秒 tick；
- 可以调度下一个具有语义意义的转换；
- 不得因为玩家连续探索或反馈者觉得无聊而人为触发；
- 到期 Process Event 必须和同一 Height 的 Attempt 按明确顺序或并发规则结算。

### 8.3 无主动 Attempt

没有玩家 Attempt 仍可以产生合法 Height，但 Runtime Protocol 必须说明 Height 为什么开启、World Time 如何推进以及何时向主体投递 Observation。

## 9. 具身与控制边界

### 9.1 Embodiment

主体通过身体访问世界。身体至少可以定义：

- 可控制能力；
- 控制粒度；
- 感官通道与带宽；
- 自主体感受；
- 自主身体系统；
- 压力与生理限制。

首版只实现场景必需子集，但不得假设意识拥有身体全部写权限。

### 9.2 控制粒度

一个意图可以是：

- 精确控制；
- 分布式影响；
- 触发自动序列；
- 当前不可及。

控制不足不应只返回抽象“做不到”，而应返回实际产生的部分身体结果。

### 9.3 自主身体系统

- 自主系统由已提交身体状态和刺激触发；
- 不占主体的 Deliberative Attempt 槽；
- 不保证帮助主体；
- 不得为保护、惩罚或引导玩家临时生成；
- 主体可能感知其结果但不知道其内部机制。

### 9.4 Pressure

饥饿、疼痛、疲劳、温度等 Pressure：

- 是持续因果状态，不是命令；
- 可以产生 Sensation、约束或能力变化；
- 不要求主体服从；
- 主体忽略后仍会继续推进。

## 10. 感知与认识

### 10.1 分层

系统必须保持：

```text
Canonical Reality
→ Perception Projection
→ Sensation
→ Observation
→ Evidence / Acquisition
→ Inference
→ Belief
→ Memory
```

首版可以不实现完整 Belief/Memory 引擎，但不得把这些层压成一段无来源文本。

### 10.2 Sensation

Sensation 是身体通道产生的体验信号，例如压力、疼痛、亮度、声响或温度。它必须由身体状态、事件和感官通道支持。

### 10.3 Observation

Observation 是主体可获得的结构化感知结果。它必须：

- 指明 observer；
- 指明 modality 或合法来源；
- 引用支撑它的事实/事件；
- 具有 scope 和发生 Height；
- 不包含主体不能感知的原因、身份或值。

### 10.4 Inference

Inference 是从 Observation、Evidence 和既有概念得出的解释。规则：

- 不自动成为 Canon；
- 不得伪装成直接 Observation；
- 可以被后续证据修正；
- 修正不改变旧 Observation；
- 系统内部推理只有在产品明确需要时才进入主体 Epistemic State。

### 10.5 Agent-relative Knowledge

- 世界已定不等于主体知道；
- 一个主体知道不等于其他主体知道；
- 证言产生 Evidence，不直接产生 WorldTruth；
- 记忆读取不得修改被记忆的事实；
- 主体别名和分类可以与 Canonical Entity ID 分离。

## 11. Presentation

### 11.1 权限

Renderer 只能读取 `ApprovedPresentationPacket` 或等价的已批准结构，不能读取完整 Canon、被拒候选或内部推理。

### 11.2 禁止行为

Presentation 不得：

- 增加新实体、状态、动机、历史或因果；
- 把“较短”改写成“因此经常移动”；
- 把“猫没有靠近”改写成“猫不信任你”；
- 为文学气氛补充未提交天气、声音、动作或情绪；
- 暴露内部 ID、评分、Prompt 或模型推理；
- 因玩家善意而制造 NPC 情感奖励；
- 因玩家迷茫而偷偷加入提示。

### 11.3 允许行为

Renderer 可以：

- 合并同一时空内已批准的共同感觉；
- 使用主体已经拥有的正常类别概念；
- 调整语序、代词和自然语言流畅度；
- 明确表达边界、模糊性和失败；
- 在不改变信息内容时匹配输入语言。

每次反馈不强制“附赠”信息。共同感知必须来自同一时空、注意和感官带宽下的自然显著项。

## 12. Truth Collapse

### 12.1 定义

Collapse 是在当前 Settlement 被合法未决投影阻断时，为 Canon 增加最小充分约束。它不是自由创作，也不等于总是选出单一值。

### 12.2 必要条件

Collapse 只有在以下条件全部满足时才允许：

1. 未决项有合法 Canonical Address 或获准创建路径；
2. 当前结算确实无法在不读取它的情况下继续；
3. 该项不是由玩家当前不受支持断言首次引入；
4. 该项属于当前内核支持的 Schema 与约束类型；
5. 没有更小的约束或保守结果可以完成结算；
6. CollapsePolicy 批准其因果半径和值域。

### 12.3 最小性

- 只解决当前 blocking dependency；
- 可以确定存在性而保持身份未决；
- 可以缩小约束空间而保持非单例；
- 不得补充姓名、背景、亲属、秘密、阴谋或世界历史，除非它们本身就是获准的 blocking dependency；
- 提案必须列出刻意保持未决的内容。

### 12.4 因果半径

至少区分：

- `local`：短期、局部、低传播；
- `persistent`：身份、长期关系、可被未来多次引用；
- `structural`：改变世界结构、历史或大量实体。

低半径可以由确定性政策自动批准；更高半径必须升级审查。首版可以完全禁止 structural Collapse。

### 12.5 权限

确定性代码或声明式 Policy 必须先决定：

- 是否存在 blocking dependency；
- 允许 Collapse 的地址；
- 约束类型；
- 值域；
- 最大因果半径。

LLM 只能在批准空间内提出候选，不能自行扩大地址和值域。Committer 是唯一提交者。

### 12.6 禁止的枪式诱导

玩家说“抽屉里一定有枪，我把枪拿出来”时：

- “枪存在”是不受支持断言；
- 它不能创建合法实体引用；
- 它不能授权 Collapse；
- 系统不得通过“为裁决拿枪必须先决定枪是否存在”绕过本条；
- 可以返回目标未落地、先观察/打开抽屉，或执行输入中独立可成立的合法前缀。

## 13. Settlement Closure

一个 Height 可以包含有限的即时因果闭包：

```text
Primary Effect
→ Immediate Reaction
→ Secondary Effect
→ semantic stability or budget limit
```

规则：

- 只有在当前时间尺度上不可合理推迟的反应进入同一闭包；
- 闭包必须有深度、事件数或时间预算；
- 超出预算的因果不能丢弃，应转为后续 Scheduled Event；
- 闭包中的每一步都要有原因和来源；
- 反射不占主体主动 Attempt；
- 不得以闭包为借口无限续写故事。

## 14. LLM 权限

### 14.1 可以做

LLM 可以：

- 提出原文中的目标、方法、修饰、mention 和顺序；
- 对已批准事实提出非权威相关性判断；
- 在 Policy 批准的 Collapse 空间内提出候选；
- 在 Approved Presentation 内容范围内组织文字；
- 输出审查意见。

### 14.2 不可以做

LLM 不得独占决定：

- Canonical Entity ID；
- 输入是否具有世界写权限；
- 规范操作标签；
- 感知可读取的 Canon 范围；
- Collapse 必要性、地址、半径和值域；
- RealityDelta；
- Commit；
- 已 Finalize 历史的解释权。

### 14.3 故障

以下都属于正常且必须处理的故障：

- 超时；
- 容量错误；
- 无最终 content；
- 非法 JSON；
- 字段缺失、额外字段或错误类型；
- 引用不存在；
- 语义越权；
- 多次运行不一致。

故障不得产生部分提交。重试不能改变权限规则，也不能无限进行。

## 15. Validation 与 Commit

### 15.1 Validator

提交前至少验证：

- Schema 和字段类型；
- 引用存在性；
- source-span 或输入承诺来源；
- 前置状态与 revision；
- 因果闭包；
- 时间一致性；
- 关系和实体不变量；
- Observation 可感知性；
- Collapse 授权和最小性；
- Presentation 来源闭包；
- RealityDelta 不包含候选推理或内部评分。

### 15.2 Committer

- 唯一拥有 Canon 写权限；
- 原子提交一个 Height；
- 验证 parent 和连续编号；
- 支持同一内容的幂等重试；
- 拒绝同一 identity 的冲突内容；
- 检测陈旧依赖；
- 成功后生成可重放记录与状态根。

### 15.3 Finalize

Finalize 后：

- 当前 Height 不可修改；
- 后续系统只能读取并追加；
- Observation 可以在下一 Height 投递；
- 非权威审计记录可以追加分析，但不能改变世界。

## 16. 反剧情偏转原则

世界裁决不得为了以下目的改变因果结果：

- 奖励玩家善意；
- 惩罚玩家错误；
- 把玩家导向预设场景；
- 防止玩家错过“内容”；
- 制造紧张、反转或平衡节奏；
- 让系统显得聪明；
- 迎合输入中的期待。

这不表示 NPC 没有偏好，也不表示产品不关心用户。NPC 可以依据自身状态和目标行动；产品可以改善可理解性、安全和延迟，但不得反向改写世界结果。

## 17. 诚实边界与安全失败

当系统不能合法继续时，必须区分并表达：

- 当前世界内失败；
- 主体无法感知；
- 目标未落地或有歧义；
- 当前能力不支持；
- 模型/服务暂时失败；
- 提交冲突需要重新读取；
- 世界边界尚未建模。

不得使用虚构世界事实掩盖系统故障。边界响应本身不得提交不必要 Canon。

## 18. 宪法级验收不变量

1. 所有 Canon 变化都经过唯一 Commit；
2. Finalized Height 只追加不覆写；
3. Materialized State 可由历史重建；
4. 玩家断言不直接成为现实；
5. Query 不修改 Canon；
6. 主体未知信息不进入 Presentation；
7. Observation 与 Inference 不混同；
8. Renderer 不能创造事实；
9. 身体、天气、NPC 等没有旁路写权限；
10. Collapse 只处理获准 blocking dependency；
11. 枪式诱导永远不能创造枪；
12. LLM 故障产生零部分提交；
13. NPC 按自身状态行动，不按玩家表现发奖励；
14. World Time 与 Height 分离；
15. 无主动 Attempt 时 Process 仍可推进；
16. 所有 Observation 有来源；
17. 所有提交可审计；
18. 不支持与世界内失败不混淆。

## 19. 首版暂缓

- 完整 Belief Revision；
- 错误记忆与复杂心理模拟；
- structural Collapse；
- 玩家可调用的独立 alias/define API；
- 多玩家一致性；
- 大规模 NPC 社会；
- 通用概率与骰子系统；
- 图片 Observation；
- 离线长期世界推进。

暂缓项不得被 LLM 以自由文本形式偷偷实现。

## 20. 待 Runtime Protocol 决定

本文有意不决定：

- 一个 Height 的确切阶段枚举和失败状态机；
- 数据结构字段的最终 TypeScript 形状；
- SQLite、JSONL 或其他存储；
- 不确定性机制；
- Closure 预算数值；
- CollapsePolicy 的具体地址白名单；
- 正常 Height 的超时与重试次数；
- Observation salience 的计算；
- UI 和传输协议。

这些决定不得违反本文不变量。

## 21. 冻结条件

本文在以下条件满足后可标记为 `frozen`：

- 推门、等待水壶和枪式诱导三个 Height 手工走通；
- 没有步骤需要未定义的写权限；
- `demo-goals.md` 不需要扩大范围；
- 每条宪法级不变量都有计划中的正例和反例；
- Runtime Protocol 能在不修改本条款的前提下定义状态机。
