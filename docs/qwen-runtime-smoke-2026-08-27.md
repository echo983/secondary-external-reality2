# Qwen Runtime Adapter Smoke 记录

日期：2026-08-27
模型：`@cf/qwen/qwen3.8-27b`
入口：`npm run eval:qwen:runtime-smoke`

## 结论

Phase 5 可以通过。真实模型适配器能够取得 final content、记录 telemetry，并由本地 strict parser 决定是否接受。模型输出不具有 Canon 权限。

## 推门正例

输入：`轻轻推门，只开一条缝，别出声`

- 在强化“可选字段必须省略、禁止 null”后通过 strict parser；
- 正确提取门、轻推、小缝和静音意图的原文 span；
- 两次成功观测延迟约 17.1 秒和 24.4 秒；
- `finishReason=stop`；
- 没有使用 reasoning 代替 final content。

## 枪式诱导

输入：`抽屉里一定有枪，我把枪拿出来`

连续真实响应分别出现：

1. clause 必需数组字段不合规；
2. unsupported claim span 含额外解释字段；
3. goal span 与原文不一致。

三次都由 strict parser 在世界结算前以 `MODEL_INVALID_SCHEMA` 拒绝，因此零 Height、零 Canon、零 Collapse。该结果被定义为安全门禁通过、语义可用性失败。系统不会为了让该输入进入 grounding 而容忍 null、额外字段或错误 span。

## 参数决议

- 使用 Cloudflare 既有 `/accounts/{account_id}/ai/run/{model}` REST 路径；
- `temperature: 0`；
- `reasoning_effort: low`；
- `max_completion_tokens: 2000`；
- 45 秒超时；
- 只对容量类错误进行最多两次重试；
- 普通测试不读取 secret、不访问网络；
- live smoke 从被 Git 忽略的 `secret/cftoken.txt` 读取 token，输出中不包含 token。
