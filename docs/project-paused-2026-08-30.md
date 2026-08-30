# 项目暂停 2026-08-30

edwin 决定暂时搁置这条实验线,把公开的 Cloudflare Worker 端点删掉以避免产生账单。这份文档记录暂停时的现状,方便将来重启。

## 暂停时做了什么

删除了两个已部署的 Worker(`wrangler delete`),让它们的公网路由彻底失效,不会再被陌生流量(或者遗忘中的自己)意外触发真实的模型调用产生账单:

- `sr2-juror-worker`
- `sr2-pipeline-worker`

**没有删除的东西,重启时都还在:**
- AI Search 实例 `sr2-truth-store`——所有世界的历史(包括 `edwin` 世界当前的创世状态、以及之前测试用的几个世界)都还留着,它不对外公开、需要账户密钥才能调用,搁置期间不会被陌生人触发计费。
- `secret/cftoken.txt` 里的 API token,以及 Cloudflare 账户本身的所有配置。
- 所有代码,已经提交推送到 `main`。

## 重启步骤

```bash
nvm use
cd experiments/juror-worker-deploy
export CLOUDFLARE_API_TOKEN=$(cat ../../secret/cftoken.txt | tr -d '\n')
export CLOUDFLARE_ACCOUNT_ID=00f6c85f82f6297c8c0bef9460e013d9
npx wrangler deploy
cat ../../secret/cftoken.txt | tr -d '\n' | npx wrangler secret put CF_API_TOKEN

cd ../pipeline-worker-deploy
npx wrangler deploy
cat ../../secret/cftoken.txt | tr -d '\n' | npx wrangler secret put CF_API_TOKEN
```

**删除 Worker 会连带删掉它的 secret**,所以重新部署后要重新 `wrangler secret put CF_API_TOKEN`(上面已经带上了),不然 AI Search 相关的调用会因为拿不到 token 直接失败。

部署完直接打开 `https://sr2-pipeline-worker.edwin-abel-3.workers.dev/w/edwin` 应该就能看到 `edwin` 世界——暂停前最后一次清理过,只有创世状态。这一路测试过程中还留了不少别的 worldId(`structuralfix1`、`fixverify1`、`modeltiertest*`、`perftest2` 等),它们的历史没有清理,重启后如果不需要可以直接用"重置世界"按钮清空,不影响其它世界。

## 现状(暂停时的架构结论,重启时先看这个,不用从头重新决定)

- **多角色分级模型**:GROUND/ADJUDICATE/NARRATE/编剧/判官/书记员/CLAIM_EXTRACTOR/可达性判断用 `@cf/qwen/qwen3.8-27b`;CLASSIFY(结果分类)和 REACHABILITY_CLASSIFIER(可达性分类)用 `@cf/meta/llama-3.1-8b-instruct-fast`——这是真实 A/B 测试后的结论,GROUND 曾经换过更快的模型但真人测试发现不稳定已经换回来了(`docs/model-tier-spike-findings-2026-08-29.md`、`docs/ground-model-revert-findings-2026-08-29.md`)。
- **模型约束**:只允许 Cloudflare 自托管的模型(`@cf/...`),不允许第三方 API,不允许运行时静默降级——见 `docs/architecture-direction-consensus-2026-08-28.md` 第 13 节。
- **多世界隔离**:单一共享 AI Search 实例,靠 key 路径 `worlds/<worldId>/<entity>-h<height>-...` 一层目录 + folder 过滤隔离,一个新 worldId 就是一个新世界,不需要建实例。
- **四个真实 bug 是真人测试(而不是脚本测试)找到并修复的**,详见对应日期的 findings 文档:真相文档库自相矛盾(索引竞态)、GROUND 模型切换的隐性回归、ADJUDICATE 缺前提条件检查(点燃了没有火源的毛毯)、以及一次排查后确认不是真问题的列表接口异常。**这条经验值得记住:自动化测试测不出这些,真人不按剧本自由测试才测得出来。**
- **已知、还没处理的技术债**,重启后如果有精力可以继续:
  - 检索噪音会随会话变长累积(重复的"观察不改变状态"这类模板化事实),已经证实会稀释模型注意力、导致过一次真实的核心裁决错误(`docs/adjudicate-precondition-blindspot-findings-2026-08-29.md`),这次只是打了个补丁,根源没动。
  - `seedWorld` 现在是顺序上传创世事实,改并行能把上传阶段从约 9 秒压缩到 1 秒左右,索引总时长不受影响,是个可选的小优化。
  - worldId 目前没有任何鉴权,知道 URL 就能访问/重置任何世界——重新公开部署之前,如果要给多人用,这个要补上。
  - 同一世界的并发写入没有加锁保护(评估过,当时判断单人独占场景下不值得做)。

## 这条实验线的整体结论(给完全没有上下文、将来重启这个项目的人看)

这个项目原来的方向是类型化 schema(`ActionProposal`)运行时,两轮人类盲测失败后,`experiment/semantic-intent-spike` 这条分支验证了改用自然语言命题(不是不结构化,是"结构但非形式化")的方向可行,而且已经用真实部署、真实模型调用、真人测试反复验证过,不再是假设——已经在 2026-08-29 正式取代了老运行时,`main` 上再没有类型化 schema 的痕迹了。重启这个项目,应该继续往下做,不是回头质疑这个方向本身。
