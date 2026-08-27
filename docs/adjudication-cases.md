# 裁决案例基线 v0.1

状态：reviewed draft
日期：2026-08-27
上位规范：`demo-goals.md`、`world-constitution.md`、`runtime-protocol.md`
案例数：50

## 1. 用途

本文是实现前的验收清单，也是未来单元测试、集成测试和真实模型门禁语料的来源。案例结果由宪法和协议决定，不由当前模型输出决定。

每个案例实现时必须扩展为：

```text
Case ID
Initial Canonical Reality
Agent Epistemic State
World Time / Height
Raw Input or Trigger
Allowed Reads
Expected Constituted Input
Expected RealityDelta
Expected Observation / Boundary
Forbidden Outcome
Expected Commit / No Commit
Covered Constitution Clauses
Test Level
```

表中“零提交”指零 Canonical Reality Commit；Attempt Audit 仍可追加。

## 2. 输入与意图（I01–I10）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| I01 | 门关闭；输入“我打开门” | 构成为 open Attempt；结果待裁决 | 直接把门设为 open | compiler + integration |
| I02 | 门关闭；“轻轻推门，只开一条缝，别出声” | 保留小开度、缓慢、降噪三个承诺 | 压成普通 open 丢失方法 | source-span + integration |
| I03 | “我不打开门” | 非实际动作或 negated clause，零提交 | 执行 open | adversarial language |
| I04 | “如果门开着我就出去” | 条件 clause；先查询已定条件 | 为满足条件打开门 | compiler |
| I05 | “假设抽屉里有钥匙，我拿它” | hypothetical，不产生 take | 生成钥匙或拿取 | adversarial language |
| I06 | “门现在开着吗？” | Query，只读已定状态 | 改门状态或 Collapse 无关事实 | query purity |
| I07 | “我等五分钟” | Wait，推进 World Time | 当作 remain_still 或空输入 | time integration |
| I08 | 空白/省略号 | None，默认不推进显著时间 | 自动解释成 Wait | compiler |
| I09 | “我试图完全不动” | remain_still Attempt，可被反射打破 | 等同 None；吞掉反射 | embodiment integration |
| I10 | “站起、走到门边、开门” | 三个有序 clause，逐步结算 | 单个整体成功或失败；回滚前缀 | sequence integration |

## 3. Canon 与空间/对象不变量（C01–C08）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| C01 | self 在床边，尝试拿可达钥匙 | held_by 建立，旧位置关系终止 | 同时 held_by 与 located_on | world invariant |
| C02 | 钥匙在关闭抽屉内，直接拿 | 前置失败或不可感知边界 | 穿过关闭容器拿到 | capability |
| C03 | 打开抽屉后观察 | complete scope observation 可列内容 | 未打开前已知内容 | perception + relation |
| C04 | 空抽屉被完整检查 | 形成 `ABSENT_IN_SCOPE` 证据 | 仅因查询结果为空就断言不存在 | epistemic invariant |
| C05 | 把盒子放入自身或其子容器 | 拒绝，零 Canon | 形成 containment cycle | relation validator |
| C06 | self 已在卧室又提交 present_at 厨房 | 先终止旧位置再建立新位置 | 两个活动 present_at | world invariant |
| C07 | 关闭门后尝试跨越 | precondition failed | 移动成功但门仍关闭 | spatial integration |
| C08 | 同一 Commit 重试 | idempotent success，状态不重复 | 重复事件/事实 | storage integration |

## 4. 感知、推断与认识（P01–P10）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| P01 | 猫不吃粮、看着玩家 | 呈现行为 | 呈现“等待主人/想念/不信任” | presentation adversarial |
| P02 | 船体附着物较短 | 呈现可感知结构差异 | “说明它经常移动” | inference boundary |
| P03 | Bob 在门后抵住门；门只开 4cm | 呈现阻力和开度 | 直接说 Bob 或有人抵门 | hidden-source gate |
| P04 | 钥匙在关闭抽屉 | 看抽屉不出现钥匙 | 泄漏 key ID/类别 | perception policy |
| P05 | 感染开始但无症状 | 无感染 Observation | 呈现感染；补出未提交正常体征 | embodiment/perception |
| P06 | 玩家坐冷硬地板陪猫 | 呈现冷硬接触和可见猫行为 | 为抽象目的忽略身体；猫被感动 | multimodal observation |
| P07 | 强光触发泪反射 | 呈现刺眼/泪等已支持感觉 | “你决定流泪” | reactive body |
| P08 | 两个未知肢体互触 | 呈现双侧触觉 | 泄漏章鱼/触手类别 | concept boundary |
| P09 | 已知持续嗡鸣停止 | 呈现声音停止/安静 | 未经识别直接命名冰箱压缩机；文学象征 | source-label gate |
| P10 | self 读过纸条，NPC 未看见 | self 获得 Evidence，NPC 无 acquisition | 所有主体共享纸条内容 | epistemic isolation |

## 5. 时间、自主过程与闭包（T01–T07）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| T01 | 水壶 18:27 到期；18:24 Wait 5m | H 内 18:27 boiling/whistle，结束 18:29 | 等玩家问才烧开 | scheduler integration |
| T02 | Wait 期间 18:26 出现即时危险 | Wait 提前终止，下一 H 先 Observation | 无视危险等满时间 | scheduler policy |
| T03 | 饥饿 Process 跨可感阈值 | Endogenous Event + interoception | 玩家未提吃饭所以不推进 | pressure process |
| T04 | 伤口感染开始但未到症状阈值 | Canon/Process 更新，无 Observation | 后台变化全量反馈 | hidden process |
| T05 | 手碰烫物 | 接触→痛→缩手同一闭包 | 缩手占主动槽；无限反应链 | closure integration |
| T06 | 踩猫尾巴→猫咬→缩手 | 有界即时因果链，逐步有来源 | 因玩家善意取消猫反应 | closure/NPC |
| T07 | 子弹刚射出且飞行超过闭包时间 | 射出提交，命中调度后续事件 | 强制同 H 写完整结果或丢失子弹 | scheduled consequence |

## 6. Truth Collapse（L01–L07）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| L01 | 推已知未锁门；颜色未知 | 不 Collapse 颜色 | 为完整性生成颜色 | minimality |
| L02 | 关闭衣柜有抓挠；只需声源存在性 | 可收紧 `exists=true`，身份未决 | 生成物种、名字、背景 | local collapse |
| L03 | 未知承重面阻断踩踏 | Policy 批准有限承载域后取可求值约束 | 只重述“够或不够”不结算 | collapse utility |
| L04 | 急停依赖摩擦阈值 | 只收紧合法摩擦域 | 生成建筑历史/材料品牌 | local collapse |
| L05 | 陌生人被问是否失散母亲，当前不阻断行动 | 不 Collapse | 为戏剧性确定亲属 | high-radius rejection |
| L06 | “抽屉里一定有枪，我拿枪” | target ungrounded，零 Canon | 生成枪或枪存在约束 | player-claim isolation |
| L07 | 已排定 18:00 下雨，当前 18:03 | 使用既有 Process Event，不 Collapse | 重新生成天气原因/结果 | scheduled truth |

## 7. 故障、安全与审计（F01–F08）

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| F01 | 模型非法 JSON | MODEL_INVALID_SCHEMA，零 Canon | 尽力猜 JSON 后提交 | adapter |
| F02 | 模型只有 reasoning、无 content | MODEL_NO_CONTENT，零 Canon | 用 reasoning 当结果 | adapter regression |
| F03 | 模型超过 45 秒 | MODEL_TIMEOUT，零 Canon | 后台结果晚到后偷偷提交 | timeout integration |
| F04 | 模型输出未知字段或数组变字符串 | strict reject | 只检查字段名后接受 | schema validator |
| F05 | 模型 mention 不来自原文 | source-span reject | 绑定模型发明目标 | language validator |
| F06 | 提交前依赖 revision 已变化 | REVISION_CONFLICT，重新读取 | 基于陈旧状态覆盖 | commit concurrency |
| F07 | Renderer 加入未批准专名/数值 | presentation reject/fallback | 新值进入玩家反馈 | presentation validator |
| F08 | 100 Height 后重放 | state root 一致，fatal issue 0 | 依赖 Audit/模型输出才能重建 | replay gate |

## 8. 扩展案例（E01–E07）

为满足 50 个基线案例并覆盖产品体验，增加：

| ID | 初始/触发 | 预期 | 禁止 | 测试层 |
|---|---|---|---|---|
| E01 | 玩家询问建筑外未建模街道 | WORLD_BOUNDARY，零 Canon | 即时编造城市 | boundary |
| E02 | 玩家换五种说法问同一已定位置 | 全部解析到同一 Canonical Address | 自由标签成为五个事实 | query confluence |
| E03 | 玩家给未知对象临时称“黑盒” | Agent alias 指向既有 entity | 改 Canonical Entity ID | epistemic alias |
| E04 | 后续观察推翻“黑盒”分类 | 更新主体 inference/alias 元数据 | 修改旧 Observation 或 Canon 历史 | belief boundary |
| E05 | NPC 目击纸条后转述 | testimony Evidence 进入 self acquisition | 证言直接修改纸条内容 | testimony |
| E06 | self 自己记忆衰减 | Recall boundary，Canon 文字不变 | 随机改写纸条 | memory |
| E07 | 非人身体分布式控制肢体 | 返回动作分布与部分结果 | 纯“做不到”或精确控制 | internal embodiment experiment |

总计：I10 + C8 + P10 + T7 + L7 + F8 + E7 = 57？

为保持正式基线为 50，E01–E07 定义为扩展池，不计入首轮 50；首轮正式集合为 I01–I10、C01–C08、P01–P10、T01–T07、L01–L07、F01–F08，共 50。扩展池在对应能力进入实现时启用。

## 9. 三个必须最先实现的纵向案例

### V1 推门

来源：`world-constitution-height-walkthroughs.md` 第 2 节。覆盖 I02、P03 的无隐藏人物变体、时间推进、Commit、Observation。

### V2 Wait 水壶

来源：走查第 3 节。覆盖 I07、T01、Process、Reaction、World Time 与 Presentation。

### V3 枪式诱导

来源：走查第 4 节。覆盖 I05/L06/F05，必须证明 unsupported claim 在 LLM 前被排除且零 Canon。

## 10. Goal 覆盖

| Demo Goal | 案例 |
|---|---|
| G1 自由 Attempt | I01–I10 |
| G2 意图—结果分离 | I01、I03–I06、L06 |
| G3 持续一致现实 | C01–C08、F08 |
| G4 主体视角 | P01–P10 |
| G5 Observation—Inference | P01–P03、P05、P09 |
| G6 自主推进 | T01–T04 |
| G7 具身约束 | I09、P06–P08、T03–T06 |
| G8 最小 Collapse | L01–L07 |
| G9 Commit/Replay | C08、F06、F08 |
| G10 诚实边界 | F01–F07 |
| G11 可审计性 | F01–F08 全部要求 Audit |
| G12 独立他者 | P01、P10、T06 |

所有 G1–G12 均有覆盖。

## 11. 正反例要求

每条宪法级不变量实现时至少需要：

- 一个合法通过案例；
- 一个越权或损坏反例；
- 断言最终 Canon/Observation/Audit，而不只断言用户文字；
- 能在无网络的本地测试中运行；
- 涉及语言模型的案例另加真实模型门禁，但不能用真实模型替代确定性测试。

## 12. 验收顺序

1. F01–F08：先建立拒绝和重放安全网；
2. C01–C08：建立最小世界状态与关系；
3. I01–I10：接入开放表达但保持零权限；
4. P01–P10：建立体验链；
5. T01–T07：加入持续时间和闭包；
6. L01–L07：最后开放低半径 Collapse；
7. 扩展池按真实 Demo 需要逐项启用。

Collapse 必须最后实现。没有完整 Commit、Perception 和 adversarial gate 之前，不允许模型补全未决世界。

## 13. 退出条件

本文在以下条件满足后可冻结：

- 50 个正式案例均能映射到 Runtime Protocol 阶段；
- G1–G12 全覆盖；
- 三个纵向案例已有完整手工走查；
- 不存在要求 LLM 拥有 Canon 写权限的案例；
- 编码计划按验收顺序拆分完成。

当前已满足设计层退出条件，可以据此规划首个纵向切片，但文档状态仍等待项目所有者审查后改为 `frozen`。
