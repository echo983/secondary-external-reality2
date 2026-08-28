# 陪审团 prompt 重写 + 审计上移到 ADJUDICATE:用原始触发场景验证

日期:2026-08-28
分支:`experiment/ai-search-retrieval-spike`
触发:`docs/ai-search-pipeline-wiring-findings-2026-08-28.md` 两个发现的自然修法——不是打补丁,是把已经写好但没接对/没接全的机制归位。

## 改动

1. **`JUROR_SYSTEM_PROMPT` 重写。** 确认了这套流水线里陪审团从来只审 Collapse 提案,从没审过 Attempt 本身——原来的 prompt 是从 ADJUDICATE 那份原样复制、从没针对性重写过。新版直接用 `COLLAPSE_PROPOSAL_RULES`,问的问题从"这件事可信不可信、能不能发生"改成"这条补全命题能不能被接受",并且明确写清楚"还没被证实"不能单独构成拒绝理由。`CLERK_SYSTEM_PROMPT`/`buildJurorUserPrompt`/`buildClerkUserPrompt` 的措辞一并更新对齐,分类逻辑和否决规则本身没动。
2. **审计从"只查 NARRATE"扩展到"ADJUDICATE 和 NARRATE 都要过"。** 新增 `groundVerdict()`,复用已经验证过的 `extractClaims`/`checkReachable`,在 ADJUDICATE 产出裁决文本后立刻检查有没有断言未接地的具体内容,查到就走反应式 Collapse(现在用的是修好的陪审团)。抽出一个共用的 `resolveClaimViaCollapse()` 辅助函数,原来 CLASSIFY 触发的 Collapse 分支和 NARRATE 审计里的 Collapse 分支,现在都调用这同一个函数,不再各自重复一遍"提案→陪审团→提交"的逻辑。

## 用原来触发问题的那个场景直接验证

重跑同一个五轮场景,第二轮"量一下门缝到底有多宽"——**这次是最初发现问题的那个原始场景,不是另造的测试案例**:

- ADJUDICATE_GROUNDING 正确抓到了"door-1 关着时门与门框之间存在缝隙"这条隐含断言,送去 Collapse。
- 陪审团这次**正确放行**了"门缝宽约三毫米"这条提案——上一轮用旧 prompt 测的时候,一模一样性质的提案被三票全部以"信息不足,还没被证实"为由拒绝。
- 重新裁决后给出了真正完整、可信、有实际数值支撑的回答:"可信,三毫米的缝隙用塞尺或薄尺即可探入测量。"

**陪审团这次也展示了它不是在无脑放行一切。** 同一轮里,NARRATE 草稿又多编了两条更离谱的细节("薄尺的宽度和缝隙宽度大致相等""薄尺上留下了压痕")——这两条都被陪审团**正确拒绝**了,理由是超出了最小补全范围、编造了没有依据的工具细节,最终叙事相应地退回到更克制的描述。这说明修好的陪审团确实在按"是否矛盾、是否最小充分"这条正确判据做真实判断,不是从"什么都拒绝"变成"什么都接受"。

## 结论

两处修复都用原始触发场景验证成立,不是新造案例侥幸测过。同时观察到两个已知的、这次没打算深挖的残留问题:CLASSIFY 偶尔还是会在 Collapse 已经补全信息之后依然标"insufficient"(第一轮的软硬度+凉度案例);调用链更深之后,token 预算报错更容易复现(第三轮又因为 `finish_reason=length` 中断)——这两个都是之前已经记录过的已知问题的延续,不是这次改动引入的新问题。

## 原始数据

`experiments/pipeline-integration-slice/results/latest.json`,五轮完整分阶段日志,含新增的 `ADJUDICATE_GROUNDING`/`ADJUDICATE_AFTER_GROUNDING` 阶段输出。
