# 旧项目遗产复用映射

状态：reviewed
日期：2026-08-27
来源仓库：`echo983/secondary-external-reality`
来源基线：`2cc65c7`
目标项目：`secondary-external-reality2`

## 1. 目的

识别旧项目中已经通过代码、测试或真人实验验证的成果，决定它们在新 `World Height + Settlement` 架构中的去向。

本文不要求新项目兼容旧项目。处理决定分为：

- **复用**：实现或测试可以在适配命名后直接迁移；
- **改写吸收**：保留不变量或算法，围绕新协议重写类型和编排；
- **案例复用**：只迁移场景、失败案例与验收思路；
- **暂缓**：保留扩展位置，首版不迁移；
- **放弃**：属于旧演进路径或与新架构冲突。

## 2. 已验证基线

旧仓库当前本地测试为 `214/214` 通过。它已经证明：

- LLM 可以参与开放语言解释而不拥有提交权；
- append-only commit 可以持久化并确定性重放小型世界；
- Canonical Reality、Observation、Evidence、Acquisition 和 Presentation 可以分层；
- 隐藏容器、未观察文字和主体隔离可以被机械测试；
- 空间、可达性、记忆衰减和证言可以在不改写 WorldTruth 的前提下运行；
- 模型失败、分歧或非法输出可以零提交；
- 自然语言释义远比提交协议不稳定，必须由可信层收束。

这些结论不证明旧系统已经是通用引擎，也不证明其多层 IR 是新项目的最佳结构。

## 3. 核心映射

| 旧成果 | 旧证据 | 新架构位置 | 决定 | 理由与改写要求 |
|---|---|---|---|---|
| `CommitPackage.commitSequence` | `src/protocol/types.ts`、LanceDB 连续序列测试 | `WorldHeight` / `SettlementCommit` | 改写吸收 | 升级为逻辑时间，加入 parent、World Time、Attempt、Process、Reaction 与 Collapse |
| append-only 提交 | `src/storage/lanceCommitStore.ts` | `CommitLog` | 复用算法 | 保留幂等、连续序列、进程内队列和跨进程写锁 |
| revision guard | `src/protocol/commit.ts` | Settlement 提交前置检查 | 复用 | 提交前确认依赖投影未变化 |
| 确定性重放 | `src/replay/canonicalReplay.ts` | Genesis → Materialized World | 改写吸收 | Materialized State 永远是派生视图；增加双时间与 Process 状态 |
| strict/diagnostic replay | replay 测试 | 验证与修复工具 | 复用 | strict 阻断 fatal issue，diagnostic 收集全部问题 |
| `WorldCommitment` | `src/protocol/types.ts` | `CanonicalFact` / typed RealityDelta | 改写吸收 | 旧 union 偏实体属性关系；新模型需支持有效期、来源和约束 |
| `SemanticAddress` | `src/world/semanticAddress.ts` | Canonical projection address | 复用核心 | 保持唯一拼写、严格解析和可注册扩展 |
| `CommitmentGraph` | `src/world/commitmentGraph.ts` | Canonical fact view | 改写吸收 | 加入 valid time、canonical height 和 TruthCell |
| `ObservationRecord` | `src/epistemic/types.ts` | `Observation` | 改写吸收 | 增加 modality、source facts/events、scope、resolution、salience |
| `EvidenceLedger` | `src/epistemic/evidenceLedger.ts` | Epistemic ledger | 复用核心 | 继续保证 observation→evidence 引用完整性和不可变性 |
| `AgentEpistemicGraph` | `src/epistemic/agentGraph.ts` | `EpistemicState` | 改写吸收 | 增加 Inference/Belief 层；不把所有实体自动赋予认识能力 |
| `EpistemicAcquisition` | `src/epistemic/types.ts` | knowledge acquisition | 复用核心 | 扩展 direct perception、testimony、recall 等 mode |
| complete relation-set observation | `RelationSetPerceptionObservation` 及 absence 测试 | 有范围的“确实为空” | 复用 | 空集合只有在完整检查合法 scope 后才构成证据 |
| `ApprovedPresentationPacket` | `src/presentation/types.ts` | Presentation capability | 复用核心 | Renderer 只能读取批准项；新项目增加 Sensation/Inference 边界 |
| risk-aware renderer | `src/presentation/renderer.ts` | Text Renderer | 改写吸收 | 确定性呈现高风险枚举和边界；LLM 只润色低风险内容 |
| Query Triage | `src/query/` | Query/Perception protocol | 改写吸收 | 保留 reveal-only；与 Height 的 Observation Projection 合并设计 |
| MaterializedWorld | `src/world/materializedWorld.ts` | 派生世界状态 | 改写吸收 | 不允许任何子系统绕过 Block 直接修改 |
| typed relation constraints | `src/world/worldSchema.ts` 与测试 | Deterministic Validator | 复用核心 | 继续检查端点类型、唯一位置、包含环和有效关系 |
| 可扩展实体类型注册 | world-schema 注册测试 | Schema Registry | 暂缓后复用 | MVP 场景先小，但内核不得把卧室类型写死 |
| PlaceGraph 与 `present_at` | 移动和走廊测试 | Space Process / Capability | 案例复用 | 新场景可复用概念，暂不直接搬旧 fixture |
| reachability/observation bandwidth | 对应 live sequence 与测试 | Embodiment + Perception | 改写吸收 | 纳入身体、距离和注意力，而非散布在对象路由中 |
| memory recollection | 记忆测试 | Epistemic Process | 案例复用、首版暂缓 | 保留“记忆衰减不改写 Canon”的不变量 |
| testimony | 多主体 AEG 测试 | Agent-to-agent evidence | 案例复用、首版暂缓 | 证言不直接授权 WorldTruth |
| candidate validation/evaluation/selection | `src/protocol/` | Settlement validation | 部分复用 | 保留闭包、条件求值和 revision；不默认保留 Pareto 候选架构 |
| minimal commitment cost | selector 测试 | Minimal RealityDelta policy | 改写吸收 | 作为偏序/审查指标，不能替代语义合法性 |
| Action IR source-span validation | `src/actionIr/validator.ts` | Language proposal validation | 复用核心 | 模型 mention 必须来自原文，不得发明实体或参数 |
| Interaction IR 双工位共识 | `src/interactionIr/` | 可选高风险语言审查 | 暂缓 | Qwen 实验先支持单模型+可信编译器；真实失败再决定双工位 |
| Semantic IR | `src/semanticIr/` | 历史语言实验 | 放弃整体迁移 | 与 Action/Interaction 多代重叠；只取规范化和严格验证经验 |
| shadow/guard/active 模式 | IR 演进代码 | 新功能上线策略 | 案例复用 | 将来可用于迁移，不进入首版核心数据模型 |
| BedroomSession/ObjectTurn | `src/turn/` | 旧纵向切片 | 放弃迁移 | 编排与固定对象、动作、兼容路径高度耦合 |
| 固定 primitive 路由 | `objectIntent.ts` 等 | 旧可执行语言 | 放弃整体迁移 | 新项目仍需闭合执行能力，但不能继续按中文表述堆特判 |
| bedroom fixture | `src/world/objectFixture.ts` | Demo 内容候选 | 案例复用 | 复用纸条、门、猫/NPC、隐藏物和持续过程，不复用硬编码实体表 |
| LanceDB | storage 实现 | 可替换存储后端 | 暂缓 | 首版先定义接口；小世界优先 SQLite 或 JSONL + 内存视图 |
| SSH shell | `src/ssh/` | 开发调试入口候选 | 暂缓 | 不作为普通用户主入口 |
| Workers AI client | `src/ai/workersAiClient.ts` | 模型适配器 | 案例复用 | 新项目只允许 `@cf/qwen/qwen3.8-27b`，需适配 choices/reasoning 响应 |
| live eval harness | `src/eval/` | 实验与门禁 | 复用方法 | 保留真实模型语料、原始输出、机械不变量和人工评审分离 |

## 4. 必须迁移的测试不变量

以下不变量进入新项目首轮测试规划：

1. 非法或无最终内容的模型响应产生零提交；
2. 模型输出未知字段或错误类型时被拒绝；
3. 玩家输入中的结果断言不能直接成为事实；
4. 关闭容器不泄露内容；
5. 未观察文字不进入主体认识；
6. 主体之间的 Evidence 路径隔离；
7. 完整 scope 观察才能构成“范围内为空”；
8. Renderer 不能输出未被 Presentation Packet 批准的值；
9. 关系端点必须存在且满足类型能力；
10. 单一位置关系和无包含环；
11. 重放必须得到相同物化状态；
12. world basis 不匹配时拒绝重放；
13. commit sequence/height 必须连续；
14. 幂等重试不重复产生事实；
15. 并发提交必须检测陈旧依赖；
16. 动作序列后半失败不能回滚已经提交的真实前缀；
17. Query 只能揭示，不得决定未决事实；
18. 记忆和证言不能修改 Canon；
19. 查询顺序不能改变同一已定事实；
20. 不支持范围必须诚实返回边界。

## 5. Qwen 实验追加的测试不变量

1. Schema 检查必须验证字段类型，不只验证字段名；
2. Perception Projector 不得把隐藏来源类别写入 Observation；
3. Renderer 不得把 Canon 未提供的正常身体细节当作事实补出；
4. 玩家诱导性断言不能决定 Collapse；
5. `collapse_required=false` 时不得同时增加约束；
6. Collapse Proposal 必须产生可供当前结算求值的收紧，而非重述问题；
7. 自由英文 goal 标签不能成为 Canonical IR；
8. 有序动作必须保留顺序和原文跨度；
9. 模型无 content、超时和容量错误是正式失败类型；
10. 一个 Height 不得依赖多个无上限串行模型调用。

## 6. 明确不继承的历史负担

- Action IR、Semantic IR、Interaction IR 三代同时存在；
- legacy/canonical 双写作为永久结构；
- 以卧室名词和有限动作词汇硬编码整个自然语言入口；
- 用双 LLM 一致替代确定性权限检查；
- 把 LanceDB 选型当作领域模型；
- 把 SSH 当作产品体验；
- 为兼容旧提交形状扭曲新的 World Height 数据模型。

## 7. 迁移顺序

真正进入编码后按以下顺序取用旧成果：

1. 测试不变量与失败语料；
2. SemanticAddress 和严格类型验证；
3. append-only commit、幂等、并发保护与 replay；
4. Observation/Evidence/Acquisition/Presentation 权限链；
5. 世界关系不变量；
6. 场景级空间、记忆和证言能力。

不先复制完整旧源码树。每次迁移必须先找到其在新协议中的明确位置。

## 8. 结论

旧项目最有价值的不是卧室功能数量，而是已经证明了三条工程事实：

1. 世界真实性必须由提交、引用和重放承担，而不是由 LLM 自信程度承担；
2. 主体认识与世界事实必须拥有不同的数据路径；
3. 开放语言必须在进入执行前经过封闭权限和实体绑定。

新项目应直接继承这三条及其测试证据，同时以 World Height、双时间、自主过程、具身感知和最小 Collapse 重写运行时主轴。
