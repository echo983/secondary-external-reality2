# 文字虚拟现实 Demo：MVP 设计文档编写计划 v0.1

状态：计划草案  
日期：2026-08-27  
适用范围：`secondary-external-reality2` 首个文字体验 Demo 进入编码前的设计基线

## 1. 目标

在开始编写新运行时代码前，形成四份互相约束、可以验证且足以指导实现的核心文档：

1. `demo-goals.md`：定义 Demo 要验证什么、明确不做什么；
2. `world-constitution.md`：定义世界运行不可违反的原则和权限边界；
3. `runtime-protocol.md`：把原则落实为数据对象、World Height 状态机和提交协议；
4. `adjudication-cases.md`：用正例、反例和对抗案例将前三份文档变成可检验规格。

编写顺序为：

```text
旧项目遗产提取
    ↓
demo-goals.md
    ↓
world-constitution.md
    ↓
runtime-protocol.md
    ↓
adjudication-cases.md
    ↓
交叉审查并冻结 MVP 设计基线
```

旧项目 `echo983/secondary-external-reality` 属于同一作者，可以自由提取设计、代码和测试成果，不存在许可证障碍。新项目仍以新的 `World Height + Settlement` 架构为准，不整体继承旧工程的历史复杂度。

## 2. 工作原则

- 先证明一个小型文字世界能够持续、一致、可追溯地存在，再扩展内容规模和表现形式；
- 旧项目是经过验证的实验和零件库，不是新项目必须兼容的上游系统；
- 优先继承旧项目已经证明有效的不变量、测试和通用算法；
- 不默认继承多代 IR、卧室专用路由、兼容双写、SSH 主入口和双模型工位；
- 文档中的规范性条款必须能够映射到实现责任和测试案例；
- 重要术语在四份文档中保持唯一含义；
- 在前三份文档尚未稳定之前，不提前固定数据库和模型供应商。

## 3. 前置工作：旧项目遗产提取

### 3.1 目的

确认哪些结论已经被旧项目的实现、自动化测试或真人实验验证，避免重新争论或重复开发；同时区分哪些旧结构仅仅是演进遗留，不应进入新内核。

### 3.2 主要来源

- `README.md`；
- `docs/CONTEXT-HANDOFF-2026-08-23.md`；
- `docs/MVP-world-kernel-protocol-v0.1.md`；
- `docs/MVP-canonical-epistemic-kernel-*`；
- `docs/MVP-layer-a-acceptance-tests-design-v1.0.md`；
- `docs/DEMO-PHASE-*`；
- `src/protocol/`；
- `src/epistemic/`；
- `src/replay/`；
- `src/presentation/`；
- `src/verification/`；
- `test/` 和 `src/eval/`。

### 3.3 提取分类

每项旧成果按以下格式记录在工作笔记中：

| 项目 | 说明 |
|---|---|
| 旧成果 | 旧项目中的设计、类型、实现或案例 |
| 验证证据 | 对应文档、测试、真人结果或代码位置 |
| 新架构映射 | 它在 World Height/Settlement 架构中的位置 |
| 处理决定 | 原样复用、改写吸收、仅作案例或放弃 |
| 风险 | 历史耦合、场景硬编码、依赖或尚未验证之处 |

重点评估：

- Canonical Reality 与 Epistemic State 分层；
- Observation、Evidence、Acquisition 和 Presentation 权限链；
- append-only commit、幂等提交、并发保护和确定性回放；
- LLM 只可解释与提案、不可直接提交现实；
- 隐藏信息、查询合流、记忆、证言和越界拒绝测试；
- `commitSequence` 向 `WorldHeight` 的升级方式；
- 旧条件化候选体系中值得吸收和应当删除的部分。

### 3.4 完成标准

- 能明确指出哪些不变量已经被旧项目验证；
- 每个准备复用的实现都有新架构中的明确归属；
- 没有因“代码已经存在”而默认继承不符合新主轴的组件；
- 为后续四份文档准备好可引用的旧测试和失败案例清单。

## 4. 文档一：`demo-goals.md`

### 4.1 目的

冻结首个 Demo 的产品假设、体验边界和成功标准，防止运行时设计滑向完整开放世界或通用游戏引擎。

### 4.2 计划内容

#### 产品假设

核心待验证假设：

> 一个由不可逆事实、主体视角和语义裁决构成的文字世界，是否能被玩家体验为一个独立存在的现实，而不是顺从玩家续写的聊天机器人？

#### 目标体验

定义：

- 首轮体验面向的用户；
- 用户进入时已知的信息；
- 输入和反馈形式；
- 单次体验时长；
- 希望用户产生的主观感受；
- Demo 应如何体现“世界独立于玩家意愿”。

#### 必须验证的能力

首版暂定验证六项：

1. 玩家可以用自由文字表达 Attempt；
2. 玩家意图不等于现实结果；
3. 世界状态跨多个 Height 保持一致；
4. 玩家只能获得角色有合法路径感知、记忆或获知的信息；
5. 没有玩家主动行动时，自主过程和他者行为仍可推进世界；
6. 每个现实变化均可追溯并可由提交历史重放。

#### 明确非目标

至少明确排除：

- 多玩家；
- 大型开放世界；
- 完整人体、生理或物理模拟；
- 完整 NPC 社会；
- 战斗、成长和经济系统；
- 图片生成；
- 真正的区块链或密码学共识；
- 完整内容包和通用游戏引擎；
- 长时间离线持续运行；
- 无限制生成实体、规律和世界历史。

#### Demo 场景轮廓

先冻结一个微型场景，暂定包含：

- 卧室、走廊、厨房或客厅组成的少量空间；
- 一个玩家主体；
- 一个 NPC；
- 一项不可直接观察的隐藏事实；
- 一个持续推进的自主过程；
- 一个需要在使用时最小坍缩的未决事实；
- 一条可触发即时反应闭包的因果链。

旧项目的卧室—走廊—客厅以及纸条、记忆、证言实验优先作为场景基础，但不要求兼容原实现。

#### 成功指标

至少覆盖：

- 连续运行 50～100 个 Height 不出现显著事实矛盾；
- 隐藏信息不泄漏；
- 任意状态可以从初始状态和 Commit Log 重放；
- 每条新增事实能追溯到 Attempt、Process、Reaction、Exogenous Event 或 Collapse；
- 自主过程确实能够在无主动 Attempt 时推进；
- 人类评审认为大多数裁决合理且世界表现独立；
- 记录响应延迟、模型调用次数和 token 成本。

### 4.3 完成标准

任何候选功能都可以依据本文判断是否属于首个 Demo；所有成功标准都具有可观察或可测量的验收方式。

## 5. 文档二：`world-constitution.md`

### 5.1 目的

定义世界运行不可违反的原则、事实权威和组件权限。它是其他三份文档的上位规范。

### 5.2 计划内容

#### 权威层级

```text
World Constitution
    ↓
Committed Canonical Reality
    ↓
Settlement Protocol
    ↓
LLM Proposals
    ↓
Presentation
```

下层不能推翻或反向创造上层事实。

#### 事实与状态原则

定义：

- 已提交现实不可被静默改写；
- 事实如何新增、终止、替代和显式纠错；
- Fact、Event、RealityDelta 和 Materialized State 的区别；
- Reality、Sensation、Observation、Belief、Memory 的区别；
- `UNKNOWN`、`UNRESOLVED`、`FALSE`、`ABSENT`、`UNSUPPORTED` 的区别；
- 事实来源和因果来源的最低追溯要求。

#### 主体权限

明确：

- 玩家可以提交 Attempt、Query、Recall、Wait、Speech 和 Meta Input；
- 玩家不能直接声明外部现实已经改变；
- 玩家声明自身思想、目标、记忆和过去时的权限边界；
- 角色未知信息不能因为玩家知道而进入有效 Attempt；
- 自主生理、反射和外力变化不受意识直接控制；
- NPC 与玩家是否在世界因果层拥有相同地位。

#### 感知与信息边界

定义：

- RealityDelta 必须经过 Perception Projection 才能成为 Observation；
- Observation 不保证形成正确 Belief；
- 没有合法感知、记忆或证言路径的信息不得呈现；
- Renderer/Narrator 不得添加气氛性世界事实；
- 当前观察、旧证据和记忆冲突时的处理原则。

#### 裁决原则

至少包括：

- 没有有意义的不确定性时不强制随机裁决；
- 不可能的行动不能因戏剧需求成功；
- 失败必须源于世界条件，而非随意制造挫折；
- 部分成功、代价和副作用的适用条件；
- 玩家措辞不能反向决定隐藏事实；
- LLM 无权直接提交世界状态；
- 无法可靠裁决时应返回真实边界或请求必要信息。

#### Collapse 原则

定义：

- 只有当前 Settlement 确实依赖时才允许 Collapse；
- Collapse 默认只增加最小充分约束；
- 不允许为了剧情效果补全空白；
- Collapse 不得与既有 Canon 冲突；
- 高因果半径事实需要更高等级的审查；
- Collapse 必须记录 `canonicalHeight`；
- 回溯事实必须同时记录其 `validFromWorldTime`；
- Collapse 可以缩小约束空间，不必每次生成单一具体值。

#### 时间与自主过程

定义：

- Height 是逻辑/事务时间，不等于固定秒数；
- World Time 是世界内部实际时间；
- 没有 Attempt 时世界仍可推进；
- 没有输入、明确等待和试图保持不动互不等价；
- Intentional、Reactive、Endogenous、Exogenous 变化的提交资格。

#### 安全失败原则

继承旧项目已验证的纪律：

- 非法模型输出 fail closed；
- 不完整或非法引用不得提交；
- 验证失败不得遗留部分世界提交；
- 动作序列中已经提交的真实前缀不得被后续失败回滚；
- 不支持或无法可靠判断的范围必须诚实暴露边界，不得编造。

### 5.3 完成标准

典型裁决争议都能在本文中找到原则依据；每条宪法级不变量至少可以设计一个正例和一个反例。

## 6. 文档三：`runtime-protocol.md`

### 6.1 目的

将 Demo 目标和世界宪法转化为可实现、可审计、可回放的事务协议。

### 6.2 计划内容

#### 核心对象

正式定义：

- `WorldState`；
- `WorldHeight`；
- `WorldTime`；
- `Attempt`；
- `CanonicalFact`；
- `TruthCell` 与 `Constraint`；
- `Process` 与 Scheduled Event；
- `Event`；
- `Observation`；
- `EpistemicState`；
- `CollapseProposal`；
- `RealityDelta`；
- `BlockCandidate`；
- `SettlementCommit`。

每个对象说明：职责、最小字段、创建权限、读取权限、提交权限和生命周期。

#### World Height 状态机

暂定主流程：

```text
OPEN
→ PROJECT_OBSERVATIONS
→ ACCEPT_ATTEMPTS
→ COLLECT_EVENTS
→ RESOLVE_DEPENDENCIES
→ ADJUDICATE
→ COMPUTE_CLOSURE
→ VALIDATE
→ COMMIT
→ FINALIZE
```

需明确每个阶段：

- 输入和输出；
- 允许调用的组件；
- 是否允许读取隐藏现实；
- 失败后的行为；
- 是否能够产生提交。

#### 输入分类

至少区分：

- `Attempt`；
- `Query`；
- `Recall`；
- `Wait`；
- `Speech`；
- `Meta`；
- `Invalid/Ambiguous`。

#### Settlement 算法

协议应给出接近伪代码的完整流程：

```text
Previous State
+ Submitted Attempts
+ Due Autonomous Events
+ Exogenous Events
→ Relevant Dependency Retrieval
→ Optional Minimal Collapse
→ Candidate Outcome
→ Immediate Reaction Closure
→ Deterministic Validation
→ Atomic Commit
```

#### Settlement Closure

定义：

- 什么属于同一 Height 内不可延迟的即时反应；
- 最大反应深度、事件数或计算预算；
- 哪些变化应调度到后续 Height；
- 因果循环如何被发现和终止；
- 预算耗尽时如何产生后续计划事件，而不是直接丢弃因果结果。

#### 双时间模型

正式定义：

- `canonicalHeight`；
- `validFromWorldTime`；
- `validUntilWorldTime`；
- `observedAtHeight`；
- `acquiredAtHeight`。

至少包含一个“后来才确定的过去事实”完整示例。

#### Commit 与重放

从旧项目继承并升级：

- append-only；
- Height 连续性和 parent 引用；
- 幂等提交；
- 乐观并发或等价冲突保护；
- 原子提交；
- 从 Genesis 重放；
- Materialized State 仅是派生视图；
- strict 和 diagnostic replay；
- 提交损坏与恢复策略。

#### LLM 接口

MVP 暂定两个逻辑职责：

- `Adjudicator`；
- `ContinuityResolver`。

为每个接口定义：

- 输入允许包含的事实范围；
- 结构化输出 Schema；
- 禁止产生的权威字段；
- 确定性验证规则；
- 失败、重试和保守退出策略；
- 两个职责何时可以由同一个模型调用承担。

#### Observation Pipeline

```text
Committed RealityDelta
→ Perception Projection
→ Observation Objects
→ Evidence / Acquisition
→ Approved Presentation Packet
→ Text Renderer
```

优先继承旧项目严格呈现与认识证据隔离的已验证设计。

#### 最小存储边界

先定义存储接口而不锁定技术选型：

- Commit Log；
- Materialized State；
- Epistemic Ledger；
- Scheduled Processes；
- 非权威调试与审计记录。

实现阶段再比较 SQLite、JSONL 和 LanceDB。

### 6.3 完成标准

开发者可以仅依据本文实现一个最小运行时；三个代表性流程可以逐阶段、逐字段手工走通：

1. 普通开门 Attempt；
2. 玩家等待或无 Attempt 时水壶烧开；
3. 当前问题迫使系统对一个过去事实进行最小 Collapse。

## 7. 文档四：`adjudication-cases.md`

### 7.1 目的

通过结构化案例验证前三份文档，并作为未来自动化单元测试、集成测试和真实模型评测语料的来源。

### 7.2 案例模板

每个案例统一包含：

```text
Case ID
目的
初始 Canonical Reality
各主体 Epistemic State
World Time / Height
输入或触发事件
相关约束
允许的裁决范围
禁止结果
预期 RealityDelta
预期 Observation
预期 Commit / No Commit
对应宪法条款
未来自动化测试类型
```

### 7.3 案例分组

#### 输入与意图

- “我打开门”只能成为尝试；
- 同一动作、不同目标或方法；
- 否定、假设和条件句；
- 模糊代词；
- 多动作输入；
- Meta 与世界内问题；
- 玩家在输入中夹带结果声明。

#### 确定性与不可能性

- 无阻碍动作直接成功；
- 明显不可能；
- 信息不足但无需 Collapse；
- 有意义的不确定性；
- 部分成功；
- 成功但产生合理代价。

#### Canonical 一致性

- 输入与既有事实冲突；
- 事实被后续事件合法终止；
- 过去不能被静默改写；
- 动作序列的真实前缀不能回滚；
- 查询顺序不同但结果合流；
- 重放得到相同物化状态。

#### 感知与认识

优先迁移旧项目已有案例：

- 关闭容器隐藏内容；
- 未阅读纸条不能知道内容；
- 玩家与 NPC 的认识隔离；
- NPC 证言独立于玩家记忆；
- 感觉与客观现实不同；
- 错误信念不能污染 Canon；
- 未观察到的后台变化不得出现在玩家反馈中。

#### Collapse

- 当前行动不依赖时禁止 Collapse；
- 只需确定存在性而不确定身份；
- 只需收紧约束而不生成具体值；
- 当前结算必须确定局部物理性质；
- 高因果半径的身份或关系事实；
- 回溯事实；
- 玩家试图通过问法操纵隐藏事实；
- 多个 Collapse Proposal 相互冲突。

#### 时间与自主过程

- 玩家没有主动行动，水壶继续加热；
- 玩家明确等待五分钟；
- 饥饿跨越可感知阈值；
- 伤口后台恶化但尚未产生症状；
- NPC 在别处行动；
- 到期事件与玩家 Attempt 在同一 Height 相互作用；
- 不同语义尺度下每个 Height 推进不同长度的 World Time。

#### Settlement Closure

- 触碰热物体、疼痛、缩手；
- 踩猫尾巴、猫咬、缩手；
- 开门导致门后物体倒下；
- 反应形成潜在循环；
- 子弹飞行不一定在同一 Height 完成；
- 反应预算耗尽后生成后续计划事件。

#### 对抗与安全失败

- LLM 返回非法结构；
- LLM 引用不存在的实体；
- LLM 泄露隐藏事实；
- LLM 使用未声明依赖；
- LLM 擅自创造戏剧性秘密；
- 候选无法唯一收束；
- 并发导致 revision/height 冲突；
- Renderer 添加未经批准的信息。

### 7.4 数量目标

首轮准备 40～60 个案例，其中：

- 至少 20 个来自旧项目真实测试或失败记录；
- 至少 15 个覆盖新加入的 Height、Process、Collapse；
- 至少 10 个属于对抗性或错误路径；
- 每条宪法级不变量至少具有一个正例和一个反例。

### 7.5 完成标准

- 每个案例能够映射到 Runtime Protocol 的具体阶段；
- 每个预期结果能够找到 World Constitution 的依据；
- 每项 Demo Goal 都有案例覆盖；
- 关键案例能够直接转写为未来自动化测试。

## 8. 分阶段审查

### 8.1 阶段一：目标冻结

完成 `demo-goals.md` 后检查：

- 场景是否足够小；
- 是否确实验证新架构的关键主张；
- 是否误纳入正式内核、引擎或内容平台需求；
- 成功标准是否可测。

通过后将状态从 `draft` 改为 `reviewed`，再开始世界宪法。

### 8.2 阶段二：宪法冻结

完成 `world-constitution.md` 后，用典型争议攻击条款：

- 玩家直接声明结果怎么办；
- 后来发现过去的秘密怎么办；
- Renderer 能否添加气氛细节；
- 没有玩家输入时世界是否推进；
- LLM 输出分歧或无效时怎么办。

任何无法依据条款回答的问题都必须记录并处理。

### 8.3 阶段三：协议可实现性审查

完成 `runtime-protocol.md` 后，手工走通三个代表性 Height 流程：

1. 开门；
2. 等待时水壶烧开；
3. 询问迫使最小 Collapse 的过去事实。

检查每个阶段的输入、输出、权限、失败路径和提交内容，不允许依靠未定义的“智能判断”跨越协议空白。

### 8.4 阶段四：案例反向校验

完成 `adjudication-cases.md` 后反向检查：

- 案例是否覆盖每条宪法级不变量；
- 协议是否能产生案例要求的结果；
- Demo 的每项成功标准是否有对应验收；
- 四份文档的术语、权限和流程是否互相矛盾。

## 9. 文档规范

四份文档统一包含：

- 文档版本；
- 状态：`draft`、`reviewed` 或 `frozen`；
- 日期；
- 上位规范和相关文档；
- 规范性术语表；
- 未决问题；
- 变更记录。

规范性语句应尽量使用明确措辞：

- `必须`：实现不得违反；
- `不得`：明确禁止；
- `应该`：默认遵循，偏离时需要记录理由；
- `可以`：允许但不要求；
- `暂缓`：不属于当前基线，但保留扩展位置。

文档中的对象名、阶段名和枚举值统一使用英文标识符，解释和讨论使用中文。

## 10. 实际执行批次

1. 完成旧项目遗产映射工作笔记；
2. 起草 `demo-goals.md`，与项目所有者确认体验目标和范围；
3. 起草 `world-constitution.md`，确认现实规则与权限边界；
4. 起草 `runtime-protocol.md`，定义数据模型、状态机和事务协议；
5. 迁移旧项目案例并补充新机制案例，完成 `adjudication-cases.md`；
6. 对四份文档进行交叉审查；
7. 处理未决问题，将确认版本标记为 `frozen`；
8. 以冻结文档为依据规划并实现第一个纵向切片。

项目所有者的主要判断集中在前两份文档：Demo 想证明什么、世界应遵循什么原则。后两份文档主要负责把这些决定转换成工程协议和可执行测试。

## 11. 最终交付与退出条件

设计准备阶段完成时，项目应具备：

- 四份状态为 `frozen` 的核心文档；
- 一份旧项目成果到新架构的映射记录；
- 40～60 个结构化裁决案例；
- 一个明确限定的 Demo 场景；
- 三条已手工走通的完整 Height 示例；
- 可直接转换为实现任务的核心对象和协议边界；
- 一组可作为首轮自动化测试基线的不变量。

只有满足这些退出条件，才进入新运行时的正式编码阶段。
