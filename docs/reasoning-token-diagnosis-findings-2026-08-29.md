# reasoning token 超预算问题根因排查 2026-08-29

背景:从 session 最早期开始,几乎每一轮实验都反复出现 `finish_reason=length`——每次的应对都是把 `max_completion_tokens` 调大,代码注释里一直写着"`reasoning:{enable_thinking:false}` 不能真正阻止 Cloudflare 侧生成推理 token",但这句话从来没有被真正验证过,只是从"报错、调大数字、暂时不报错"这个观察里推出来的猜测。这次专门花一次力气把它查清楚,而不是继续绕着走。

## 查证一:官方文档里根本没有 `reasoning` 这个参数

重新查 `@cf/qwen/qwen3.8-27b` 的完整参数列表,发现真正文档化的是 `reasoning_effort`(枚举值 low/medium,以及默认值 xhigh),没有任何叫 `reasoning`/`enable_thinking` 的字段。也就是说,我们从一开始发的 `reasoning: {enable_thinking: false}` 很可能根本不是这个模型认识的参数,不是"发了但不生效",是"发了但对方压根不认识这个字段"。

## 查证二:受控 A/B 实测,不是靠读文档猜

只看文档不够,直接打真实请求验证。用 4 个不同的裁决场景,分别在"当前流水线参数(`reasoning_effort:"low"` + `reasoning:{enable_thinking:false}`)"和"只有 `reasoning_effort:"low"`,不带那个字段"两种配置下各跑一次,`max_completion_tokens` 卡在 150(刻意收紧,方便复现截断):

```
配置 A（当前流水线参数）：
  [0] finish=stop   reasoningChars=117
  [1] finish=stop   reasoningChars=70
  [2] finish=length reasoningChars=242
  [3] finish=stop   reasoningChars=134

配置 B（去掉 enable_thinking 字段）：
  [0] finish=length reasoningChars=226
  [1] finish=stop   reasoningChars=70    <- 与 A[1] 完全一致
  [2] finish=length reasoningChars=242   <- 与 A[2] 完全一致
  [3] finish=stop   reasoningChars=134   <- 与 A[3] 完全一致
```

四组里三组（[1][2][3]）在两种配置下的 `completion_tokens`/推理字符数**逐字节一致**，唯一不同的是 [0]——而这一组两个配置的差异，和同一配置下不同场景之间本来就有的自然波动（70~242 字符）属于同一量级，更像是后端调度/批处理带来的不确定性，不是这个字段起了作用。**结论：`reasoning: {enable_thinking: false}` 是一个死参数，被静默忽略，不是"效果不够"，是根本没有效果。**

顺带验证到一个和文档不一致的地方：`reasoning_effort: "high"` 直接报 400（`Unexpected reasoning effort high. Supported types are xhigh (default), medium, and low.`）——真实可用值是 **low / medium / xhigh（默认）**，没有 "high"。我们一直在用的 `"low"` 已经是文档化参数里能设的最低档，不是中间某个可以继续往下调的值。

## 这意味着什么：不是"还没找到关掉推理的办法"，是"没有更低的办法了"

到这里可以下结论了：**我们已经用着这个模型允许的最低推理档位，没有参数层面的空间可以再压。** 即使在"low"档位下，单次调用的推理内容长度本身就有天然波动（这次简单测试里 70~242 字符，真实流水线里那些命题更多、待裁决更复杂的 prompt，波动只会更大），而这段推理内容会实打实地占用 `max_completion_tokens` 预算——这是模型本身的行为，不是一个可以被某个开关关掉的旁支功能。

所以，一直以来"报错就调大数字"这个应对方式，**本身就是对的、而且是唯一可行的方向**，没有什么被漏掉的更优解——只是过去一直伴随着"这个 enable_thinking 到底为什么不生效"这个悬而未决的疑惑。现在这个疑惑解掉了：它不是没生效，是从来就不存在。

## 已做的改动

把 `reasoning: {enable_thinking: false}` 从三个仍在使用/后续会继续跑的文件里删掉，换成一句准确的注释（`reasoning_effort: "low"` 才是真正生效的档位，且已经是最低档）：

- `experiments/pipeline-integration-slice/client.mjs`
- `experiments/juror-worker-deploy/src/index.mjs`
- `experiments/pipeline-worker-deploy/src/index.mjs`（同时把这次机会带上了本该在部署时就有、结果被漏掉的网络重试逻辑，见 `docs/pipeline-worker-deploy-findings-2026-08-29.md` 记录的那个 `TypeError: fetch failed`）

**没有**去改另外 8 个也用了这个死参数的历史 spike 脚本(`plausibility-judge-spike`、`semantic-intent-spike`、`juror-clerk-spike`、`reachability-inference-spike`、`world-feedback-narration-spike` 各自的 `run.mjs` 等)——这些实验已经跑完、结论已经写进对应的 findings 文档并且提交，这个字段从未真正生效，不会让那些已有的结论失效，回头去改已经结案的脚本除了徒增 diff 没有实际收益，不在这次范围内。

## 遗留、值得以后做但不是这次范围的事

- 没有对 `max_completion_tokens` 做过真正数据驱动的取值——一直是"报错了就加"，现在有了"推理内容长度有天然波动、需要预留余量"这个准确的心智模型，以后可以考虑真的记录 `usage.completion_tokens` 里推理/正文的实际占比分布，为每个角色定一个有依据的默认值，而不是继续遇错加数字。这次没有做，只是把方向理清楚了。
