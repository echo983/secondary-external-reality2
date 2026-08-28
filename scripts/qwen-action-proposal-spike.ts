import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {requestActionProposal} from "../src/ai/action-proposal-model.js";
import type {ActionContext} from "../src/protocol/action-proposal.js";
import {ProtocolError} from "../src/protocol/errors.js";

const accountId = "00f6c85f82f6297c8c0bef9460e013d9";
const token = (await readFile(resolve("secret/cftoken.txt"), "utf8")).trim();
const context: ActionContext = {
  actorSlot: "actor",
  slots: [
    {slot: "actor", kind: "actor", label: "你", perceivable: true,
      affordances: ["perceive", "orient", "move", "contact", "apply_force", "hold", "communicate"]},
    {slot: "room", kind: "space", label: "卧室", perceivable: true, affordances: ["contains"]},
    {slot: "door", kind: "object", label: "门/门缝", perceivable: true,
      affordances: ["contact", "apply_force", "openable", "occludes"]},
    {slot: "blanket", kind: "object", label: "毛毯", perceivable: true,
      affordances: ["hold", "move", "deformable"]}
  ],
  allowedRelations: ["open", "held_by", "placed_at", "occludes"]
};

const fullCases = [
  "看看四周",
  "听听门外",
  "用手推门",
  "用肩膀抵着门向前挤",
  "趴下来从门缝往外看",
  "把毛毯卷起来塞到门缝下面",
  "抽屉里一定有枪，我把枪拿出来"
] as const;
const inputs = process.argv.includes("--smoke") ? fullCases.slice(0, 3) : fullCases;
const results: Record<string, unknown>[] = [];

for (const input of inputs) {
  const model = new CloudflareQwenModel({accountId, apiToken: token});
  try {
    const proposal = await requestActionProposal(model, input, 0, context);
    results.push({input, status: "accepted", primitives: proposal.primitives,
      targetSlots: proposal.targetSlots, effects: proposal.effects.map(item => item.kind),
      scopes: proposal.perceptionScopes.map(item => ({modality: item.modality, horizon: item.horizon, targets: item.targetSlots})),
      unresolved: proposal.unresolvedDependencies.map(item => item.kind), telemetry: model.telemetry()});
  } catch (cause) {
    const error = cause instanceof ProtocolError ? cause : new ProtocolError("INTERNAL_INVARIANT", "spike failed", {cause});
    results.push({input, status: "rejected", code: error.code, message: error.message, telemetry: model.telemetry()});
  }
}

const accepted = results.filter(item => item.status === "accepted").length;
process.stdout.write(`${JSON.stringify({model: "@cf/qwen/qwen3.8-27b", accepted, total: results.length, results}, null, 2)}\n`);
