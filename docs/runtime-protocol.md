# 文字虚拟现实运行时协议 v0.1

状态：reviewed draft
日期：2026-08-27
上位规范：`demo-goals.md`、`world-constitution.md`
验证辅助：`world-constitution-height-walkthroughs.md`

## 1. 目标与边界

本文定义首个 Demo 的对象职责、World Height 状态机、Settlement、Commit、Observation 和 LLM 接口。本文不定义 UI，不承诺完整游戏引擎。

协议遵循：

```text
开放表达
→ 非权威语义提案
→ 确定性绑定与权限检查
→ 有界结算
→ 原子提交
→ 受限感知投影
→ 批准呈现
```

## 2. 核心标识与标量

所有权威对象使用稳定 ID，不使用自然语言名称作为身份：

```ts
type WorldId = string;
type EntityId = string;
type FactId = string;
type EventId = string;
type ProcessId = string;
type ObservationId = string;
type EvidenceId = string;
type AttemptId = string;
type Height = number;        // non-negative safe integer
type WorldInstant = string;  // ISO-8601 with timezone
type SemanticAddress = string;
type JsonScalar = string | number | boolean | null;
```

ID 必须由可信层生成。模型 mention 只能作为绑定候选。

## 3. 权威对象

### 3.1 WorldBasis

```ts
interface WorldBasis {
  worldId: WorldId;
  schemaVersion: string;
  fixtureVersion: string;
  genesisHash: string;
}
```

重放时不匹配必须失败。

### 3.2 CanonicalFact

```ts
interface CanonicalFact {
  factId: FactId;
  address: SemanticAddress;
  value: JsonScalar | readonly string[];
  status: "active" | "ended" | "corrected";
  canonicalHeight: Height;
  validFromWorldTime: WorldInstant;
  validUntilWorldTime?: WorldInstant;
  sourceRef: EventId | string; // event/collapse/genesis/correction
  revision: number;
}
```

同一单值地址不得同时存在两个活动值。集合和多关系地址由 Schema 明确声明。

### 3.3 TruthCell

```ts
interface TruthCell {
  address: SemanticAddress;
  domain: readonly JsonScalar[] | {kind: string; schemaRef: string};
  constraints: readonly CanonicalConstraint[];
  resolvedValue?: JsonScalar;
  revision: number;
}

interface CanonicalConstraint {
  constraintId: string;
  kind: "eq" | "neq" | "in" | "exists" | "range" | "relation";
  operands: readonly JsonScalar[];
  canonicalHeight: Height;
  sourceRef: string;
}
```

Constraint 增加后只能继续收紧或由显式 Correction 修正，不得静默放宽。

### 3.4 CanonicalEvent

```ts
interface CanonicalEvent {
  eventId: EventId;
  kind: string;
  participants: readonly EntityId[];
  causedBy: readonly string[];
  worldTime: WorldInstant;
  payload: Readonly<Record<string, JsonScalar | readonly string[]>>;
}
```

只有在世界中实际发生的动作、信号或变化进入 CanonicalEvent。纯解析失败、Meta 输入和未落地目标只进入 Attempt Audit。

### 3.5 Process

```ts
interface ProcessState {
  processId: ProcessId;
  kind: string;
  ownerRef?: EntityId;
  state: Readonly<Record<string, JsonScalar>>;
  lastEvaluatedAt: WorldInstant;
  nextSemanticTransitionAt?: WorldInstant;
  revision: number;
}
```

Process Producer 只能提出 Due Event，不能直接更新 Canon。

## 4. 非权威输入与审计对象

### 4.1 RawInput

```ts
interface RawInput {
  sessionId: string;
  actorId: EntityId;
  text: string;
  receivedAt: string;
  language: "zh" | "en" | "unknown";
}
```

### 4.2 InputProposal

```ts
type InputKind = "attempt" | "query" | "recall" | "wait" |
  "speech" | "meta" | "none" | "ambiguous" | "invalid";

interface SourceSpan {
  text: string;
  start: number;
  end: number;
}

interface InputProposal {
  kind: InputKind;
  clauses: readonly ProposedClause[];
  unsupportedClaims: readonly SourceSpan[];
}

interface ProposedClause {
  clauseIndex: number;
  goalSpan?: SourceSpan;
  methodSpan?: SourceSpan;
  targetMentions: readonly SourceSpan[];
  modifierSpans: readonly SourceSpan[];
  conditionalOn?: number;
}
```

InputProposal 阶段模型不得输出 Canonical ID、成功、RealityDelta 或世界值。开放行动的局部效果候选属于后续受限 `ActionProposal`，两者不得混为一次无边界自由生成。

### 4.3 ConstitutedInput

```ts
interface ConstitutedInput {
  kind: InputKind;
  actorId: EntityId;
  clauses: readonly ConstitutedClause[];
  unsupportedClaims: readonly SourceSpan[];
}

interface ConstitutedClause {
  clauseIndex: number;
  primitives: readonly string[]; // closed trusted effect vocabulary, composable
  goal: string;       // source-grounded semantic description
  method: string;
  targetIds: readonly EntityId[];
  modifiers: Readonly<Record<string, JsonScalar>>;
  conditionalOn?: number;
}
```

闭合的是可信世界原语、effect schema 和对象能力，不是玩家表面动词列表。compiler 可以把一个 clause 编译为多个可组合原语；无法唯一绑定实体时不得猜测。无具体对象的环境感知以主体感知 horizon 为 scope，不因 targetIds 为空而失败。

### 4.4 ActionProposal

```ts
interface ActionProposal {
  clauseIndex: number;
  primitives: readonly ActionPrimitive[];
  targetSlots: readonly string[];
  conditions: readonly ProposedCondition[];
  effects: readonly ProposedEffect[];
  perceptionScopes: readonly ProposedPerceptionScope[];
  durationSeconds?: number;
  unresolvedDependencies: readonly ProposedDependency[];
}

interface ProposedCondition {
  kind: "fact" | "capability" | "relation" | "reachability";
  subjectSlot: string;
  predicate: string;
  objectSlot?: string;
  value?: JsonScalar;
  source: "world_slice" | "operation_contract";
}

interface ProposedEffect {
  kind: EffectKind;
  subjectSlot: string;
  field: string;
  objectSlot?: string;
  value?: JsonScalar;
  certainty: "required" | "possible";
}

interface ProposedPerceptionScope {
  modality: "vision" | "hearing" | "touch" | "proprioception" | "interoception";
  originSlot: string;
  horizon: "ambient" | "directional" | "object" | "body";
  targetSlots: readonly string[];
}

interface ProposedDependency {
  kind: "binding" | "fact" | "capability" | "constraint";
  slot?: string;
  reason: string;
}
```

`ActionProposal` 是非权威语义裁决候选。它只能使用运行时提供的实体引用槽、原语词汇和 effect schema；不能创建 Canonical ID、不能提交值、不能把玩家 unsupported claim 当作前置事实。原文 span 和实体绑定由 InputProposal/可信 binder 负责，ActionProposal 不重复生成 span，只引用批准后的 opaque `targetSlots`。可信 validator 可以接受、缩减或拒绝候选，随后由确定性 builder 生成 Candidate Delta。

### 4.5 AttemptAudit

所有输入都可以进入非权威审计：

```ts
interface AttemptAudit {
  attemptId: AttemptId;
  rawInput: RawInput;
  proposal?: InputProposal;
  constituted?: ConstitutedInput;
  status: "received" | "constituted" | "boundary" | "failed" | "committed";
  failureCode?: string;
  committedHeight?: Height;
  modelTelemetry?: ModelTelemetry;
}
```

Audit 不属于世界事实，不能被角色查询当作记忆。

## 5. RealityDelta 与 Block

```ts
interface RealityDelta {
  events: readonly CanonicalEvent[];
  addFacts: readonly CanonicalFactDraft[];
  endFactIds: readonly FactId[];
  addConstraints: readonly CanonicalConstraintDraft[];
  processChanges: readonly ProcessChange[];
}

interface BlockCandidate {
  parentHeight: Height;
  worldTimeStart: WorldInstant;
  worldTimeEnd: WorldInstant;
  attemptRefs: readonly AttemptId[];
  intentionalEvents: readonly EventDraft[];
  endogenousEvents: readonly EventDraft[];
  exogenousEvents: readonly EventDraft[];
  reactiveEvents: readonly EventDraft[];
  collapseProposals: readonly ApprovedCollapseProposal[];
  delta: RealityDelta;
}

interface SettlementCommit {
  worldBasis: WorldBasis;
  height: Height;
  parentHeight: Height;
  parentStateRoot: string;
  worldTimeStart: WorldInstant;
  worldTimeEnd: WorldInstant;
  dependencyRevisions: Readonly<Record<SemanticAddress, number>>;
  attemptRefs: readonly AttemptId[];
  delta: RealityDelta;
  observationSeeds: readonly ObservationSeed[];
  stateRoot: string;
  committedAt: string;
}
```

`observationSeeds` 必须在 `VALIDATE` 前由可信投影器根据 future state 计算，并随世界提交一起固化；其中引用的新 Fact/Event ID 必须已由可信 builder 分配。它们不进入物化世界状态，但属于可重放的提交记录。

只有 World Time、Canon 或 Process State 至少一项实际变化时才创建新 Height。只读 Query、Meta、None、输入/绑定失败和纯边界响应不创建 Height，只追加 Attempt Audit。一个在世界中确实发生并耗时的失败动作可以创建 Height；未落地目标导致动作从未发生则不创建。Wait 推进 World Time，因此即使没有其他事件也创建 Height。

## 6. Height 状态机

```text
OPEN
→ DELIVER_PENDING
→ ACCEPT_INPUT
→ CONSTITUTE
→ COLLECT_DUE_EVENTS
→ RESOLVE_DEPENDENCIES
→ ADJUDICATE
→ COMPUTE_CLOSURE
→ VALIDATE
→ COMMIT
→ FINALIZE
→ MATERIALIZE_EXPERIENCE
```

任一阶段只能读取已声明输入，不能读取未来候选作为事实。

### 6.1 OPEN

- 读取最新 Finalized Height、state root 与 World Time；
- 建立不可变 Settlement Snapshot；
- 检查 world basis 和 replay health；
- 失败则停止，不调用模型。

### 6.2 DELIVER_PENDING

- 读取已经持久化但尚未投递的 ExperienceCommit；
- 生成 Approved Presentation Packet；
- 该阶段只读，不重新计算感知，也不决定 TruthCell；
- 同一 experience identity 的重试不得重复产生主体 acquisition。

### 6.3 ACCEPT_INPUT

- 接受一个主体通道的一份 RawInput；
- 空输入构成 `none`，不自动等于 Wait；
- 系统调度触发的无玩家 Height 可以跳过本阶段。

### 6.4 CONSTITUTE

流程：

```text
LLM InputProposal
→ strict schema/type/source-span validation
→ deterministic input-kind policy
→ entity/reference binding
→ perception-scope resolution or primitive compiler
→ constrained ActionProposal when deterministic rules are insufficient
→ ConstitutedInput or Boundary
```

模型失败、非法结构或超时：零世界提交，记录 Audit，并返回服务边界。不得接受 reasoning 字段替代最终 content。

### 6.5 COLLECT_DUE_EVENTS

- 根据计划的 World Time 区间查询 Process；
- 收集到期 Endogenous/Exogenous Event；
- 事件生产者只返回类型化候选；
- 同一 Process revision 只消费一次。

### 6.6 RESOLVE_DEPENDENCIES

- 从 ConstitutedInput 和 Due Events 计算必要 Canonical Address；
- 精确读取已定 Fact/TruthCell；
- 未决项进入 CollapsePolicy；
- 玩家 unsupported claim 不加入依赖证据；
- 检索只定位候选，不决定真值。

### 6.7 ADJUDICATE

首版顺序：

1. 确定性前置条件；
2. 已定世界规则；
3. 必要时验证受限 ActionProposal；
4. 获准的低半径 Collapse；
5. 确定性构造 Candidate Delta。

首版没有通用骰子。Adjudicator 与 Committer 保持可信和确定性，但可以验证模型提出的非权威局部效果候选。正常交互仍以一次关键路径模型调用为预算目标：模型应在同一结构响应中提供 InputProposal 与可选 ActionProposal，运行时只向其暴露最小相关世界切片；若必须在实体绑定后进行第二阶段提案，必须作为单独延迟实验通过门禁后才能启用。遇到候选无法验证、规则不能唯一决定且不允许 Collapse 的情况，返回明确边界，不让模型自由挑选现实。

### 6.8 COMPUTE_CLOSURE

即时反应闭包临时预算：

- 最大因果深度：4；
- 最大事件数：32；
- 同一 Height 内即时世界时长上限：2 秒，明确 Wait 除外；
- 检测重复 `(event kind, participants, state revision)` 防止循环。

超出预算的合法后果进入 Scheduled Event。数值在真实纵向切片后复审。

### 6.9 VALIDATE

必须通过：

- schema/type；
- ID/reference；
- dependency revision；
- operation contract；
- causality；
- time order；
- entity/relation invariants；
- collapse authorization/minimality；
- observation source closure；
- no unsupported claim promotion；
- no presentation-only fact；
- no partial sequence rollback。

失败时不产生部分 Block Commit。动作序列采用“每个成功物质步骤一个 Height”以保存真实前缀。

### 6.10 COMMIT / FINALIZE

- 获取唯一 writer 权限；
- 重新检查 parent、state root 和依赖 revision；
- 计算 Delta 的 future state；
- 验证 future state 不变量；
- 原子追加 SettlementCommit；
- 更新 Materialized State；
- 生成 state root；
- Finalize 后释放 writer。

同一 Height identity + 相同内容为幂等成功；相同 identity + 不同内容为冲突。

### 6.11 MATERIALIZE_EXPERIENCE

根据 Finalized SettlementCommit 内已固化的 Observation Seeds 和最新 Reality 生成 Observation、EvidenceRecord 与 EpistemicAcquisition，并幂等追加 ExperienceCommit。不得把 Delta 全量交给 Renderer。

世界提交先于 ExperienceCommit。如果进程在两者之间崩溃，恢复器必须从 SettlementCommit 中的 seeds 重新生成相同 experience identity；在 ExperienceCommit 成功前不得把该反馈标记为已投递。感知账本故障不回滚已经 Finalize 的世界 Height，但会阻止该会话继续接受新输入，直到恢复完成。

## 7. 时间推进规则

### 7.1 普通 Attempt

Adjudicator 根据动作尺度提出 `worldTimeEnd`，可信 policy 检查合理范围。模型不能任意跳过长时间。

### 7.2 Wait

首版一个 Wait 使用一个 Height 覆盖完整等待区间，Block 内保留所有到期事件的准确 World Time 顺序。即时反应纳入闭包；非即时后续过程排到未来。

若等待区间中发生必须让主体有机会响应的危险事件，Wait 在该事件时间提前终止，下一 Height 先投递 Observation。

### 7.3 None

单次空输入不自动推进世界。系统可以由下一个 Scheduled Event 主动开启无玩家 Height。UI 的真实等待时间是否映射 World Time 暂缓。

### 7.4 Query/Meta

只读 Query 只能读取主体已取得的 Evidence/Acquisition，或读取无需新世界行动且已经固定、当前可直接获得的状态；它不创建 Height，也不得 Collapse。搜索、翻找、转头查看、打开后检查完整范围等主动观察必须构成为 Attempt/Perception Operation，并按动作结算时间；只有该动作暴露了 fixture 预授权的 blocking TruthCell 时才可能依一般 CollapsePolicy 收紧真值，玩家期望的答案不能决定地址和值。

环境观察不要求具体 target entity。“看看四周”以 observer 当前 placement、姿态与感官 horizon 为 scope；“听听外面”以听觉可达空间为 scope；“感觉身体”以内感受和本体感觉为 scope。进入新会话、恢复会话或位置显著改变后，可以从已定状态生成不改变 Canon 的初始/更新 Observation。

## 8. 动作序列

自然语言多动作保留有序 clause。首版执行：

```text
clause 1 → settle/commit Hn
replay state
clause 2 → settle/commit Hn+1
...
```

- 后一步条件基于前一步真实结果；
- 失败后停止未执行后缀；
- 已提交前缀不回滚；
- 条件 clause 只有条件通过才执行；
- “打开抽屉，如果有枪就拿”不能由条件本身生成枪。

## 9. CollapsePolicy

### 9.1 请求

```ts
interface CollapseRequest {
  address: SemanticAddress;
  blockingReason: string;
  requestedConstraintKind: CanonicalConstraint["kind"];
  allowedDomain: readonly JsonScalar[];
  dependencySource: "world-rule" | "operation-contract" | "process";
}
```

`dependencySource` 不允许 `player-claim`。

### 9.2 首版权限

- 只允许 `local`；
- 只允许已注册地址；
- 只允许有限枚举或有界范围；
- structural 全部拒绝；
- persistent 默认拒绝，除非场景 fixture 预授权；
- 一个 Height 最多 2 个 Collapse Address；
- 每个提案必须列出保持未决内容。

Phase 0–4 不启用模型参与 Collapse。获准的有限域由 `DeterministicCollapseResolver` 使用 world seed、规范 address、当前 revision 和 fixture 声明的 resolver version 计算；相同输入必须得到相同约束。通用语义 Collapse 暂缓，不能作为纵向切片完成的前置条件。

### 9.3 LLM 输入

Continuity Resolver 只能收到：

- 已批准 address；
- allowed domain；
- blocking reason；
- 相关 Canon；
- 明确禁止的扩展字段。

它不能看到玩家用于诱导的 unsupported claim，除非作为标记为不可信的对抗审查材料；首版默认不提供。

### 9.4 验证

- 提案值必须在 domain；
- 必须真正收紧当前空间；
- `collapse_required=false` 时不得附带约束；
- 不得增加新地址；
- 新约束必须足以或明确部分解决 blocking dependency；
- Commit 后记录 canonical height 与 valid time。

## 10. 感知与呈现协议

### 10.1 ObservationSeed

```ts
interface ObservationSeed {
  observerId: EntityId;
  modality: "vision" | "hearing" | "touch" | "temperature" |
    "pain" | "proprioception" | "interoception" | "testimony";
  sourceFactIds: readonly FactId[];
  sourceEventIds: readonly EventId[];
  perceivableFields: readonly string[];
  forbiddenSourceLabels: readonly string[];
  scope: string;
  salience: number;
}
```

可信 Perception Policy 先决定 `perceivableFields`。模型不会直接拿完整隐藏 Fact。

### 10.2 Observation

```ts
interface Observation {
  observationId: ObservationId;
  observerId: EntityId;
  modality: ObservationSeed["modality"];
  content: Readonly<Record<string, JsonScalar | readonly string[]>>;
  scope: string;
  completeness: "partial" | "complete_for_scope";
  sourceFactIds: readonly FactId[];
  sourceEventIds: readonly EventId[];
  observedAtHeight: Height;
}
```

### 10.3 Presentation

```ts
interface ApprovedPresentationPacket {
  packetId: string;
  observerId: EntityId;
  language: "zh" | "en";
  observationIds: readonly ObservationId[];
  boundaryCodes: readonly string[];
  approvedValues: readonly JsonScalar[];
}
```

高风险值、实体枚举、边界和完整空集应该确定性呈现。LLM Renderer 只接收 packet 内的可表达内容，输出后再检查未批准专名和值。

## 11. Epistemic 协议

首版实现最小链：

```text
Observation
→ EvidenceRecord
→ EpistemicAcquisition(agent, evidence, mode)
```

Inference 可以作为非权威会话状态存在，但不得提交为 CanonicalFact。复杂 Belief Revision 与错误记忆暂缓。

```ts
interface ExperienceCommit {
  experienceId: string;       // deterministic from worldId/sourceHeight/observerId
  sourceHeight: Height;
  observerId: EntityId;
  observations: readonly Observation[];
  evidence: readonly EvidenceRecord[];
  acquisitions: readonly EpistemicAcquisition[];
  parentEpistemicRoot: string;
  epistemicRoot: string;
  committedAt: string;
}
```

Experience Ledger 是按 observer 分区、只追加、可幂等恢复的权威认识记录，但不是 Canonical Reality。它有独立 root；`stateRoot` 只覆盖世界物化状态。Observation/Evidence 必须可由 Genesis、SettlementCommit 的 seeds 与确定性感知 policy 重建到相同 `epistemicRoot`。审计和最终自然语言文本都不参与两个 root。

## 12. LLM 适配器

唯一允许模型：`@cf/qwen/qwen3.8-27b`。

```ts
interface ModelTelemetry {
  model: "@cf/qwen/qwen3.8-27b";
  startedAt: string;
  latencyMs: number;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  neurons?: number;
  attempts: number;
  errorCode?: string;
}
```

首版规则：

- 正常 Height 以最多一次关键路径调用为目标；任何两阶段语义裁决必须先通过独立延迟与收益门禁；
- 单调用超时初始值 45 秒；
- 仅容量类临时错误最多重试 2 次，指数退避；
- 无 content、length exhaustion、非法 JSON 不自动重试；
- reasoning 不是协议输出；
- 不使用模型 fallback；
- 输出必须 strict-parse，未知字段和错误类型拒绝；
- Prompt 和原始输出进入非权威审计，不进入 Canon。
- Phase 0–7 的 Renderer 使用确定性模板；真实模型目前只产生 InputProposal。开放行动阶段可以在同一受限响应内试验 ActionProposal；模型 Renderer 与模型 Continuity Resolver 仍暂缓。

## 13. 存储接口

```ts
interface CommitStore {
  latest(): Promise<SettlementCommit | null>;
  append(commit: SettlementCommit): Promise<"committed" | "idempotent">;
  readRange(from: Height, to?: Height): AsyncIterable<SettlementCommit>;
}

interface MaterializedWorldStore {
  load(root: string): Promise<WorldSnapshot>;
  apply(snapshot: WorldSnapshot, delta: RealityDelta): Promise<WorldSnapshot>;
}

interface AuditStore {
  appendAttempt(audit: AttemptAudit): Promise<void>;
  appendModelCall(telemetry: ModelTelemetry, rawOutput?: string): Promise<void>;
}

interface ExperienceStore {
  append(commit: ExperienceCommit): Promise<"committed" | "idempotent">;
  readObserver(observerId: EntityId): AsyncIterable<ExperienceCommit>;
  pendingFrom(worldHeight: Height): Promise<readonly SettlementCommit[]>;
}
```

首版建议实现 SQLite 单文件事务；JSONL 可用于导出和人工检查。LanceDB 只在出现真实语义检索需要时加入。

## 14. 错误代码族

```text
INPUT_INVALID
INPUT_AMBIGUOUS
TARGET_UNGROUNDED
TARGET_NOT_PERCEIVABLE
CAPABILITY_UNSUPPORTED
WORLD_BOUNDARY
PRECONDITION_FAILED
COLLAPSE_NOT_AUTHORIZED
COLLAPSE_AMBIGUOUS
MODEL_TIMEOUT
MODEL_NO_CONTENT
MODEL_INVALID_SCHEMA
MODEL_CAPACITY
REVISION_CONFLICT
REPLAY_INVALID
INTERNAL_INVARIANT
```

错误代码与面向玩家的文字分离。模型故障不得伪装成世界内失败。

## 15. 重放与恢复

- Genesis + ordered commits 必须重建相同 state root；
- strict replay 遇 fatal issue 失败；
- diagnostic replay 收集所有 issue；
- Audit 缺失不影响 Canon replay；
- Presentation 文本不参与状态根；
- Experience Ledger 可从 world commits 中固化的 Observation Seeds 重建到相同 epistemic root；
- 模型输出不参与状态根，只有验证后进入 Delta 的结构化值参与；
- Process 的下一转换必须可由 commit 重建；
- 崩溃发生在 append 前则无提交，append 后重启必须识别已提交 identity。

状态根使用规范序列化：对象键按 Unicode code point 排序，数组只按协议规定的稳定顺序编码，数字限于 JSON safe integer/finite number，字符串使用 UTF-8；对编码字节计算 SHA-256。任何可能来自遍历顺序的集合必须先按稳定 ID 排序。精确测试向量在 Phase 1 冻结，改变编码规则必须提升 schemaVersion。

## 16. 可观测性

每个处理记录：

- RawInput 与 source spans；
- InputProposal/ConstitutedInput；
- 读取的 SemanticAddress 与 revision；
- due process events；
- Collapse request/policy/proposal；
- adjudication candidate；
- closure steps；
- validator issues；
- commit identity/state roots；
- Observation source closure；
- 模型 telemetry 与失败类型。

内部审计不得呈现给角色。

## 17. 首版安全预算

| 项目 | 初始限制 |
|---|---:|
| 单输入 clauses | 4 |
| 单 Height Collapse addresses | 2 |
| Closure 深度 | 4 |
| Closure events | 32 |
| 普通即时闭包 World Time | 2 秒 |
| 关键路径模型调用 | 1 |
| 单模型超时 | 45 秒 |
| 容量错误重试 | 2 |
| Presentation observations | 16 |

达到限制时产生明确边界或调度后续事件，不截断后伪称结算完整。

## 18. Runtime 验收

实现前必须能为每个阶段写出：输入类型、输出类型、读权限、写权限和失败结果。实现后至少通过：

1. 推门完整链；
2. Wait 水壶过程；
3. 枪式诱导零 Canon；
4. 关闭容器隐藏；
5. 无症状后台过程不呈现；
6. Renderer 来源泄漏阻断；
7. 多动作真实前缀；
8. 模型超时零提交；
9. revision conflict；
10. 100 Height replay root 一致。

## 19. 未决实现选择

- SQLite 表结构和哈希规范；
- 次要结果的不确定性机制；
- Perception salience 算法；
- persistent Collapse 的场景预授权格式；
- 系统调度的无玩家 Height 如何与交互会话同步；
- Renderer 是否首版使用模型；
- 人工测试 UI。

这些不阻塞裁决案例设计，但在编码纵向切片前必须逐项决定或明确暂缓。
