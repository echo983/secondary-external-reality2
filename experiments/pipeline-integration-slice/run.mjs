import {mkdir, writeFile} from "node:fs/promises";
import {createStore} from "./world.mjs";
import {processAttempt} from "./pipeline.mjs";

// Exercises every branch at least once, plus one integration-only check no isolated
// spike could do: does turn 3 actually retrieve the fact turn 2 committed.
const attempts = [
  "看看毛毯摸起来怎么样。",                         // direct retrieve+adjudicate+narrate, no collapse expected
  "量一下门缝到底有多宽。",                          // direct measurement question, no qualitative escape hatch -- should force COLLAPSE
  "把毛毯拿起来，塞到门缝下面。",                    // blanket thickness still never established -> may also trigger COLLAPSE
  "再检查一下毛毯现在的样子。",                      // should retrieve the facts committed in turns 2-3 -- loop-closure check
  "打开五斗柜，把里面的枪拿出来。"                    // 五斗柜 not in entity registry -> GROUND should reject before anything else runs
];

const store = createStore();
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

console.log("\n最终真相文档库状态：");
for (const p of store.all()) {
  console.log(`  [${p.status}] H${p.height} (${p.source}) ${p.text}`);
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), results, finalStore: store.all()};
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("\nWrote experiments/pipeline-integration-slice/results/latest.json");
