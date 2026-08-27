# 设计自洽性与可行性审查 v0.1

状态：passed with resolutions
日期：2026-08-27
范围：`demo-goals.md`、`world-constitution.md`、`runtime-protocol.md`、`adjudication-cases.md`、`vertical-slice-implementation-plan.md`

## 1. 结论

设计可以进入 Phase 0。核心权力边界、三条纵向链路和首版技术范围相容；本轮发现的四个阻断级歧义已经在规范中收口，没有必要再做真实 LLM 实验。

真实模型现有实验已经足以证明适配层风险：高延迟、无 content、非法结构与诱导性提案都必须按普通故障处理。当前缺口属于确定性协议和存储语义，继续调用模型不会提供新的决定性证据。

## 2. 已解决的阻断项

### R1 世界提交与主体体验之间缺少持久化闭环

原设计在 Finalize 后才投影 Observation，却只在 SettlementCommit 中保存 seed，未定义 Observation/Evidence/Acquisition 的提交、重放和中途崩溃行为。

决议：VALIDATE 前固化 ObservationSeed；世界提交后幂等生成独立 ExperienceCommit。世界 root 与 epistemic root 分离。若在两次 append 之间崩溃，从 seed 恢复；体验持久化完成前不接受该会话的新输入。

### R2 Height 与空 RealityDelta 的含义不唯一

原文同时允许空 Delta 无提交，又把 Height 描述为所有处理的容器，可能造成 Query、失败输入和 Wait 的编号实现分歧。

决议：只有 World Time、Canon 或 Process State 实际变化才创建 Height。只读 Query、Meta、None、输入/绑定失败只写 Audit；确实在世界中发生的失败动作可以创建 Height；Wait 因推进时间而创建 Height。

### R3 Query 与主动观察边界不足

“问门是否打开”与“搜索抽屉内容”不能共享纯查询语义，否则前者可能意外 Collapse，或后者绕过动作、时间与遮挡。

决议：Query 只读；搜索、翻找、转头查看和完整检查构成为 Attempt/Perception Operation。主动观察仍受遮挡、时间、感知和 Collapse 白名单约束。

### R4 单次模型预算与多岗位协议冲突

原状态机允许 InputProposal 后再做 LLM adjudication，Renderer 与 Continuity Resolver 也可能继续占用关键路径，不符合正常 Height 最多一次调用。

决议：首个切片唯一关键路径模型调用是 InputProposal。Adjudicator 与 Renderer 确定性运行；有限域 Collapse 由版本化 DeterministicCollapseResolver 完成。模型 Renderer 和语义 Continuity Resolver 暂缓。

## 3. 可行性检查

| 项目 | 结论 | 进入实现前的约束 |
|---|---|---|
| Runtime | 可行 | 当前环境 Node v20.19.2；避免依赖未稳定可用的内置 SQLite |
| 首轮存储 | 可行 | Phase 0–5 使用内存接口；SQLite 在 Phase 6 单独 spike 后选库 |
| Replay | 可行 | Phase 1 冻结规范 JSON + SHA-256 测试向量 |
| 双账本恢复 | 可行 | world append 优先，experience append 可由 seed 幂等补写 |
| Wait/Process | 可行 | 单 Height 保存区间内有序事件；危险事件在其时刻截断剩余等待 |
| LLM 延迟 | 有界可行 | 单次调用、45 秒超时、失败零 Canon；本地测试默认 fake |
| Collapse | 可行但后置 | Phase 4 只建拒绝/白名单骨架，低半径成功路径最后开放 |
| SQLite | 尚未选型但不阻断 | 领域接口不依赖驱动；Phase 6 比较实际事务与部署需求 |

## 4. 保留风险与决策门

以下不是 Phase 0 阻断项：

- ExperienceCommit 的字段细节要随首个 Observation 实现补全，但 identity、幂等和恢复语义已冻结；
- 规范序列化需要测试向量验证 Unicode、数字和数组排序；
- SQLite 驱动需要评估原生构建、事务、Worker 部署目标，不在当前阶段锁定；
- salience、注意带宽和复杂多主体认识仍按首版场景最小实现；
- DeterministicCollapseResolver 的 world seed 管理必须在开放任何成功 Collapse 前完成。

## 5. 实施准入判定

Phase 0 准入通过，条件如下：

1. 先实现纯本地类型、strict validators、错误码、Audit 与 fake adapter；
2. Query/边界/模型故障的零 Height、零 Canon 行为必须先有测试；
3. Phase 1 同时建立 SettlementCommit 与 ExperienceCommit 接口，不能只做世界账本；
4. 在真实 Qwen 接入前，所有可信路径必须能由 fake proposal 完整验证；
5. 不因 Phase 0 开工而提前开放模型 Renderer、模型 Collapse 或 SQLite。

下一步：创建 Phase 0 实现分支，建立 TypeScript 工程骨架与 F01–F05 的纯本地拒绝路径。
