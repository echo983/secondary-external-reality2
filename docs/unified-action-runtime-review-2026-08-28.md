# 统一行动运行时审查

日期：2026-08-28  
模型：`@cf/qwen/qwen3.8-27b`

## 结论

Phase 8C 的协议和可信结算门禁成立：普通非快路径输入可以只调用一次模型，模型只看到当前可感知场景的 opaque slots 和声明式 affordance，只能返回非权威统一 ActionProposal；本地验证通过后，可信规则才生成 Canon、Commit 和 Experience。

这证明开放行动入口不需要退回逐动词世界 handler。但它不证明当前模型延迟和成功率足以支持自由试玩；该产品可行性问题进入 Phase 8D。

## 已落地范围

- ActionProposal 增加 `attempt/query/wait/speech/none/invalid` 处置类型，替代 InputProposal → ActionProposal 两次串行调用；
- 当前可见实体被映射为 opaque slot，隐藏走廊和不存在的枪不会成为可执行 target；
- fixture 声明对象 affordance 和允许关系，本地 constitution 拒绝模型越权效果；
- orient、move、contact、apply_force、hold、release、place、change_relation、communicate、wait 均进入可信世界规则；
- “推门”运行时由 `contact + apply_force + change_relation` 候选进入门规则，旧 InputProposal 只保留兼容回退；
- 同一输入可按同一 AttemptRef 顺序结算多个 clause；前缀已提交而后缀失败时返回 `partial`，不伪装原子回滚；
- 拖动与遮挡复用 placement/relation：拖到门边不自动等于遮挡，明确塞住门缝才建立 occludes 事实并改变视觉投影；
- 世界内前置条件失败、产品能力边界和目标未落地使用不同错误码；
- 通用原语 Experience 可从 SQLite 中断点确定性补写。

## 真实模型结果

三条 smoke 全部通过：环顾、朝门外听、用手推门。延迟约 5.6、5.9、10.7 秒。真实 live Runtime 中“用肩膀顶开门”经一次模型调用提交为 H1，模型没有直接写 Canon。

随后完整七条评测为 3/7 结构接受：

- 环顾、推门、趴下观察候选被 schema 接受；
- 朝门外听和毛毯组合动作各一次达到 45 秒超时；
- 肩推门因 condition 同时给出 object/value 被严格拒绝；
- 枪式诱导引用未知 slot，被严格拒绝并保持零 Canon。

单条延迟约 6–45 秒。统一调用消除了两阶段串行翻倍，但尾延迟、过长候选和偶发 schema 失败仍可能让自由体验主要由等待与边界构成。

## Phase 8D 必须回答的问题

1. 常见感知快路径能否把真实模型调用占比降到可接受范围；
2. 在盲测动作分布中，世界内成功、合理失败、产品边界、模型失败各占多少；
3. 是否值得继续压缩 ActionProposal，减少非权威 conditions/effects 的输出长度；
4. 当前模型的尾延迟是否构成首版实时文字 VR 的严重障碍。

不得因提高表面成功率而接受未知 slot、猜测实体、非法 schema 或模型直接决定世界结果。

补充门禁（2026-08-28）：完成度审计发现最初实现没有覆盖计划示例中的拖动/遮挡。现已加入 contact+move+place 拖动与 hold+place+change-relation 遮挡；placement field 改为闭合词汇，`at` 与 `under_gap` 分离。真实 Qwen 对“把毛毯塞到门缝下面”构成为 hold→place，可信 constitution 得到 `occludes=true`；本地视觉投影仅在该限定存在时阻断门外视野。回归门禁更新为 74 项。
