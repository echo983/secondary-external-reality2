# AI Search folder 过滤实测：多世界隔离不需要多实例 2026-08-29

起因：讨论"内部多人使用、一人一个世界"这个需求时，默认往"一人一个 AI Search 实例"这个方向设计，因为 `docs/ai-search-retrieval-spike-findings-2026-08-28.md` 里记着"自定义 metadata 和自动生成的 `folder` 字段过滤都没测出正确用法"。但那次只是在做主实验(A/B 检索质量对比)时顺手试了几种写法就放弃了，没有认真查过文档、没有穷尽尝试——回顾时把这条归类成"试了但没有全面研究"（不是"研究透了、结论扎实"），不该直接当结论用来决定要不要建一整套多实例路由。这次专门回去查证。

## 真正文档化的写法：`ai_search_options.retrieval.filters`，不是之前试的那几种

查 Cloudflare 官方文档（`developers.cloudflare.com/ai-search/configuration/metadata-filtering/`）确认：REST API 的 `/search` 用 **Vectorize 风格的 metadata 过滤**，正确的请求体形状是：

```json
{
  "query": "...",
  "ai_search_options": {
    "retrieval": {
      "filters": { "folder": "customer-a/" }
    }
  }
}
```

之前记录里"两种参数写法都没报错，但都没有真正生效"，大概率就是没有套上这层 `ai_search_options.retrieval` 的嵌套——`filters` 不是 `/search` 请求体的顶层字段。

文档还明确了一点，直接排除了之前担心的一个风险：**过滤发生在检索排序之前，不是先在全量语料里算完分数再事后筛结果**（"the filter narrows down results prior to retrieval, so that you only query the scope of documents that matter"）。这意味着别的世界的内容不会稀释/挤占当前世界的排序，是真正的检索范围收窄，不是过滤器。

## 真实测试，两个隔离世界互不泄漏

对 `sr2-truth-store`（现有实例，没有新建实例）上传两条内容几乎一样、只有关键事实不同的测试条目，分别放在不同"文件夹"路径下（`test-world-alpha/note.txt` vs `test-world-beta/note.txt`，Item 上传时的 `key` 就是文件夹路径，系统自动从中派生 `folder` 元数据，这一步本来就在用）：

- `test-world-alpha/note.txt`："在测试世界 ALPHA 里，独角兽的颜色是紫色的。"
- `test-world-beta/note.txt`："在测试世界 BETA 里，独角兽的颜色是绿色的。"

同一个查询"独角兽的颜色"：

- **不加过滤**：两条都返回，按相关性排在最前面，此外还混着这个实例里之前留下的其它内容（毛毯相关的旧数据）。
- **`filters: {"folder": "test-world-alpha/"}`**：只返回 alpha 那一条。
- **`filters: {"folder": "test-world-beta/"}`**：只返回 beta 那一条。

两边完全没有互相泄漏，结论清楚。测试用的两个条目已经删除，没有留在 `sr2-truth-store` 里。

## 连带观察：这次索引完成时间比之前记录的更不稳定

两个条目分别用了约 66 秒和（等到 2 分钟仍未完成，中止等待）才把状态从 `running` 变成 `completed`——比 session 里之前"创建时索引通常很快"的印象要慢，具体原因未知（可能是实例里条目变多、也可能是偶发）。这个不影响这次要验证的"过滤能不能隔离"的结论（过滤在两个条目都还没完全 completed 的中间状态下就已经正确工作了），但会影响以后"新建一个世界之后要等多久才能开始玩"的实际体验——新播种一个世界不能假设索引瞬间完成，需要真正轮询状态而不是固定等待，这一点在 `pipeline-worker-deploy` 的 `/seed` 端点目前还没做（现在 `/seed` 上传后立即返回，是调用方自己在轮询，如果以后播种也内嵌在网页流程里，这一步需要显式等待）。

## 结论：多世界隔离方案改为单实例 + folder 过滤，不做一人一实例

原计划"一人一个 AI Search 实例"被这次结果取代：**继续用现有的单一 `sr2-truth-store` 实例，世界之间用 key 路径前缀隔离（`worlds/<worldId>/props/<entity>/h<height>-...`），每一次 retrieve/append/list 都带上 `filters: {folder: "worlds/<worldId>/"}`。** 好处是新增一个世界不需要任何管理步骤（不需要建实例、不需要等实例配置生效），换一个 `worldId` 字符串就是一个新世界，比多实例方案轻得多。

## 已更正的历史记录

`docs/ai-search-retrieval-spike-findings-2026-08-28.md` 里"自定义 metadata 和 folder 过滤都没测出正确用法"这条记录已经过时，原文保留（历史记录不改写），但那份文档里加了一条指向本文档的更正说明。
