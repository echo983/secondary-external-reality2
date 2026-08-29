# 轻量角色模型分级实测 2026-08-29

目的:`docs/architecture-direction-consensus-2026-08-28.md` 第 13 节把模型约束从"仅 qwen3.8-27b"放宽成"仅 Cloudflare 自托管模型"之后,实测能不能给 GROUND、CLASSIFY(结果分类)、REACHABILITY_CLASSIFIER(可达性分类)这三个偏机械的角色换一个更快的模型,同时不掉准确率。

代码:`experiments/model-tier-spike/`(`cases.mjs` 是这三个角色各自的带标准答案测试集,以前没有过,只在集成流水线里间接验证过;`run.mjs` 三个候选模型 × 三个角色的真实调用 A/B)。

候选:`@cf/qwen/qwen3.8-27b`(现在的基线)、`@cf/qwen/qwen3-30b-a3b-fp8`(同一 Qwen 家族,MoE 架构、每次前向只激活 3B 参数)、`@cf/meta/llama-3.1-8b-instruct`(非 Qwen 家族、更小,专门用来校准"太弱会有多差")。

## 结果:三个角色,三个不同的最优解,不是一个模型通吃

| 角色 | qwen3.8-27b(基线) | qwen3-30b-a3b | llama-3.1-8b |
|---|---|---|---|
| GROUND | 8/8,均 4072ms | **8/8,均 2576ms** | 3/8,均 308ms |
| CLASSIFY | 8/8,均 2545ms | 8/8,均 5829ms(含一次 23413ms 异常值) | **8/8,均 284ms** |
| REACHABILITY_CLASSIFIER | 6/6,均 3493ms | 6/6,均 4144ms | **6/6,均 187ms** |

- **GROUND 换 `qwen3-30b-a3b-fp8`**:准确率打平基线,延迟降了约 37%。
- **`llama-3.1-8b-instruct` 在 GROUND 上直接不可用**——8 条测试案例错了 5 条,证实了换非 Qwen 家族小模型在中文精细实体绑定任务上有真实风险,不是多虑。
- **CLASSIFY 和 REACHABILITY_CLASSIFIER,`llama-3.1-8b-instruct` 反而是表现最好的**——两项都满分,延迟只有基线的十分之一左右。这两个角色本质是"读一段已经生成好的中文裁决/判断文本,挑一个固定标签",信号相对表面(可信/不可信/信息不足、可达/不可达这类词),不需要深层中文生成能力,一个更小、更快、非中文专精的模型接得住。这不是预设的结论,是测出来才知道的——如果只按"哪个模型家族更适合中文"这种先验直觉去选,会错过这个更好的选择。
- **`qwen3-30b-a3b-fp8` 在 CLASSIFY 上撞见一次 23 秒的异常延迟**——说明换成它不能解决 reasoning token 长度天然波动这个根源问题,只是把它挪到了另一个角色身上,不是真正的解法。

## 局限,如实说明

每个角色的测试集只有 6-8 条,`llama-3.1-8b` 在 CLASSIFY/REACHABILITY_CLASSIFIER 上打满分,样本量偏小,不能完全排除运气成分。但差距的量级(十倍延迟、零错误 vs 现在的基线)大到值得先按这个方向切换,后续跟着真实 `/attempt` 调用积累更多样本继续观察,而不是在这个小测试集上反复加样本——这和 `CLAIM_EXTRACTOR` 当初校准的做法一致,先上、跟着真实运行迭代,不是在离线测试集上把所有把握都攒够了才动。

## 结论:三个角色分别切换模型,已在 `sr2-pipeline-worker` 里实现并重新部署验证

- `ground()` → `@cf/qwen/qwen3-30b-a3b-fp8`
- `classifyOutcome()` → `@cf/meta/llama-3.1-8b-instruct`
- `checkReachable()` 内部的分类步骤(不是可达性判断本身,那一步仍是真正的推理,继续用基线模型)→ `@cf/meta/llama-3.1-8b-instruct`

ADJUDICATE、NARRATE、编剧、判官、CLAIM_EXTRACTOR、可达性判断本身,继续用 `@cf/qwen/qwen3.8-27b`,没有变动——这些是真正需要推理/生成的角色,这次的测试范围本来就没有覆盖它们,不做无凭据的切换。
