# Qwen Workers AI 边界探测

目的：在冻结世界宪法和运行时协议前，测量 `@cf/qwen/qwen3.8-27b` 在四类有限职责上的真实表现。

## 实验组

1. `observation`：感知、观察、隐藏事实和主体推断的分离；
2. `attempt`：输入类型、目标/方法和玩家夹带断言的分离；
3. `collapse`：只在阻断当前结算时提出最小约束；
4. `paraphrase`：相同意图的不同中文说法能否形成稳定结构。

固定条件：

- 模型仅使用 `@cf/qwen/qwen3.8-27b`；
- `temperature: 0`；
- 凭据只从 `secret/cftoken.txt` 读取；
- 请求和结果不包含凭据；
- 原始结果与机械评分分开保存；
- 机械通过不等于设计可接受，仍需人工审查。

## 运行

```bash
npm run eval:qwen:smoke
npm run eval:qwen:full
npm run eval:qwen:score
```

完整批次为 45 次真实模型调用，会消耗 Workers AI 配额。结果写入 `results/latest-*.json`。

## 评分边界

机械评分只检查：

- 是否为合法 JSON；
- 是否严格符合要求字段；
- 明确禁止内容是否泄漏到呈现；
- Attempt 是否错误地产生世界事实；
- Collapse 必要性和因果半径是否符合预标注；
- 释义组的物质结构是否稳定。

人工评审还需要判断：

- `withheld_inferences` 本身是否泄漏了不该提供给该职责的隐藏推理；
- Observation 是否夹带文学意义；
- `unsupported_claims` 是否忠实抽取而非接受玩家断言；
- Collapse 是否虽通过关键词检查却仍然过度补全；
- 方法、程度、顺序与感知范围是否在释义中保真。
