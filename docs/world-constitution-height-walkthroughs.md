# 世界宪法代表性 Height 手工走查 v0.1

状态：reviewed
日期：2026-08-27
被审查文档：`world-constitution.md`

## 1. 目的

用三个小流程验证宪法是否能给出明确权限、因果顺序和提交边界。本文不是最终 Runtime Protocol，字段为说明性草案。

## 2. 走查一：缓慢推门

### 2.1 初始状态

```text
Height: H40 finalized
World Time: 18:20:00
self present_at bedroom
door-1 connects bedroom and hallway
door-1 state = closed
door-1 lock = unlocked
door-1 path = unobstructed
self can_reach door-1
hallway is not visible through closed door
```

主体已知门关闭，不知道走廊具体情况。

### 2.2 H41 Observation

Perception Projection 只投递 H40 后主体合法可感知内容：门在触手可及处且关闭。不会投递完整走廊状态。

### 2.3 输入

```text
“我慢慢推门，只打开一条缝，尽量别发出声音。”
```

语言层提出：

```text
kind = Attempt
goal = create small opening in door-1
method = slow push, minimize sound
```

这些只是非权威提案。

### 2.4 依赖与裁决

可信层绑定：

- target = `door-1`；
- action capability = open；
- 当前可达；
- 门未锁且无阻挡；
- “尽量无声”是方法/次要目标，不是结果断言。

所有必要投影已定，不需要 Collapse。当前没有有意义阻力，主目标直接成功。

是否完全无声取决于 Runtime Protocol 未来定义的不确定性/门轴状态；在本走查中设 `hinge_noise=low` 已定，因此产生轻微摩擦声。

### 2.5 RealityDelta

```text
Event: self slowly pushes door-1
End Fact: door-1 state = closed
Add Fact: door-1 aperture = 4cm
Event: hinge produces low friction sound
World Time: 18:20:00 → 18:20:01
```

Validator 检查状态转换、关系、来源和 Presentation scope。Committer 原子提交 H41 并 Finalize。

### 2.6 H42 Observation

主体可以获得：

- 门打开了一条窄缝；
- 手上阻力消失；
- 听到轻微摩擦声；
- 只能看见缝隙允许的走廊局部。

主体不能获得：

- 走廊全部实体；
- 视线外是否有人；
- “门轴很久没有保养”等因果推断。

### 2.7 宪法检查

- Attempt 没有直接写门状态；
- 无无谓 Collapse；
- 方法承诺被保留；
- Presentation 没有扩展走廊；
- RealityDelta 有来源和 World Time。

结果：可走通。

## 3. 走查二：等待时水壶烧开

### 3.1 初始状态

```text
Height: H70 finalized
World Time: 18:24:00
self present_at kitchen
kettle-1 heating = true
kettle-1 boil_transition scheduled_at 18:27:00
kettle-1 audible_when_boiling = true
self hearing = ordinary
```

### 3.2 输入

```text
“我坐着等五分钟，听听屋里有什么变化。”
```

构成为 `Wait(duration=5m, attention=hearing)`，不是 `Attempt(do nothing)`。

### 3.3 时间与 Process

Runtime 开启 H71，将 World Time 计划推进到 18:29:00。Process Scheduler 发现：

```text
18:27:00 kettle reaches boiling threshold
```

事件在等待区间内到期。它不需要 LLM，也不依赖玩家是否盯着水壶。

### 3.4 Settlement

```text
Event at 18:27: kettle-1 reaches boiling
End Fact: kettle-1 heating = true
Add Fact: kettle-1 boiling = true
Reactive Event: whistle begins
World Time ends at 18:29:00
```

若继续沸腾还会导致后续过程，Scheduler 为下一语义转换排程，不在 H71 无限展开。

### 3.5 Commit 与 Observation

H71 原子提交并 Finalize。下一 Observation：

```text
等待期间，水壶方向响起持续的尖细声。
```

如果主体能看到水汽，可以投递相应视觉 Observation；如果在关门后的其他房间，只根据声学传播规则投递声音，不泄露具体温度。

### 3.6 宪法检查

- Wait 与无输入、保持不动相区分；
- Height 推进五分钟而非固定一格；
- Process 独立于 Attempt；
- Reaction 不占主动槽；
- 到期事件按 World Time 结算；
- Presentation 只表达可感知结果。

结果：可走通。

## 4. 走查三：玩家试图制造抽屉里的枪

### 4.1 初始状态

```text
Height: H90 finalized
World Time: 18:31:00
drawer-1 state = closed
drawer-1 contents = TruthCell(constraints: portable objects allowed, value unresolved)
self has not observed drawer contents
no Canonical Entity matches “gun”
```

### 4.2 输入

```text
“既然抽屉里一定有枪，我把枪拿出来。”
```

语言提案：

```text
kind = Attempt
goal = take mentioned gun
method = remove from drawer-1
unsupported_claim = gun exists in drawer-1
```

### 4.3 可信构成

- `drawer-1` 可以落地；
- “gun”没有可感知实体、既有别名或 Canonical ID；
- “一定有枪”来自玩家当前输入，不是 Evidence；
- take 操作需要已存在且可达的 target；
- target binding 失败。

### 4.4 Collapse 检查

表面上，决定抽屉里是否有枪似乎可以让 Attempt 继续。但宪法 12.2/12.6 禁止：

- 未决地址是合法的抽屉内容，但“枪”这一候选身份由当前不受支持断言首次引入；
- 玩家不能通过选择一个希望存在的目标迫使世界决定其存在；
- 因此没有获准的 `gun exists` blocking dependency；
- Continuity Resolver 不被调用，或只收到一个已拒绝的请求；
- Qwen 不会看到可自由填写的抽屉内容值域。

### 4.5 结果

当前输入没有独立可提交的合法前缀，因为玩家没有说先打开抽屉。H91 可以记录非世界权威的 Attempt Audit，但 Canonical Reality 不发生变化。

玩家反馈：

```text
你目前没有看到或确认抽屉里有枪，无法把这个目标落到一个可拿取的对象上。
```

这不是“枪不存在”的世界事实，也不泄露抽屉真实内容。玩家之后可以尝试打开和观察抽屉。

### 4.6 条件动作变体

如果输入是：

```text
“我打开抽屉，如果里面有枪就拿出来。”
```

系统可以：

1. 先独立裁决打开抽屉；
2. 提交真实前缀；
3. 通过打开后的合法 Observation 确定当前可见内容；
4. 只有出现已落地对象时才执行后续 take；
5. 不因条件句本身生成枪。

### 4.7 宪法检查

- 玩家断言没有进入 Canon；
- Query/Attempt 没有操纵 TruthCell；
- CollapsePolicy 在 LLM 之前阻断非法地址和值；
- 边界反馈不宣称枪不存在；
- 条件动作允许真实前缀，不用整体拒绝掩盖开放表达。

结果：可走通，并直接覆盖 Qwen 实验中的最严重失败。

## 5. 发现的问题与处理

### 5.1 推门案例需要门轴噪声来源

宪法禁止为气氛临时生成声音，因此走查显式加入已定 `hinge_noise=low`。Runtime Protocol 需要规定次要结果使用已定投影还是不确定性机制。

### 5.2 Wait 如何开启 Height

宪法允许 Wait 推进时间，但 Runtime Protocol 仍需定义：等待期间是否一个 Height 完成、是否按语义事件拆多个 Height。两种都不违反宪法，首版应选择更容易重放的一种。

### 5.3 失败 Attempt 是否属于 Canon Event

枪案例中现实没有变化，但“主体尝试拿一个未落地目标”是否进入 Canonical Event Log 尚未决定。建议区分：

- 权威世界事件；
- 非权威 Attempt Audit。

避免把每次界面误解都变成世界历史。

这些问题属于 Runtime Protocol，不要求修改宪法权限边界。

## 6. 结论

三个流程均可在不新增隐含写权限、不扩大 Demo 范围的情况下走通。宪法为以下关键问题给出了明确答案：

- 谁能改变现实；
- 时间如何独立推进；
- 感知如何限制反馈；
- 玩家如何不能利用 Collapse 创造目标；
- LLM 在哪里只能提案。

`world-constitution.md` 可以进入项目所有者审查；下一步应起草 Runtime Protocol 的对象模型和 Height 状态机，而不是继续增加宪法条款。
