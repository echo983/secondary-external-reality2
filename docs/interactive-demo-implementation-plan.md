# 可交互 Demo 实施计划 v0.1

日期：2026-08-27
状态：completed
前置：`vertical-slice-implementation-plan.md` Phase 0–6 completed

## 1. 当前判断

首轮已经分别证明推门、Wait 水壶、枪式诱导、真实 Qwen 和 SQLite 恢复，但还不是一个用户可连续输入文字的 Demo。当前最大缺口是组合，而不是新增世界能力：

- 门和水壶 fixture 的 WorldBasis 不同；
- operation 直接依赖具体内存 store 类；
- 缺少统一 RuntimeSession 状态机；
- 缺少可运行 CLI 和会话恢复入口；
- 尚未用同一世界完成 30–60 Height 的代表性会话。

## 2. Phase 7A：统一世界与组合回归

状态：completed

- 建立包含 self、卧室、走廊、门、水壶和加热 Process 的统一 fixture；
- 在同一 Genesis 上依次完成推门 H1、Wait H2；
- 两个 Height 重放到相同 state root；
- Experience Ledger 对同一 observer 保持连续 epistemic root；
- 枪式输入仍保持零 Height。

## 3. Phase 7B：存储端口与 RuntimeSession

状态：completed

- 从 operation 中移除对具体 InMemoryStore 的依赖；
- 定义 WorldCommitPort、ExperiencePort、AuditPort；
- 为内存与 SQLite 提供相同语义的 adapter；
- RuntimeSession 负责 ACCEPT → CONSTITUTE → GROUND → DISPATCH → COMMIT → EXPERIENCE → PRESENT；
- 边界响应与世界反馈使用统一结果类型；
- 启动时 strict replay，并优先补写 pending experience。

## 4. Phase 7C：CLI

状态：completed

- 默认使用本地 SQLite 文件；
- `--fake` 运行固定提案，普通开发无需网络；
- `--live-qwen` 显式读取 secret 并调用唯一批准模型；
- 显示世界反馈、边界码、Height 和延迟，不显示 Prompt、reasoning 或隐藏 Canon；
- 支持退出后重新打开同一会话。

## 5. Phase 7D：会话门禁

状态：completed

- 30–60 Height 脚本化会话；
- 100 Height replay 保持现有门禁；
- 混合 Query、None、失败输入、Attempt 和 Wait；
- Query/None/模型失败不推进 Height；
- 重启前后结果与 roots 一致；
- 输出中无 secret、内部 ID、隐藏来源或 reasoning。

完成 Phase 7 后，项目才达到“可供人连续试玩的文字 VR Demo”，然后再决定扩展关闭容器、纸条、猫/NPC 或 Web UI。
