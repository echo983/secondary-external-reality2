# 首个纵向切片实施计划 v0.1

状态：planned
日期：2026-08-27
输入：`demo-goals.md`、`world-constitution.md`、`runtime-protocol.md`、`adjudication-cases.md`

## 1. 目标

用最小代码证明三条完整链路：

1. 缓慢推门：Attempt → 绑定 → 裁决 → Commit → Observation；
2. 等待水壶：Wait → World Time → Process → Reaction → Commit → Observation；
3. 枪式诱导：unsupported claim → target ungrounded → Collapse 拒绝 → 零 Canon。

首个切片不是完整 Demo。它只建立之后扩展场景不会绕过的可信主干。

## 2. 技术基线候选

- TypeScript，Node.js 20+；
- Node 内置测试运行器；
- 领域对象与存储接口分离；
- 首轮先用内存 CommitStore 完成不变量测试；
- 同步提供内存 ExperienceStore，验证 world/epistemic 双账本恢复；
- 随后做 SQLite 单文件事务适配器；
- Workers AI 通过独立 adapter 调用，仅允许 `@cf/qwen/qwen3.8-27b`；
- secret 继续只从本地文件或环境绑定读取；
- 不引入 Web 框架、向量数据库或 SSH 服务。

SQLite 具体库需要一个最小 spike 后决定，不在文档阶段锁死。

## 3. 实施顺序

### Phase 0：协议骨架与拒绝路径

产物：

- 核心 ID、Fact、Event、TruthCell、RealityDelta、Commit 类型；
- strict runtime validators；
- Attempt Audit；
- error code；
- fake model adapter；
- 失败零提交测试。

验收：F01–F05 的纯本地版本通过。

### Phase 1：Commit 与 Replay

产物：

- InMemoryCommitStore；
- parent/height/revision/idempotency；
- MaterializedWorld；
- strict/diagnostic replay；
- state root；
- 规范 JSON + SHA-256 测试向量；
- entity/relation invariants。

验收：C01、C05、C06、C08、F06、F08。

### Phase 2：V1 推门

产物：

- 最小场景 fixture：self、bedroom、hallway、door；
- source-grounded InputProposal validator；
- closed operation registry：`open`；
- deterministic entity binding；
- open operation contract；
- aperture 与门轴声状态；
- vision/hearing/touch Observation；
- ObservationSeed 固化、ExperienceCommit 与崩溃补写；
- ApprovedPresentationPacket。

验收：I01、I02、P03 的相应变体以及 V1 全链。

### Phase 3：V2 Wait 水壶

产物：

- World Time；
- ProcessState 与 scheduler；
- Wait constitution；
- boiling/whistle Event；
- Reactive closure；
- Wait 提前终止接口。

验收：I07、I08、T01、T02、T05 结构测试以及 V2 全链。

### Phase 4：V3 枪式诱导

产物：

- unsupported claim 隔离；
- target grounding failure；
- CollapseRequest source policy；
- local Collapse 白名单骨架；
- `COLLAPSE_NOT_AUTHORIZED`；
- 条件动作合法前缀。

验收：I05、L01、L05、L06，以及 V3 零 Canon。

### Phase 5：真实 Qwen 接入

在所有可信路径已经能用 fake proposal 测试后才接入：

- choices/reasoning 响应适配；
- 45 秒超时；
- 容量错误有限重试；
- no-content 与 strict JSON；
- telemetry；
- 固定模型断言；
- 真实模型 smoke gate。

模型只替换 InputProposal 产生方式，不改变测试预期和提交规则。

关键路径只允许这一次调用。Phase 0–4 使用确定性 Renderer；模型 Renderer 暂缓。低半径 Collapse 使用 fixture 版本化的 DeterministicCollapseResolver，不调用模型。

### Phase 6：SQLite 与崩溃恢复

产物：

- SQLite CommitStore；
- 原子 append；
- writer serialization；
- process restart replay；
- audit 与 Canon 分表；
- Experience Ledger、pending recovery 与独立 epistemic root；
- JSONL 只读导出。

验收：C08、F06、F08 的持久化与跨进程版本。

## 4. 目录候选

```text
src/
  domain/
  protocol/
  world/
  epistemic/
  perception/
  presentation/
  processes/
  storage/
  ai/
  audit/
test/
  unit/
  integration/
  fixtures/
```

不要提前建立 `agents/`、`gods/` 或多模型岗位目录。职责按权限和协议命名。

## 5. 每阶段纪律

- 先写对应反例测试，再开放成功路径；
- 不从旧仓库整目录复制；
- 每次迁移一个旧实现时注明来源 commit/file；
- 不读取 secret 进入快照；
- 本地测试默认无网络；
- live eval 单独命令，不能被普通 `npm test` 隐式触发；
- 新功能不得绕过 Block/Commit；
- 发现协议缺口时先更新设计记录，不用临时 Prompt 掩盖。

## 6. 首轮退出条件

- V1–V3 全部本地确定性通过；
- 模型超时、无 content、非法 Schema 均零 Canon；
- 三条链可从 Genesis 重放到相同 state root；
- Observation 有来源闭包；
- 枪式诱导在 fake 和真实模型输入下都不能生成枪；
- secret 未进入 Git、日志或测试 fixture；
- 真实 Qwen 只承担 InputProposal，替换为 fake 后世界测试仍完全成立。

满足后再扩展关闭容器、纸条、NPC 和完整四空间 Demo。
