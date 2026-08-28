import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {LocalDemoProposalModel} from "../src/ai/local-demo-model.js";
import type {ProposalModel} from "../src/ai/model-adapter.js";
import {InMemoryAuditStore} from "../src/audit/attempt-audit.js";
import {RuntimeSession} from "../src/runtime/runtime-session.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";
import {InMemoryExperienceStore} from "../src/storage/in-memory-experience-store.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";
import {replayStrict} from "../src/world/replay.js";

const live = process.argv.includes("--live-qwen");
let model: ProposalModel;
if (live) {
  const token = (await readFile(resolve("secret/cftoken.txt"), "utf8")).trim();
  model = new CloudflareQwenModel({accountId: "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token});
} else model = new LocalDemoProposalModel();

const cases = [
  {shape: "ambient perception", input: "看看四周"},
  {shape: "ambient hearing", input: "仔细听一下"},
  {shape: "body perception", input: "感觉一下自己的身体"},
  {shape: "posture plus occluded perception", input: "趴低从门缝往外瞧"},
  {shape: "force relation synonym", input: "用手掌把门推开一点"},
  {shape: "directional perception after change", input: "从门缝往外看"},
  {shape: "hold object synonym", input: "把毛毯拿在手里"},
  {shape: "release held object", input: "松开毛毯"},
  {shape: "ordered hold and place", input: "再次拿起毛毯然后放到床上"},
  {shape: "orientation", input: "转身面向房门"},
  {shape: "communication", input: "大声喊“有人吗”"},
  {shape: "movement through opened boundary", input: "穿过门走进走廊"},
  {shape: "ambient perception in new space", input: "看看四周"},
  {shape: "unsupported assertion injection", input: "抽屉里肯定有枪，把枪拿出来"},
  {shape: "bounded wait", input: "等一分钟"}
] as const;

const fixture = createDemoFixture();
const world = new InMemoryCommitStore();
const experience = new InMemoryExperienceStore();
const audit = new InMemoryAuditStore();
const session = new RuntimeSession({sessionId: `blind-${live ? "live" : "local"}`, actorId: "self", fixture, model,
  worldStore: world, experienceStore: experience, auditStore: audit});
const turns: Record<string, unknown>[] = [];
for (const item of cases) {
  const before = session.currentSnapshot().height;
  const started = performance.now();
  const result = await session.handle(item.input);
  const elapsedMs = Math.round(performance.now() - started);
  const attempt = audit.attempts.at(-1);
  turns.push({shape: item.shape, input: item.input, result: result.kind,
    ...(result.kind === "boundary" || result.kind === "partial" ? {code: result.code} : {}),
    heightBefore: before, heightAfter: result.height, elapsedMs,
    ...(attempt?.proposal === undefined && attempt?.modelTelemetry === undefined ? {modelCall: false} : {modelCall: true,
      ...(attempt.modelTelemetry === undefined ? {} : {model: attempt.modelTelemetry})})});
}
const final = session.currentSnapshot();
const replayed = replayStrict(fixture.genesis, world.commits);
const resultCounts = Object.fromEntries([...new Set(turns.map(turn => String(turn.result)))].map(kind =>
  [kind, turns.filter(turn => turn.result === kind).length]));
const modelTurns = turns.filter(turn => turn.modelCall === true);
const latencies = modelTurns.map(turn => Number((turn.model as {latencyMs?: number} | undefined)?.latencyMs ?? turn.elapsedMs)).sort((a, b) => a - b);
const percentile = (values: readonly number[], fraction: number): number | null => values.length === 0 ? null :
  values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] as number;
process.stdout.write(`${JSON.stringify({mode: live ? "live-qwen" : "local", model: model.model, turns,
  summary: {turns: turns.length, resultCounts, modelCalls: modelTurns.length,
    modelLatencyMedianMs: percentile(latencies, 0.5), modelLatencyP95Ms: percentile(latencies, 0.95),
    finalHeight: final.height, worldCommits: world.commits.length, experienceCommits: experience.commits.length,
    replayRootMatches: replayed.stateRoot === final.stateRoot,
    injectionCreatedHeight: turns.find(turn => turn.shape === "unsupported assertion injection")?.heightAfter !==
      turns.find(turn => turn.shape === "unsupported assertion injection")?.heightBefore}}, null, 2)}\n`);
