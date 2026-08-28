# 文字虚拟现实架构重设计计划 v0.1

日期：2026-08-28
状态：**superseded** —— 被 `architecture-direction-consensus-2026-08-28.md` 取代，不再是待执行计划，仅作历史记录保留
上位目标：`demo-goals.md`、`world-constitution.md`

> **2026-08-28 后续更新：** 本文档第 2/4 节设想的 D2/D3 路线（声明式 `EntitySchema`/`Component`/`OperationContract`，把 Canon 从平铺 address 升级为类型化组件系统）已经被同一天稍晚的讨论和四轮真实 Qwen 实验推翻。核心判断：把开放现实翻译成类型化 schema、并且现场为新对象/新情况现造 schema，这件事本身才是高风险、低 ROI 的活，不是保留结构、只是不追求形式化（类型/字段/枚举值域）——详见 `architecture-direction-consensus-2026-08-28.md` 第 9 节。新方向、以及 `plausibility-judge-spike`/`reachability-inference-spike`/`world-feedback-narration-spike`/`juror-clerk-spike` 四份实验证据，都在该文档里。继续把本文档当成待执行计划会造成两份互相矛盾的设计文档同时存在，请以 `architecture-direction-consensus-2026-08-28.md` 为准；本文档保留仅供追溯"为什么最初认为需要重设计"（第 1–3 节的问题诊断部分仍然成立，只是第 4 节给出的具体解法方向已被取代）。

## 1. 决议

暂停在现有 `ActionProposal → constitutePrimitiveAction → primitive-world 分支 → 独立 perception projector` 架构上继续补中文表达、对象 affordance 和特例 handler。

当前系统已经形成可信账本、权限边界和重放基础，但没有形成统一的世界解释与因果裁决层。继续增加特例会提高代码量和固定语料通过率，却不会自然提高世界感或开放行动能力。

下一阶段先完成架构重设计和纸面走查。未通过本文门禁前：

- 不扩展 NPC、容器、地图、Web UI 或图片；
- 不以新增正则、别名或单对象分支作为自由行动问题的主要修复；
- 不再用固定命令语料通过率宣称开放行动完成；
- 只允许安全、数据损坏或测试工具方面的必要维护。

## 2. 要解决的架构问题

### A1 权限系统与世界智能脱节

保留“LLM 无 Commit 权”，但重新定义 LLM 可以提出的非权威语义内容。安全边界不得退化成只允许模型填写脆弱的内部 API 表格，也不得让模型直接决定事实或结果。

### A2 行动提案提前声明效果

玩家语言首先应构成意图、对象角色、方法和目标状态，而不是直接提交 primitives 和 effects。动作如何分解、需要读取哪些状态、可能产生什么结果，必须由可信 Operation Contract 根据当前世界推导。

### A3 Canon 有连续状态，交互语境却每轮失忆

必须明确一个非权威、可重建的 `InteractionContext / DiscourseState`，承载近期指称、焦点、当前手持物、位置、邻近关系和未完成动作，但不得凭语言创造世界事实。

### A4 平铺地址无法支持通用因果推导

Canonical address 适合作为持久化身份，不足以单独承担对象语义。需要声明式对象组件、属性 schema、空间角色、能力条件和派生谓词，使不同动作能共享同一批世界属性。

### A5 Collapse 是动作答案缓存，不是世界具体化

`fit:blanket-1:under_gap:door-1 ∈ [true,false]` 完成了协议纵切，但没有形成可复用因果语义。新设计必须优先 Collapse 世界属性或约束，而不是为每个对象对和动作预埋成功布尔值。

### A6 感知与行动读取不同的世界

定向观察、身体感知、手持物查询和环境观察必须编译为统一 Perception Operation，并从同一世界模型、空间关系和主体认识状态生成 Observation。

## 3. 重设计目标

设计阶段必须给出下面这条统一主链的可实现定义：

```text
Raw Input
  → Semantic Intent Frame
  → Contextual Binding
  → Operation Contract
  → Dependency Expansion
      → Canonical Fact / Process
      → Derived Predicate
      → Agent Knowledge
      → Blocking TruthCell
      → Unsupported Boundary
  → Minimal Collapse / Deterministic Evaluation
  → Settlement Candidate
  → Validation + Commit
  → Observation Operation
  → Experience + Presentation
```

目标不是首版实现通用物理模拟，而是让新对象和新行动主要通过声明式 schema、契约和谓词组合接入，不需要同时修改语言、结算、感知和呈现的多套特例分支。

## 4. 计划产物

### D1 架构诊断与模块处置表

文件：`architecture-diagnosis-and-disposition.md`

内容：

- 当前端到端调用图和数据流；
- 两轮真人记录逐项映射到架构原因；
- 区分安全骨架、可迁移实现、过渡适配层和应替换模块；
- 每个现有模块标记为 `keep / evolve / adapter-only / replace / remove-later`；
- 明确迁移期间唯一权威来源，避免新旧双写和双重裁决。

### D2 统一语义与操作模型

文件：`semantic-operation-architecture.md`

至少定义：

- `SemanticIntentFrame`：动作、查询、方法、对象角色、期望而非结果；
- `DiscourseState`：近期指称、显著对象和从 Canon/Experience 派生的身体上下文；
- `EntitySchema / Component / Property`：对象类型、材料、空间角色和可选属性；
- `OperationContract`：参数角色、阶段、前置条件、依赖、结果规则和可感知信号；
- `DerivedPredicate`：例如 reachable、movable、fits、supports、occludes、visible；
- `PerceptionOperation`：modality、focus、scope、姿态与可见性依赖；
- LLM 提案、可信 binder、契约解释器、求解器和 Commit builder 的权限边界。

该文档必须给出最小 TypeScript 接口草案，但不要求立即实现。

### D3 未决事实与按需具体化模型

文件：`unresolved-and-collapse-architecture.md`

至少回答：

- 哪些东西可以保持 `UNRESOLVED`，哪些必须在 Genesis 已定；
- TruthCell 表示属性、约束还是派生谓词缓存；
- 动作契约如何产生 blocking dependency，而不是由玩家或模型随意指定地址；
- dependency graph 如何展开到最小叶子属性；
- 何时无需 Collapse 即可从区间或约束裁决；
- 多个合法结果如何确定，resolver 的稳定种子和分布由谁定义；
- 一次 Collapse 如何影响后续不同动作；
- 如何限制半径、防止按问题措辞生成历史或远方世界；
- Collapse、动作过程和失败结果如何进入同一 SettlementCommit；
- 如何审计“为什么这次必须坍缩”和“为什么只坍缩这些地址”。

文档必须明确废除“每个动作对象对预埋一个成功布尔 TruthCell”作为默认设计。

### D4 迁移与验证计划

文件：`architecture-migration-validation-plan.md`

内容：

- 以纵向切片替换旧主链的顺序；
- 新旧模块临时适配边界；
- 数据 schema/version 和旧 SQLite 会话兼容策略；
- 离线确定性测试、真实 Qwen 语义测试和真人体验门禁；
- 失败回退方案；
- 明确何时删除旧 primitive/perception 分支。

## 5. 必须纸面走通的案例

设计文档不能只给接口名。以下案例必须逐阶段列出输入、绑定、契约、依赖图、可能 Collapse、Settlement、Observation 和后续状态。

### C1 已持有毛毯，铺到地面

输入变体：

- “把毛毯铺在地上”；
- 玩家先称其为“地毯”，之后说“放下它”；
- “看看手里有什么”之后再“铺开”。

必须证明：

- 已提交的手持状态无需模型重新发现；
- “它”和玩家临时称呼可由语境绑定，但不会写入 Canon；
- `place/spread` 的动作分解来自契约；
- 地面是空间表面角色，不依赖特定中文实体 handler；
- 手持物查询读取真实 holding relation；
- 若没有 blocking unresolved，整个案例零 Collapse。

### C2 尝试移动床去堵门

必须展开至少这些依赖：

- 主体能否形成抓握或施力；
- 床是否可移动及阻力；
- 从当前位置到门边的路径和几何约束；
- 到达后的姿态是否能形成遮挡；
- 哪些事实已定、哪些属性未决、哪些可以由约束直接判断；
- 失败是世界事件、部分结果还是产品 `UNSUPPORTED`。

该案例必须能在不新增“床堵门 handler”的前提下解释结果。允许首版最终返回清楚的 `UNSUPPORTED`，但不得谎称床不存在。

### C3 毛毯塞门缝

用新架构重新表达现有纵切：

- 不直接 Collapse `fits=true/false`；
- 由门缝尺寸、毛毯厚度/可压缩性和动作方法形成派生谓词；
- 只具体化足以裁决的最小属性；
- 后续折叠、铺地、遮挡或再次塞入复用已确定属性。

### C4 观察手里、房间和门外

三个查询必须使用同一种 Perception Operation 模型，只改变 focus、scope、modality 和视线/遮挡条件。不得再靠互斥的预制回答器选择结果。

### C5 枪式诱导与远方问题

验证新语义能力没有放宽权力边界：不存在的枪不能绑定，玩家不能借提问创建对象、历史、NPC 动机或远方事实，非 blocking Query 不触发 Collapse。

## 6. 旧架构初步处置假设

最终结论由 D1 确认；当前先按以下假设规划：

| 模块或概念 | 初步处置 | 理由 |
|---|---|---|
| WorldBasis、Height、WorldTime | keep | 世界连续性基础 |
| Canonical Fact/Event/Process | evolve | 保留权威语义，补 schema 和派生能力 |
| Commit、state root、replay、SQLite | keep/evolve | 已验证的可信基础设施 |
| Experience/Evidence/Observation 权限 | keep/evolve | 保留主体认识边界，统一观察执行 |
| TruthCell、CollapsePolicy | evolve | 从布尔答案槽升级为属性/约束具体化 |
| `ActionProposal` 直接 effects | replace | 过早要求模型编写世界 API |
| opaque slots | evolve | 继续防止模型伪造 ID，但加入语境和角色绑定 |
| fixture affordance 字符串表 | replace | 无法表达条件、依赖和派生能力 |
| `constitutePrimitiveAction` 分支 | adapter-only | 迁移期间承接旧测试，不再扩张 |
| `primitive-world.ts` 对象特例 | replace | 由 Operation Contract 解释器替代 |
| 独立 perception regex/projector | replace | 统一为 Perception Operation |
| deterministic renderer | evolve | 从批准 Observation 表达，减少 event-kind 特例 |
| Input/Attempt Audit | evolve | 增加原始模型响应摘要、绑定与依赖诊断 |

## 7. 设计阶段执行顺序

### R0 证据冻结

- 把两轮真人记录整理为架构案例，不提交含个人原始输入的本地导出；
- 固定当前 76 项测试为遗留安全回归；
- 标记固定语料只能证明旧路径不回退，不能证明世界感。

### R1 当前架构诊断

完成 D1。先证明失败如何由模块边界产生，再讨论新接口，避免只换术语。

### R2 统一语义与操作设计

完成 D2，并让 C1、C2、C4 在纸面上走通。若仍需按对象或中文句式分支，继续修改设计，不进入实现。

### R3 Collapse 重设计

完成 D3，并让 C3、C5 走通。重点审查跨行动复用、最小性、因果解释和权限边界。

### R4 迁移设计与综合审查

完成 D4，对四份文档做自洽性、可行性和最小实现审查，更新 Runtime Protocol 与实施计划。

### R5 决策点

只有设计门禁全部通过后，才规划代码纵向切片。首个实现切片优先 C1 + C4，随后 C3，最后 C2；不得先扩内容面。

## 8. 设计门禁

进入实现前必须同时满足：

1. 五个纸面案例都使用同一套核心对象和主链；
2. “目标不存在”“绑定失败”“世界内失败”“缺少实现能力”“合法未决”有不同类型和处理路径；
3. 已提交手持/位置/邻近状态无需由 LLM 每轮重新推断；
4. 行动与感知读取同一对象模型和关系；
5. 新对象接入不要求同时新增语言、结算、感知和 renderer 特例；
6. Collapse 地址来自 schema/契约的依赖展开，而不是玩家措辞或模型自由字符串；
7. 至少一个 Collapse 属性能被两个不同操作复用；
8. 没有 Collapse 也能裁决的情况不会为了丰富反馈而具体化；
9. LLM 输出失败不会改变世界，且语义失败保留足够审计证据；
10. 新设计能在一个模型关键调用预算内工作，或明确说明不用模型的路径；
11. 保留现有 Commit、重放、认识边界和枪式安全不变量；
12. 给出从旧 v4 到新 schema 的明确迁移、隔离或废弃策略。

若门禁不通过，不以“先做出来再说”为理由进入编码。

## 9. 非目标

本次重设计不追求：

- 连续刚体或有限元物理；
- 任意对象、材料和动作的通用模拟；
- 由 LLM 自由生成并提交世界规律；
- 自动生成完整远方世界；
- 一次解决 NPC 社会、身体生理和语言全部问题；
- 保持旧内部 API 兼容而牺牲新架构一致性。

首要目标是建立一个小而统一、可以诚实扩展的世界解释内核。

## 10. 完成定义

本文计划本身完成于落盘和一致性检查；架构重设计阶段完成则要求 D1–D4 全部完成、五个案例通过纸面走查、设计门禁全部有证据，并形成下一份经审查的纵向切片实施计划。

在此之前，Phase 8C 保持 `architecture redesign` 状态，Phase 8D 和 Phase 9 不解锁。
