# 判官+书记员真实部署验证 2026-08-29

目的:把 `docs/architecture-direction-consensus-2026-08-28.md` 第 12 节的架构结论从纸面讨论变成一次真实验证——不用 Cloudflare Agents SDK(Durable Object 支撑),改用无状态 Cloudflare Worker 直接调用 Workers AI。这是整个项目第一次真正部署到云端(此前所有角色验证都是本地 Node 脚本直接打 REST API)。

代码:`experiments/juror-worker-deploy/`。判官+书记员的 prompt 和聚合逻辑原样从 `experiments/pipeline-integration-slice/prompts.mjs` 引入,不重写——这次只换传输层(Workers AI 原生绑定 `env.AI.run()`,而不是本地脚本的 REST fetch),不改逻辑。

部署地址:`https://sr2-juror-worker.edwin-abel-3.workers.dev`

## 验证一:普通 Worker 能不能直接调用 AI Search

`GET /search-test?q=...` 直接从 Worker 内部打 `sr2-truth-store` 实例的 `/search` REST 端点(和本地 `ai-search-retrieval-spike/client.mjs` 用的同一套端点),返回了真实检索结果。**确认:AI Search 不需要绑在 Agent 类上才能用,普通 Worker 直接调 REST 就行**,与查证 Cloudflare 文档时"AI Search 可以直接从 Cloudflare Workers 或 Agents SDK 调用"的说法一致。

## 验证二:并发请求会不会被排队(核心验证目标)

`test/concurrency-test.mjs` 同时向 `/juror` 发出 5 个并发请求,每个请求内部又是 3 个判官并行 + 1 个书记员调用。结果:

```
#0: workerReportedElapsedMs=37621ms
#1: workerReportedElapsedMs=30168ms
#2: workerReportedElapsedMs=68501ms
#3: workerReportedElapsedMs=39837ms
#4: workerReportedElapsedMs=32165ms

批次总耗时(墙钟):68901ms
单次平均耗时:41658ms
如果排队串行,5 次预期耗时:约 208292ms
批次总耗时是串行预期的 33%
```

**结论:没有被排队,5 个请求确实是并发处理的。** 这直接验证了架构讨论第 12 节的判断——如果用 Durable-Object 支撑的 Agent 类、且把某个角色做成全局共享的单一实例,同一身份的请求会被 DO 显式串行化;而普通无状态 Worker 没有这个身份寻址/排队约束,天然支持多个使用者同时调用不互相阻塞。

## 已知、非本次验证目标的问题

单次判官+书记员往返耗时 30-70 秒,这是本 session 从最开始就反复记录、还没根治的问题(`reasoning:{enable_thinking:false}` 不能真正阻止 Cloudflare 侧生成推理 token,拖慢每次调用)——不是这次部署引入的新问题,也不是这次要解决的问题,如实记录以免被误读成"部署后变慢了"。

## 现状

Worker 已部署并保持在线(`sr2-juror-worker`),可以直接用 `test/concurrency-test.mjs` 重跑验证。`CF_API_TOKEN` 作为 Worker secret 配置,没有硬编码进代码。这次验证只覆盖了判官+书记员一个角色;把其余角色(ADJUDICATE、编剧、NARRATE 等)迁移成同样的无状态 Worker 形态,以及把 AI Search 从"独立于此 Worker 手动配置"变成整条流水线共享的基础设施,是明确没做、留给后续的工作。
