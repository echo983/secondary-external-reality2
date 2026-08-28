import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {requestActionProposal} from "../src/ai/action-proposal-model.js";
import {constitutePrimitiveAction} from "../src/protocol/primitive-action.js";
import {ProtocolError} from "../src/protocol/errors.js";
import {buildActionScene} from "../src/world/action-scene.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";

const token = (await readFile(resolve("secret/cftoken.txt"), "utf8")).trim();
const fixture = createDemoFixture();
const scene = buildActionScene(fixture.genesis, fixture, "self");
const allInputs = ["松开毛毯", "大声喊“有人吗”", "再次拿起毛毯然后放到床上", "把毛毯塞到门缝下面"] as const;
const inputs: readonly string[] = process.argv.includes("--release-only") ? allInputs.slice(0, 1)
  : process.argv.includes("--occlusion-only") ? allInputs.slice(3) : allInputs;
const results: Record<string, unknown>[] = [];
for (const input of inputs) {
  const model = new CloudflareQwenModel({accountId: "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token});
  try {
    const proposal = await requestActionProposal(model, input, 0, scene.context);
    const constituted = constitutePrimitiveAction(proposal, "self", scene.context.slots, scene.entityBySlot);
    results.push({input, status: "constituted", kind: proposal.kind, primitives: proposal.primitives,
      operations: constituted.clauses.map(clause => ({operation: clause.operation, modifiers: clause.modifiers})), telemetry: model.telemetry()});
  } catch (cause) {
    const error = cause instanceof ProtocolError ? cause : new ProtocolError("INTERNAL_INVARIANT", "targeted eval failed", {cause});
    results.push({input, status: "rejected", code: error.code, message: error.message, telemetry: model.telemetry()});
  }
}
process.stdout.write(`${JSON.stringify({model: "@cf/qwen/qwen3.8-27b", results}, null, 2)}\n`);
