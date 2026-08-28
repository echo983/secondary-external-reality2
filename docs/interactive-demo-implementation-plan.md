# 可交互 Demo 实施计划 v0.2

日期：2026-08-27
状态：replanned
前置：`vision-direction-review-2026-08-27.md`

## 1. 当前判断

Phase 0–7 已完成可信运行时、门/水壶纵向案例、真实 Qwen adapter、SQLite 恢复和 CLI 组合。它们构成**开发者纵向切片基线**，尚不能证明可试玩文字 VR Demo。

上一版把最大缺口判断为“组合而不是新增世界能力”，并以脚本化长会话代替自由体验门禁，这是错误的。实际首要缺口是：

- 没有主体当前位置的环境感知场和会话第一屏；
- 无目标观察被实体 grounding gate 错误拒绝；
- compiler 和 dispatcher 只支持具体 `open` / `wait` 路径；
- LLM 只做输入分类，没有受约束的局部效果提案位置；
- 场景事实不足以支持连续探索与组合行动；
- 自动验收没有衡量开放行动覆盖与产品边界响应占比。

## 2. 已完成基线：Phase 0–7

状态：completed, reclassified

保留成果：

- strict proposal、source span 与 grounding 安全；
- Canon/Experience 双账本；
- Commit、replay、幂等、冲突和恢复；
- World Height、World Time 与 Process；
- 推门、Wait 水壶和枪式诱导纵切；
- 唯一批准 Qwen 模型的 live adapter；
- SQLite CLI 与会话恢复；
- 35 项当前回归测试。

该阶段退出语义改为“可信内核和交互壳可继续扩展”，不再称为“可供人连续试玩”。

## 3. Phase 8A：开放性协议 spike

状态：completed

目标：在继续增加场景内容前，证明开放行动不必退化为表面动词 handler。

产物：

- `ActionProposal` 的最小 strict schema；
- 通用世界原语与 effect schema 候选；
- 对象 affordance/capability 表达；
- 主体感知 horizon 与无目标 perception scope；
- 确定性规则与模型候选的分工；
- 单调用和可选两阶段调用的延迟/成功率比较；
- 至少 20 条不逐句写 handler 的离线案例。

退出条件：

- “看看四周”不需要虚构 target entity；
- 至少五种表面不同的行动能组合到少量通用原语；
- 模型候选不能创建实体、隐藏事实或直接 RealityDelta；
- 候选越权、歧义或非法结构产生零 Canon；
- 确认正常 Height 的调用预算。

若 spike 证明单模型候选无法稳定验证，应收缩首版开放范围或增加声明式对象规则；不得退回逐动词硬编码后仍宣称开放行动。

完成记录：20 项离线协议案例通过；真实 Qwen 最终 6/7 通过，枪式未知 slot 被严格拒绝；两阶段串行调用因约 5–34 秒的单次延迟不进入普通运行时。详见 `qwen-action-proposal-spike-2026-08-27.md`。

## 4. Phase 8B：最小感知场

状态：completed（2026-08-28）

建立足以被观察的单房间世界：

- 主体 placement、姿态、基本视觉/听觉/触觉/本体感觉；
- 房间边界、入口、光源和遮挡关系；
- 若干可见、可达和不可见对象；
- 初始 Observation Packet；
- 环顾、定向观察、聆听、身体感知；
- Query 与主动 Perception Attempt 的明确分流。

门禁：

- 初次进入无需玩家猜命令即可获得第一屏；
- “看看四周”返回当前感知范围，而不是 `TARGET_UNGROUNDED`；
- 关门或容器遮挡的内容不泄漏；
- 纯读取不修改 Canon；改变姿态、位置或耗时搜索按真实结果结算。

完成记录：v2 单房间 Genesis、初始第一屏、ambient/hearing/body 当前场景投影、常见无目标观察的零模型零 Height 快路径、门外定向声学/视觉投影、基于 placement 链的通用同空间可见实体选择，以及关门遮挡和开门后走廊暴露。玩家触发的只读 Observation 随 Attempt Audit 持久化来源。姿态变化与定向观察被组合为主动 Perception Attempt：它推进 3 秒世界时间、更新身体姿态、创建 Height，并由提交内 seed 确定性物化 Experience/Evidence/Acquisition；SQLite 重启可补写中断的体验提交。关门时不泄漏走廊，开门后才暴露有光走廊的局部视野。66 项回归门禁通过。

范围说明：Phase 8B 证明了只读与主动感知的协议分流及完整提交链；任意目标搜索、移动观察和更多姿态/感官组合仍由 Phase 8C 的通用原语扩展，不把当前有限中文适配层宣称为开放行动完成。

## 5. Phase 8C：通用行动原语

状态：completed（2026-08-28）

优先实现可组合的最小集合：

- orient / move；
- contact / apply-force；
- hold / release / place；
- change-relation；
- communicate；
- wait。

旧 `open` handler 作为迁移案例：把“推门”表达为接触、施力和改变开合关系，而不是继续作为中文动词特例。每项效果必须由当前对象状态、能力、关系和方法支持。

门禁使用等价表达和组合表达，例如：

- 推门、用肩顶门、轻轻推开一条缝；
- 拿起、拖动、放到旁边、用一个物体挡住另一个；
- 趴下从缝隙观察；
- 同一输入中按顺序完成多个动作。

物理失败、部分结果与产品不支持必须使用不同边界。

完成记录：运行时已接入一次调用的统一 ActionProposal envelope；场景以 opaque slots 暴露，并由 fixture affordance、本地关系白名单、当前事实和 revision 进行可信验证。计划中的十类原语全部拥有最小世界规则；旧推门路径已作为 contact/apply-force/change-relation 迁移案例，同一输入的 hold → place 可产生共享 AttemptRef 的顺序提交，部分完成有独立结果类型。通用原语的 Observation/Experience 与 SQLite 补写沿用同一提交协议。当前回归门禁 72 项。详见 `unified-action-runtime-review-2026-08-28.md`。

范围说明：对象种类和物理规则仍很小；Phase 8C 完成表示通用扩展机制成立，不表示任意自然语言行动都已覆盖。真实 Qwen 全量小样本仅 3/7 结构接受且尾延迟达到 45 秒，因此产品可行性必须由 Phase 8D 判定。

## 6. Phase 8D：盲测自由会话

状态：next

从 `fc1.txt`、`fc2.txt` 和 `世界反馈者手册.md` 抽取动作形态，但不把最终测试句交给逐句实现。另由测试者自由输入 15–30 分钟。

记录：

- 合理行动落地、世界内失败、歧义和产品边界的比例；
- `TARGET_UNGROUNDED` / `CAPABILITY_UNSUPPORTED` 的原因分布；
- 同义表达一致性；
- 是否出现玩家断言晋升、隐藏信息泄漏或无法重放；
- 每 Height 模型调用、延迟和失败；
- 玩家是否开始试探世界，而不是猜系统命令。

退出条件不是追求虚假“任意行动成功率”，而是证明系统在已声明场景边界内优先尝试裁决，且自由会话不主要由产品能力边界构成。

## 7. Phase 9：扩展体验面

状态：blocked by Phase 8

在 Phase 8 通过后再依次评估：

1. 关闭容器与隐藏内容；
2. 可写、可藏、可再次发现的纸条；
3. 身体压力或自主反应；
4. 一个独立 NPC 或动物；
5. Web UI；
6. 图片 Observation。

新增对象必须主要通过既有原语和 affordance 接入。若每类对象都要求重写输入、裁决和呈现主链，应先修正抽象层。

## 8. 可试玩 Demo 的新退出条件

- 初始环境反馈和无目标观察成立；
- 玩家可用自然语言表达方法和动作组合；
- 至少一批盲测行动无需专用句子 handler；
- 失败主要来自世界事实或清楚的真实边界；
- Canon、感知权限、Commit 和 replay 不变量保持通过；
- 一个 15–30 分钟自由会话包含观察、移动、对象操作、等待和至少一次合理失败/部分结果；
- 系统不表现为“拒绝更多、但有数据库的聊天机器人”。

达到这些条件后，文档状态才能改为 `completed`，项目才重新获得“可供人试玩的文字 VR Demo”称谓。
