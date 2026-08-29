# 多世界网页入口实现与验证 2026-08-29

目的:把"内部使用、一人一个世界"这个需求接进 `sr2-pipeline-worker`,并给它加一个网页入口——整条链路(页面+API+模型+真相文档库)完全跑在 Cloudflare 上,本地不再有任何运行时环节。基于 `docs/ai-search-folder-filtering-findings-2026-08-29.md` 确认的 folder 过滤机制。

代码:`experiments/pipeline-worker-deploy/src/index.mjs`(路由、隔离逻辑)、`src/page.mjs`(网页,单文件内联 HTML/CSS/JS,同源调用同一个 Worker 的接口)。路由从 `/seed`、`/attempt` 改成 `/w/<worldId>/seed`、`/w/<worldId>/attempt`、`/w/<worldId>/state`、`GET /w/<worldId>`(网页)。

## 实现过程中发现的一个真实 bug,不是设计问题

按 `docs/ai-search-folder-filtering-findings-2026-08-29.md` 的结论,最初把 key 结构设计成 `worlds/<worldId>/props/<entity>/h<height>-...txt`(世界 ID 在最外层、实体名再往里一层)。部署后用两个真实世界(`edwin`、`tester2`)测试,检索完全找不到刚播种的创世事实——`RETRIEVE` 返回空数组。

排查发现:folder 过滤那次验证用的测试条目路径只有一层(`test-world-alpha/note.txt`),而这次实际用的 key 有两层嵌套(`worlds/edwin/props/blanket-1/...`)。直接对比测试证实:**`folder` 元数据的过滤是对 key 最后一段之前的完整目录路径做精确匹配,不是对祖先目录做前缀匹配**——用 `filters: {folder: "worlds/edwin/"}` 去匹配一个实际 folder 值是 `worlds/edwin/props/blanket-1/` 的条目,不会命中,即使后者确实以前者开头。

修复:把 key 结构拍平成每个世界一层目录——`worlds/<worldId>/<entity>-h<height>-<source>-<timestamp>.txt`,实体名从目录段挪进文件名里。这样一个世界的所有条目的 `folder` 值都精确等于 `worlds/<worldId>/`,过滤才对得上。同时 `HEIGHT_TAG` 的正则也要跟着从 `/h(\d+)-/`(期待前面有斜杠)改成 `-h(\d+)-/`(前面是连字符)。

**这条值得记下来,因为它推翻了"folder 过滤能当前缀用"这个不假思索的假设**——即使是刚刚验证过"folder 过滤本身有效"的同一天,换一种目录嵌套方式就能踩到坑。以后任何用 key 路径做隔离的设计,都要先确认清楚过滤到底是精确匹配还是前缀匹配,不能想当然。

## 第二个真实 bug:索引就绪状态被 `/state` 端点漏掉了

第一次修完 key 结构重新部署后,又跑了一次真实调用测试,这次 `RETRIEVE` 还是偶尔返回空——直接查条目状态发现,播种后 `itemCount` 已经达到预期数量,但里面有条目状态还是 `running`(没索引完)。`/state` 端点最初只报 `itemCount`,不报索引状态,导致调用方(测试脚本、以及网页本身)只要看到数量对了就以为世界"就绪",实际上索引还没做完,检索自然落空。

修复:`/state` 增加 `pendingCount`(状态既不是 `completed` 也不是 `error` 的条目数),`initialized` 改成要求 `pendingCount === 0` 才算真正就绪。网页播种后不再只查一次状态,而是轮询直到 `pendingCount` 归零,期间显示"世界正在建立索引中(X/Y 条未完成)"。真实测试里,两个世界各 7 条创世事实,从播种到完全索引完成大约花了 85-90 秒——不是瞬间的事,页面必须把这个等待过程显式地展示出来,不能假设播种一返回就能开始玩。

## 隔离验证:两个世界互不泄漏，包括运行时新提交的事实

`edwin` 世界跑了一次"看看毛毯摸起来怎么样"，ADJUDICATE 给出可信、NARRATE 生成了对应反馈，并把结果提交（`itemCount` 从 7 变成 8）。紧接着在 `tester2` 世界跑同一句话，`RETRIEVE` 只看到两条创世事实（毛毯柔软可压缩、放在床上），**没有看到 edwin 世界那条刚提交的新事实**，而且因为 tester2 世界里"自己"还没真的碰过毛毯，ADJUDICATE 正确给出了"信息不足"（眼睛看不出"摸起来"是什么感觉）——两个世界的裁决结果都对，而且互不影响，不是靠巧合两次都一样才看起来像是隔离对了。

## 现状

`sr2-pipeline-worker` 现在支持任意数量的世界，代码层面零额外成本——一个新的 `worldId` 字符串就是一个新世界，不需要建实例、不需要管理步骤。网页在 `GET /w/<worldId>` 直接可用（初始化/重置按钮、连续对话、加载态）。当前已经用真实调用验证过的世界：`edwin`、`tester2`（测试用，可以随时重置或换别的 worldId）。

未做、留给以后：worldId 目前没有任何鉴权，知道 URL 就能访问和重置任何人的世界——内部使用、人数很少的场景下可以接受，真要多人独立使用还需要加一层简单的访问控制（比如给每个人一个不公开的 worldId，或者更正式的鉴权），这次没做。
