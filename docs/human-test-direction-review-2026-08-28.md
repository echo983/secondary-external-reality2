# 真人测试后的方向复审：Collapse 主线缺失

日期：2026-08-28
证据：`human-blind-edwin-01.jsonl`（本地测试产物，不提交仓库）及测试者会后回答

## 结论

测试者的核心批评成立：当前 Demo 没有实现愿景中的“UNRESOLVED 在结算真正受阻时按需 Collapse”。此前把 Phase 8C 标为 completed、把 Phase 8D 自动预门禁标为 passed，是错误的完成判断，现予撤回。

当前系统实现的是：预写 fixture 事实 + 通用化了一部分已知对象操作 + 严格拒绝未知依赖。它能证明模型不能直接写 Canon，却不能证明世界可以保持局部未决、在行动触及时生成最小且连续一致的现实。因此它仍然主要是“有账本和边界的预写场景”，没有达到文字虚拟现实的核心机制。

## 真人证据

10 次输入产生：3 committed、1 constituted query、6 failed。失败中 4 次为 `INTERNAL_INVARIANT`、1 次 `PRECONDITION_FAILED`、1 次 `TARGET_UNGROUNDED`。测试者报告：从未把它当作一个地方，没有一次反馈像真实世界结果，大部分开放尝试被拒绝；如果继续，会继续折腾毛毯。

具体问题：

1. “走到门前去”错误地把 `placement:self` 写成 `door-1`。这是把对象放置 affordance 与主体空间移动混为一谈；随后“我在哪里”“看看我的位置”“看看门外”“查看毛毯”触发内部不变量。
2. 主体已拿着毛毯后，“用毛毯堵住门”仍先执行 hold，因“已经拿着”而失败，说明组合计划没有根据当前状态消除幂等前缀。
3. “把毛毯铺在地面上”因地面没有预置 entity 而 `TARGET_UNGROUNDED`。系统没有判断这是可由现有空间表面表达、合法创建路径或 blocking unresolved 处理的局部问题。
4. `CollapsePolicy` 只有孤立单元测试。RuntimeSession、WorldSnapshot、SettlementCommit、fixture 和 replay 主链均没有真实 Collapse。
5. `primitive-action.ts` 把所有 `unresolvedDependencies` 直接转成 `TARGET_UNGROUNDED`，抹掉了“尚未确定”“产品不支持”“玩家虚构目标”之间的核心区别。

## 与愿景的冲突

原始讨论明确把运行时写成 `Settle(..., Collapses[n])`，并要求 `TruthCell constraint space → narrower constraint space`。核心文档 G8 也要求：只有合法 blocking dependency 才能最小 Collapse，玩家断言不能决定地址和值。

但实施计划把 Collapse 留在 Phase 0–4 的测试性策略，并在 Phase 8 只追逐感知与动作覆盖。这是计划方向偏移，不是单纯“阶段还没做到”。开放行动越多，若所有世界细节仍须预先写死，拒绝面只会扩大。

## 修正决议

1. Phase 8C 重新打开；现有通用原语成果保留，但不得再称核心机制完成。
2. Phase 8D 判定 failed，而不是 pending independent tester；当前真人记录已经足以推翻产品体验门禁。
3. 在增加容器、NPC、Web 或图片前，必须完成一个真实纵向案例：fixture 中存在未解析 TruthCell；自然行动被该地址真实阻断；world rule 而非玩家/模型申请 Collapse；Policy 限定地址、有限域、半径和 resolver version；resolver 只收紧最小约束；Collapse 与行动结果进入同一 SettlementCommit 和 state root；replay/SQLite 得到相同结果；非 blocking 查询和枪式诱导零 Collapse。
4. 首个案例使用测试者真正想继续操作的毛毯：其能否塞入当前门缝保持未决，直到明确尝试塞入时才 Collapse。结果可以成功或因太厚失败，但必须是世界结果，而不是产品边界。
5. 修复主体位置模型：空间 placement 与 proximity/orientation 分离；对象接受放置不等于主体可进入。

只有上述纵向案例和新的真人自由测试通过后，才重新评估 Phase 8 完成与 Phase 9 解锁。
