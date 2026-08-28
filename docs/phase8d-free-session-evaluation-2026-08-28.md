# Phase 8D 自由会话自动评测

日期：2026-08-28  
模型：仅 `@cf/qwen/qwen3.8-27b`

## 评测设计

新增 `scripts/free-session-eval.ts`，以同一持续世界串行执行 15 个未用于世界 handler 编写的表面表达，覆盖：环境视觉、听觉、身体感知、姿态观察、施力开门、拿起/松开/组合放置、朝向、发声、跨空间移动、未知枪诱导和有界等待。

每轮记录结果类型、错误码、Height 前后、端到端耗时和模型 telemetry。会话末尾检查 World Commit 数、Experience Commit 数、严格 replay state root，以及枪式诱导是否创建 Height。普通测试和本地评测不读取 secret。

## 首次真实运行

- 15 轮：5 query、6 world、4 boundary；
- 9 个模型依赖轮次中 5 个提交；
- 模型延迟中位约 12.9 秒，P95 约 45 秒；
- release 的 effect 表达、speech value 和组合动作存在协议/提示缺口；
- 未知枪保持零 Height；最终 6 个 World Commit 与 6 个 Experience Commit 且 replay root 一致。

没有删除失败样本。根据失败修正了三个可解释的协议问题：可信层不使用的 conditions 强制为空；`held_by(actor)=false` 允许同时携带 objectSlot 与 value；release、speech、hold→place 的最小候选契约写入 schema prompt。针对性真实复测中 release、speech 和 hold→place 全部可构成可信操作。

## 固定语料复测

使用完全相同的 15 轮输入重新运行：

- 9 world、5 query、1 boundary；
- 9 次模型调用中 8 次进入可信提交；唯一 boundary 是未知枪诱导，符合预期；
- 模型延迟中位 10.97 秒，P95 26.82 秒；
- 最终 Height 10，World Commit 10，Experience Commit 10；
- strict replay state root 一致；
- 枪式诱导没有创建 Height、实体、事实或效果。

该固定语料当时满足自动门禁，但后续真人测试证明它对产品体验和开放性产生了假阳性：语料过度集中于已经实现的路径，未触及 unresolved/Collapse 主线。它只能保留为回归测试，不能再作为 Phase 8D 通过证据。

## 尚未满足的门禁

原计划明确要求另一位测试者进行 15–30 分钟自由输入。固定自动语料即使没有逐句世界 handler，也不能替代独立真人的探索策略、意外表达和主观体验判断。当前不能诚实地把 Phase 8D 或整个“可试玩 Demo”标为最终完成。

此外 11 秒中位和 27 秒 P95 对文字 VR 仍很慢。快路径让常见观察接近即时，但任何新颖行动都会显著打断节奏。真人盲测必须同时判断这种延迟是否可忍受。

## 决策

- Phase 8D 自动回归：passed，但产品门禁证据无效；
- Phase 8D 独立真人盲测：pending external tester；
- Phase 9：继续保持 blocked，不用内容扩张掩盖未完成的体验门禁；
- 不降低 unknown slot、schema、affordance 或 Canon 写入安全标准来换取成功率。
