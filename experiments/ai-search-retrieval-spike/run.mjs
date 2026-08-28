import {mkdir, writeFile} from "node:fs/promises";
import {uploadItem, deleteAllItems, waitUntilIndexed, search} from "./client.mjs";
import {propositions, queries} from "./corpus.mjs";

async function uploadModeA() {
  // One proposition per file: key = expA/{primaryEntity}/h{height}-{index}.txt
  let count = 0;
  for (const [index, p] of propositions.entries()) {
    const key = `expA/${p.entities[0]}/h${p.height}-${index}.txt`;
    await uploadItem(key, p.text);
    count += 1;
  }
  return count;
}

async function uploadModeB() {
  // One file per Height batch: key = expB/h{height}.txt, all propositions at that
  // height joined one-per-line (same format the truth store itself uses).
  const byHeight = new Map();
  for (const p of propositions) {
    if (!byHeight.has(p.height)) byHeight.set(p.height, []);
    byHeight.get(p.height).push(p.text);
  }
  let count = 0;
  for (const [height, texts] of byHeight.entries()) {
    const key = `expB/h${height}.txt`;
    await uploadItem(key, texts.join("\n"));
    count += 1;
  }
  return count;
}

async function runQueries(mode) {
  const results = [];
  for (const q of queries) {
    const chunks = await search(q.query);
    const hitIndex = chunks.findIndex(c => c.text.includes(q.expectSubstring));
    results.push({
      id: q.id, query: q.query, expectSubstring: q.expectSubstring, note: q.note ?? "",
      hit: hitIndex !== -1, rank: hitIndex === -1 ? null : hitIndex + 1,
      topScore: chunks[0]?.score ?? null,
      returnedTexts: chunks.map(c => ({text: c.text, score: c.score, key: c.item?.key}))
    });
    console.log(`  [${mode}] ${q.id}: ${hitIndex === -1 ? "MISS" : `hit @rank ${hitIndex + 1}`}`);
  }
  return results;
}

console.log("=== Mode A: 一条命题一个文件 ===");
console.log("清空实例...");
await deleteAllItems();
console.log("上传...");
const countA = await uploadModeA();
console.log(`上传了 ${countA} 个文件，等待索引完成...`);
const itemsA = await waitUntilIndexed(countA);
console.log(`索引状态：${itemsA.filter(i => i.status === "completed").length}/${itemsA.length} completed`);
const resultsA = await runQueries("A");

console.log("\n=== Mode B: 一个 Height 批次一个文件 ===");
console.log("清空实例...");
await deleteAllItems();
console.log("上传...");
const countB = await uploadModeB();
console.log(`上传了 ${countB} 个文件，等待索引完成...`);
const itemsB = await waitUntilIndexed(countB);
console.log(`索引状态：${itemsB.filter(i => i.status === "completed").length}/${itemsB.length} completed`);
const resultsB = await runQueries("B");

console.log("\n=== 对比 ===");
for (const q of queries) {
  const a = resultsA.find(r => r.id === q.id);
  const b = resultsB.find(r => r.id === q.id);
  console.log(`  ${q.id}: A=${a.hit ? `hit@${a.rank}` : "MISS"}  B=${b.hit ? `hit@${b.rank}` : "MISS"}`);
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {
  generatedAt: new Date().toISOString(),
  corpusSize: propositions.length, filesA: countA, filesB: countB,
  resultsA, resultsB
};
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("\nWrote experiments/ai-search-retrieval-spike/results/latest.json");
