# Secondary External Reality 2

一个以文字体验持续虚拟现实世界的早期 Demo。当前版本证明：自然语言只能提出意图，确定性协议负责实体绑定、世界结算、提交、感知投影和呈现；模型不能直接写入现实。

## 运行

需要 Node.js 22 或更高版本，推荐使用仓库 `.nvmrc` 中固定的版本：

```bash
nvm use
npm install
npm test
npm run demo
```

`better-sqlite3` 使用 Node-API 构建。如果曾在旧提交或不同 Node 版本下安装依赖，升级后先执行一次 `npm install`。

`npm run demo` 默认使用本地确定性提案器和 `.world/demo-v3.sqlite`，不访问网络。当前可尝试：

```text
轻轻推门，只开一条缝，别出声
趴下来从门缝往外看
看看四周
拿起毛毯再放到床上
把毛毯拖到门边
把毛毯塞到门缝下面
转身面向门
穿过门去走廊
喊一声有人吗
门现在开着吗？
我等五分钟
抽屉里一定有枪，我把枪拿出来
```

输入 `/exit` 退出。再次运行会从 SQLite 中 strict replay，并在接受输入前修复已提交但尚未物化的 ExperienceCommit。

指定数据库：

```bash
npm run demo -- --db=/absolute/path/to/demo.sqlite
```

## 真实 Qwen 模式

唯一批准模型是 `@cf/qwen/qwen3.8-27b`。把 Cloudflare API token 放在被 Git 忽略的 `secret/cftoken.txt`，然后显式运行：

```bash
npm run demo -- --live-qwen
```

CLI 默认使用 `.world/demo-v3.sqlite`，保留旧数据库不覆盖。进入会话会先显示当前房间；环顾、聆听和身体感知使用有来源的本地快路径。

真实模型当前在普通 Demo 中只产生非权威 InputProposal。超时、reasoning-only、非法 JSON、额外字段和错误 source span 都会在世界提交前失败。实验性的 ActionProposal 门禁可单独运行：

```bash
npm run eval:qwen:action-spike
```

独立 smoke gate：

```bash
npm run eval:qwen:runtime-smoke
```

15 轮持续世界评测（默认本地；显式参数才访问真实 Qwen）：

```bash
npm run eval:free-session
npm run eval:free-session -- --live-qwen
```

普通 `npm test` 永远不读取 secret 或访问网络。

## 当前范围

- 同一世界中的卧室、门、床、毛毯、水壶和 World Time；
- 初始环境反馈，以及 ambient/hearing/body 感知快路径；
- 会结算姿态、时间和 Experience Acquisition 的主动定向观察；
- opaque 场景 slots、声明式 affordance 与单调用统一 ActionProposal；
- orient/move/hold/release/place/communicate 等通用原语和顺序组合提交；
- append-only World Commit 与独立 Experience Ledger；
- Observation → Evidence → Acquisition；
- SQLite 重启恢复、规范 SHA-256 state root；
- Query、None、模型故障和枪式诱导均不产生虚假 Height；
- 30 Height 混合会话与 100 Height replay 门禁。

当前仍是开发者纵向切片，不是通用游戏引擎。ActionProposal 已接入受 affordance 和当前事实约束的世界 Commit，但对象与空间规则仍小；NPC、关闭容器、纸条、完整空间移动和 Web UI 尚未实现。设计与后续计划见 [`docs/`](docs/)。
