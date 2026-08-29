# 真人盲测抓到的真相文档库自相矛盾:根因是索引延迟竞态 2026-08-29

edwin 第一次真人自由测试(不按脚本剧本走)就抓到一个真实的核心正确性 bug——这正是这条架构线最初立项要解决的问题("两轮人类盲测失败"),验证了让真人测试尽早介入是对的。

## 真人测出来的现象

在 `edwin` 这个世界里连续两次尝试后,真相文档库里出现了这个:

```
H5  self 站在 bed-1 旁边。
H6  self 不在 bed-1 旁边。
```

两条直接矛盾,而且都是陪审团真实放行、真实提交的 Collapse 事实。这不是叙述层面编瞎话——是**真相文档库自己存了自相矛盾的东西**,`COLLAPSE_PROPOSAL_RULES` 里"不能与任何已知命题矛盾"这条硬性规则被绕过了。

## 排查:没能强制复现,但代码里能精确定位到根因

同一句输入("拿起毛毯，铺在地上")在新世界里重跑一次没有复现——这类问题本来就依赖真实的索引延迟时机,不是每次都会撞上,强行多跑几次去凑巧复现不划算。改成直接读代码,顺着"最终结果是 insufficient"这条线索往回查:

`processAttempt` 里,CLASSIFY 结果是 `insufficient` 时会触发一次 Collapse;如果这次 Collapse 提交成功,原代码是这样处理后续检索的:

```js
if (outcome.committed) {
  propositions = await retrieve(env, worldId, groundResult.entities, attempt);  // 问题在这里
  ...
}
```

**这一步是"提交之后立刻重新检索"**——代码注释里写得很直白："Deliberately not awaiting indexing latency here -- this immediate re-retrieve is exactly what tests whether a just-committed fact is searchable in time"。这是个已知的、故意做的赌注:赌 AI Search 的索引能跟得上。这次真人测试证明这个赌注会输——如果索引还没跟上,这次重新检索会**悄悄漏掉刚提交的那条事实**,而代码完全不知道漏掉了,继续往下走。

漏掉的这份 `propositions` 会一路传给后面的 NARRATE 审计(`resolveDraftAudit`)。如果 NARRATE 的草稿里又触发了一次新的 Collapse,这次 Collapse 的编剧和陪审团看到的命题列表里根本没有刚才那条——它们不是"没看出矛盾",是**压根不知道那条命题存在**,自然不会拒绝一个跟它矛盾的新提案。

## 修复:不重新查库,直接用手里已经知道的东西

这个修复不是给检索加等待、加重试这种"堵漏洞"式的补丁,而是**发现这一步的检索本来就是多余的**——同一段代码里,`groundVerdict`/`resolveDraftAudit` 自己的 Collapse 循环从来不会有这个问题,因为它们提交之后不重新查库,是直接把刚提交的记录 `[...workingPropositions, outcome.committedRecord]` 拼进内存里的列表——这条数据反正是我们自己刚写的,没有必要冒着索引延迟的风险再问一遍库。

`insufficient` 分支这里唯一没跟上这个模式,现在改成一致的写法:

```js
propositions = [...propositions, outcome.committedRecord];
```

不再有重新检索、不再有索引延迟的窗口——这个具体环节不再依赖 AI Search 什么时候把这条索引完,因为压根不需要问它。

## 验证

修复部署后跑了一遍完整 5 轮场景(新世界 `fixverify1`),全程无错误,查真相文档库里全部 15 条记录,前后逻辑自洽,没有发现类似矛盾(门缝宽度→毛毯压缩厚度→塞入状态→后续检查,一路呼应)。没能强制复现原始那个具体的矛盾场景来做逐字对照验证,但根因定位精确(代码里注释本身就承认了这是个故意冒险的赌注,这次真实输了),修复方式和代码里已经验证过的安全模式完全一致,不是猜的。
