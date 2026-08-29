# Secondary External Reality 2

一个以文字体验持续虚拟现实世界的早期 Demo。核心命题：自然语言只能提出意图，不能直接写入现实——确定性协议负责实体绑定、世界结算、提交、感知投影和呈现，模型只提议、不决定。

**整个项目没有独立的"生产"层，全部是 demo 和实验。** 早期基于类型化 schema（`ActionProposal`/`EntitySchema`）的运行时（原 `src/`）已于 2026-08-29 正式退役——`experiments/` 里积累的真实验证（包括两个真实部署到 Cloudflare 的 Worker）证明了自然语言命题式的架构方向可以整体替代它，而不是作为附属层并存。现在 `experiments/` 就是唯一的代码。

## 现状

真相以自然语言命题的形式存放（namespace → 实体名字 → 按 Height 排序的平铺命题列表），不是类型化 schema。一次玩家输入的结算走一条固定流水线：

```
GROUND（绑定提到的实体，绑不上的直接给边界）
→ RETRIEVE（语义检索真相文档库，不是精确匹配）
→ ADJUDICATE（自然语言裁决可信不可信）
→ 对裁决本身做可达性审计
→ CLASSIFY（可信 / 不可信 / 信息不足）
→ 需要时走 Collapse（编剧提出补全 → 三个判官+书记员校验 → 放行才提交）
→ COMMIT（写成干净的已结算命题）
→ NARRATE + 审计（同一套抽取断言→核查可达性→按需 Collapse 的机制）
```

细节和架构决策记录见 `docs/architecture-direction-consensus-2026-08-28.md`，各角色的独立验证见 `docs/*-findings-*.md`。

## 运行

需要 Node.js 22 或更高版本（`.nvmrc` 固定版本）。没有构建步骤，每个实验都是直接用 `node` 跑的 `.mjs`：

```bash
nvm use
node experiments/pipeline-integration-slice/run.mjs          # 本地内存真相库，5 轮场景
node experiments/pipeline-integration-slice/run-ai-search.mjs  # 接真实 AI Search 实例
```

真实调用只允许用 Cloudflare 自托管的模型（Workers AI 上 `@cf/...` 命名空间下的模型），不允许第三方 API、不允许自己另外托管的模型。具体哪个角色用哪个模型是经过真实 A/B 测试后的选择，不是运行时的降级/fallback——现在所有角色跑的都是 `@cf/qwen/qwen3.8-27b`。把 API token 放在被 Git 忽略的 `secret/cftoken.txt`。

## 真实部署

两个 Worker 已经部署在 Cloudflare 上，不是本地模拟：

- `sr2-juror-worker`（`experiments/juror-worker-deploy/`）——只跑判官+书记员，用来验证并发请求不会被排队。
- `sr2-pipeline-worker`（`experiments/pipeline-worker-deploy/`）——完整流水线，`POST /seed` 播种、`POST /attempt {attempt}` 跑一轮结算。

两者都是无状态 Worker 直接调用 Workers AI，**不是** Durable Object 支撑的 Cloudflare Agents SDK——理由见 `docs/architecture-direction-consensus-2026-08-28.md` 第 12 节。

## 目录

- `experiments/` —— 当前唯一的代码。每个子目录是一个独立验证过的角色或集成切片，各自的 `results/` 存真实调用产出，`README`/文件头注释说明范围。
- `docs/` —— 架构决策记录、各实验的 findings、以及最高权重的原始设计对话（`这是一个已分享的 ChatGPT 聊天副本.txt`、`fc1.txt`、`fc2.txt`）。看 `CLAUDE.md` 的"Document priority"了解权重顺序。
