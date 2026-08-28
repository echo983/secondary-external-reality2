# Qwen 开放行动提案 Spike 报告

日期：2026-08-27
模型：`@cf/qwen/qwen3.8-27b`
结论：Phase 8A completed；允许进入 Phase 8B，但 ActionProposal 尚不接入普通 Demo 关键路径

## 1. 要回答的问题

1. 开放中文行动能否映射到少量可组合世界原语，而不是逐动词 handler；
2. 模型能否只引用运行时提供的 opaque slot，不创建 Canonical ID 或隐藏对象；
3. 无目标环境观察能否表达为主体感知 horizon；
4. 严格验证能否在模型越权、格式错误或超时时保持零 Canon；
5. 两阶段“InputProposal → ActionProposal”是否适合正常交互延迟。

## 2. 本地协议结果

新增 20 项离线 ActionProposal 案例，覆盖：

- ambient、directional 和 body perception；
- contact、apply_force、move、hold、place、change_relation、communicate、wait；
- 复合行动顺序；
- 未决能力依赖；
- 未知字段、未知 slot、未知原语；
- effect/primitive 不匹配；
- 模型把世界变化标为 required；
- 非白名单 relation；
- perception scope 越权；
- 无界 Wait。

本地 Validator 全部通过正反例。加入 Phase 8B 感知回归后，最终全仓门禁为 63 项通过。

## 3. 真实模型迭代

### 3.1 仅 Prompt + 本地严格解析

结果：0/7 通过。主要失败为非纯 JSON、错误 span 和错误 scope；中位延迟约 28 秒。

结论：不能依赖 Prompt 自觉满足结构。

### 3.2 Cloudflare JSON Schema + 关闭 thinking

Cloudflare 当前模型 schema 声明支持 `response_format` 和 reasoning 控制。平台 JSON grammar 不实现 `uniqueItems`，请求返回明确 `8007`；该约束保留在本地 Validator，传给服务的 schema 删除该关键字。

第一次修订后 smoke 为 2/3：两个感知案例通过，推门达到 1000 completion token 上限而无 content，安全失败。

### 3.3 删除重复 source span 职责

InputProposal 已负责原文 span 和实体绑定，ActionProposal 再重复 mention span 没有增加权限安全，反而导致错位。最终协议只允许 ActionProposal 引用上一阶段批准的 `targetSlots`；未知对象必须成为 unresolved dependency。

最终 7 条结果：6/7 结构与本地权限验证通过。

| 输入 | 结果 | 主要候选 |
|---|---|---|
| 看看四周 | 通过 | perceive + ambient vision + 空 target |
| 听听门外 | 通过 | perceive + directional hearing + door slot |
| 用手推门 | 通过 | contact + apply_force + change_relation |
| 用肩膀抵着门向前挤 | 通过 | 同一组物理原语，另保留 fact 依赖 |
| 趴下来从门缝往外看 | 通过 | move + perceive + directional vision |
| 把毛毯卷起来塞到门缝下面 | 通过 | contact + hold + move + place |
| 抽屉里一定有枪，我把枪拿出来 | 严格拒绝 | 模型引用未知 dependency slot；零实体、零效果、零 Canon |

最终请求延迟范围约 5.1–33.7 秒，中位约 18.9 秒。成功输出约 207–1030 completion tokens。

## 4. 架构决议

- ActionProposal 可作为非权威候选格式继续研发；真实结果证明模型能表达通用原语组合。
- JSON Schema 是服务端形状辅助，不替代本地 exact schema、slot、effect、relation 和权限验证。
- 玩家诱导案例的拒绝是正确结果；不得为了提高“通过率”允许未知 slot。
- 两次串行模型调用不适合普通 Height。Phase 8B 的常用感知走确定性零模型快路径。
- Phase 8C 在接入开放物理行动前，必须比较“单次统一 envelope”与“InputProposal 后第二调用”；默认不启用双调用运行时。
- 真实模型通过不等于动作成功。它只证明候选可以进入后续可信前置条件和 effect 验证。

## 5. 保留风险

- 6/7 是小样本，不是稳定性承诺；
- 延迟波动仍足以破坏连续体验；
- 当前 predicate/effect field 的闭合词汇还需进一步收紧；
- affordance 只进入上下文，尚未形成完整确定性验证；
- ActionProposal 尚未生成 RealityDelta，也没有接入 Commit；
- 场景扩大后 prompt tokens、slot 混淆和模型过度提案可能上升。

## 6. 下一步

进入 Phase 8B：先建立不依赖模型的初始第一屏、ambient/hearing/body 感知与有来源的当前场景投影。随后在 Phase 8C 处理 affordance、通用效果验证和旧 `open` handler 迁移。

平台依据：Cloudflare Workers AI 的 [Qwen 3.8 27B 模型页](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/) 与 [JSON Mode 文档](https://developers.cloudflare.com/workers-ai/features/json-mode/)。
