// Runs the same 5-turn scenario as pipeline-integration-slice/run-ai-search.mjs, but
// against the deployed sr2-pipeline-worker instead of a local Node process, now
// scoped to a specific world (see docs/ai-search-folder-filtering-findings-2026-08-29.md
// -- worlds share one AI Search instance, isolated by folder-prefixed keys).

import {mkdir, writeFile} from "node:fs/promises";

const WORKER_URL = process.argv[2] ?? "https://sr2-pipeline-worker.edwin-abel-3.workers.dev";
const WORLD_ID = process.argv[3] ?? "smoke-test";
const base = `${WORKER_URL}/w/${WORLD_ID}`;

const attempts = [
  "看看毛毯摸起来怎么样。",
  "量一下门缝到底有多宽。",
  "把毛毯拿起来，塞到门缝下面。",
  "再检查一下毛毯现在的样子。",
  "打开五斗柜，把里面的枪拿出来。"
];

console.log(`清空并重新播种 ${base} 的真相文档库...`);
const seedRes = await fetch(`${base}/seed`, {method: "POST"});
const seedBody = await seedRes.json();
console.log(`  已删除旧条目 ${seedBody.deletedPreviousItems} 个，写入创世事实 ${seedBody.seededCount} 条。`);

console.log("  轮询等待这个世界的条目数达到播种数量（真正等索引，不是固定等待）...");
const seedStartedAt = Date.now();
for (;;) {
  const state = await (await fetch(`${base}/state`)).json();
  if (state.itemCount >= seedBody.seededCount) { console.log(`  就绪，itemCount=${state.itemCount}`); break; }
  if (Date.now() - seedStartedAt > 180_000) { console.log(`  等待超时，itemCount=${state.itemCount}，继续往下跑`); break; }
  await new Promise(r => setTimeout(r, 5_000));
}

const results = [];
for (const [index, attempt] of attempts.entries()) {
  console.log(`\n[${index + 1}/${attempts.length}] ${attempt}`);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/attempt`, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({attempt})
    });
    const result = await res.json();
    if (result.error) {
      console.log(`  WORKER ERROR: ${result.error}`);
    }
    for (const stage of result.stages ?? []) {
      console.log(`  ${stage.stage}:`, JSON.stringify(stage.output ?? stage.text ?? "").slice(0, 200));
    }
    console.log(`  => H${result.height} [${result.kind}] 反馈: ${result.narration}`);
    console.log(`  (worker totalElapsedMs=${result.totalElapsedMs}, client elapsedMs=${Date.now() - startedAt})`);
    results.push(result);
  } catch (error) {
    console.log("  ERROR:", String(error));
    results.push({attempt, error: String(error)});
  }
}

await mkdir(new URL("../results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), workerUrl: WORKER_URL, worldId: WORLD_ID, results};
await writeFile(new URL("../results/full-pipeline-worker-run.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("\nWrote experiments/pipeline-worker-deploy/results/full-pipeline-worker-run.json");
