# 模型分级部署与真实运行验证 2026-08-29

承接 `docs/model-tier-spike-findings-2026-08-29.md` 的离线 A/B 结果,把 GROUND→`qwen3-30b-a3b-fp8`、CLASSIFY 和 REACHABILITY_CLASSIFIER→`llama-3.1-8b-instruct` 系列接进 `sr2-pipeline-worker` 真实部署,过程中撞见两类真实问题,都已解决。

## 问题一:Workers AI 绑定和 REST 对同一个模型 id 的路由不一致

`@cf/meta/llama-3.1-8b-instruct` 通过 REST 直接调用完全正常,但通过 Worker 实际使用的 `env.AI.run()` 绑定调用报错:内部路由到了一个 2026-05-30 就已经废弃的别名(`infire-llama-3.1-8b-instruct`)。这是平台绑定和 REST 两条路径之间的真实差异,不是我们代码的问题——查文档不会查到这种东西,只有真实部署跑一遍才会撞见。换成 `@cf/meta/llama-3.1-8b-instruct-fast` 后绑定调用正常,REST 也验证过同样正常。

## 问题二:老的 reasoning token 超预算问题,在两个还没处理过的角色上复发

第一次全场景验证,5 轮里 2 轮真实失败(`finish_reason=length`,预算被推理耗光)——分别是可达性判断本身(`REACHABILITY_SYSTEM_PROMPT`)和编剧(`CONTINUITY_RESOLVER_SYSTEM_PROMPT`),两者都还在用基线模型、`maxTokens` 还停在 1800。这两次失败和这次模型分级切换本身无关,是同一个老问题(`docs/reasoning-token-diagnosis-findings-2026-08-29.md`)在两个之前没被逼出来过的角色上第一次真实发生。

鉴于 `CLAIM_EXTRACTOR`、`CONTINUITY_RESOLVER`、可达性判断这三个"推理量大、自由文本输出"的角色,这次都独立地在 1800 上真实炸过预算,判断这不是孤立个例,是这一类角色的共性风险,所以**没有等 ADJUDICATE、判官、书记员各自炸一次才逐个修**,一次性把这几个同类角色的 `maxTokens` 都从 1800 提到 3000。这是这次唯一一处不是"等真实失败才动手"的改动,是基于已经反复出现的模式做的预防性调整,不是拍脑袋。

## 最终验证:5/5 轮全部成功,零错误

同一个 5 轮场景(看毛毯→量门缝→塞毛毯→再查毛毯→开五斗柜拿枪)第三次跑,全部成功,这是这一系列测试里第一次没有任何一轮失败。每轮 `worker totalElapsedMs`:46684 / 256343 / 242634 / 116272 / 15989。

- 没有触发 Collapse 的轮次(第 1、5 轮)明显变快——第 1 轮 46.7 秒,比这一系列测试里同类场景动辄 120-230 秒快了不少。
- 真实触发 Collapse 的轮次(第 2、3 轮,分别是测量门缝宽度、判断毛毯能否塞进去)依然要 240 秒左右——符合预期,ADJUDICATE、判官、书记员、编剧这些真正需要推理的角色这次没有换模型,Collapse 本身要走完整的提议+三判官+书记员+重新裁决这一整套流程,成本没有变。

## 现状

`sr2-pipeline-worker` 现在稳定跑在混合模型配置上:GROUND 用 `qwen3-30b-a3b-fp8`,CLASSIFY/REACHABILITY_CLASSIFIER 用 `llama-3.1-8b-instruct-fast`,其余角色(ADJUDICATE、NARRATE、编剧、判官、书记员、CLAIM_EXTRACTOR、可达性判断本身)继续用 `@cf/qwen/qwen3.8-27b`,`maxTokens` 统一提到了 3000(除了轻量分类器角色维持更小的预算,它们输出短、任务窄,没有观察到类似问题)。这次没有再进一步压缩需要真正推理的角色的耗时——那是另一个更大的问题(Collapse 触发频率本身、以及要不要让 NARRATE 收着点少主动断言),前面已经跟用户明确过这是一个正确性/叙述丰富度的权衡,不是这次要动的范围。
