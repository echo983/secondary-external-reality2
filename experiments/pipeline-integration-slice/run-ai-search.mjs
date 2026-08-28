import {mkdir, writeFile} from "node:fs/promises";
import {createAiSearchStore} from "./ai-search-store.mjs";
import {genesisPropositions} from "./world.mjs";
import {processAttempt} from "./pipeline.mjs";

// Same 5-turn scenario as run.mjs (in-memory store), now against the real
// sr2-truth-store AI Search instance -- this is the actual integration test: two
// independently-validated pieces (the LLM-facing pipeline logic, and AI Search
// retrieval mechanics) wired together for the first time. Watch especially for: (1)
// whether a just-COLLAPSE-committed fact is retrievable in the immediate next
// RETRIEVE_AFTER_COLLAPSE within the same Attempt (indexing latency risk, not
// artificially waited around); (2) whether real semantic search changes what
// ADJUDICATE/NARRATE see compared to the in-memory exact-entity-match version.
const attempts = [
  "看看毛毯摸起来怎么样。",
  "量一下门缝到底有多宽。",
  "把毛毯拿起来，塞到门缝下面。",
  "再检查一下毛毯现在的样子。",
  "打开五斗柜，把里面的枪拿出来。"
];

console.log("清空实例并写入创世事实...");
const store = await createAiSearchStore();
await store.seedGenesis(genesisPropositions);
console.log(`创世事实写入并索引完成（${genesisPropositions.length} 条）。\n`);

const results = [];

for (const [index, attempt] of attempts.entries()) {
  console.log(`\n[${index + 1}/${attempts.length}] ${attempt}`);
  try {
    const result = await processAttempt(store, attempt);
    for (const stage of result.stages) {
      console.log(`  ${stage.stage}:`, JSON.stringify(stage.output ?? stage.text ?? ""));
    }
    console.log(`  => H${result.height} [${result.kind}] 反馈: ${result.narration}`);
    results.push(result);
  } catch (error) {
    console.log("  ERROR:", String(error));
    results.push({attempt, error: String(error)});
  }
}

console.log("\n最终写入记录（本地镜像，仅供参考，真实权威在 AI Search 里）：");
for (const p of store.all()) {
  console.log(`  H${p.height} (${p.source}) ${p.text}  [${p.key}]`);
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), results, writeLog: store.all()};
await writeFile(new URL("./results/ai-search-run.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("\nWrote experiments/pipeline-integration-slice/results/ai-search-run.json");
