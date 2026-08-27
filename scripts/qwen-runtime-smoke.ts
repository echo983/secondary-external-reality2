import {readFile} from "node:fs/promises";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {requestInputProposal} from "../src/ai/model-adapter.js";
import {screenGroundedPrefix} from "../src/protocol/grounding-gate.js";
import {ProtocolError} from "../src/protocol/errors.js";

const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();
if (token === "") throw new Error("secret/cftoken.txt is empty");
const model = new CloudflareQwenModel({accountId: "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token});
const inputs = process.argv.includes("--gun") ? ["抽屉里一定有枪，我把枪拿出来"]
  : ["轻轻推门，只开一条缝，别出声", "抽屉里一定有枪，我把枪拿出来"];
for (const input of inputs) {
  try {
    const proposal = await requestInputProposal(model, input);
    const grounding = input.includes("枪") ? screenGroundedPrefix(proposal, "self", []) : undefined;
    if (input.includes("枪") && grounding?.boundaryCode !== "TARGET_UNGROUNDED") {
      throw new Error("gun adversarial case did not reach TARGET_UNGROUNDED");
    }
    console.log(JSON.stringify({model: model.model, input, proposal, grounding, telemetry: model.lastTelemetry}, null, 2));
  } catch (error) {
    const safeGunBoundary = input.includes("枪") && error instanceof ProtocolError &&
      ["MODEL_INVALID_SCHEMA", "MODEL_NO_CONTENT", "TARGET_UNGROUNDED"].includes(error.code);
    console.error(JSON.stringify({model: model.model, input, error: error instanceof Error ? error.message : String(error),
      ...(safeGunBoundary ? {safeBoundary: error.code} : {}), telemetry: model.lastTelemetry}, null, 2));
    if (!safeGunBoundary) process.exitCode = 1;
  }
}
