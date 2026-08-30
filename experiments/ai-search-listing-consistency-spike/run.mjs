// Investigates a real anomaly hit live during human-testing debugging 2026-08-30
// (docs/ai-search-listing-consistency-findings-2026-08-30.md): repeated GET /items
// queries against the same instance, moments apart, returned different item counts
// for the same world folder -- once dropping from ~18 to 3 and self-correcting, once
// staying stuck at 1 (should have been 7) across three repeated queries before a
// clean reseed fixed it. Separately, one item sat in "running" status for 6+ hours
// without ever reaching "completed" or "error".
//
// This spike isolates the question in a dedicated, disposable test folder (not a real
// gameplay world) so results aren't confounded by concurrent real traffic: upload a
// batch of items (both sequential -- matching seedWorld's real pattern -- and
// parallel), then poll GET /items rapidly for a couple of minutes, logging the exact
// count and per-item status at every poll. Looks for: item count fluctuating instead
// of monotonically settling, any item's status regressing, or items that never leave
// "queued"/"running".

import {readFile, mkdir, writeFile} from "node:fs/promises";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const INSTANCE = "sr2-truth-store";
const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-search/instances/${INSTANCE}`;
const headers = {Authorization: `Bearer ${token}`};

const RUN_ID = Date.now().toString(36);
const FOLDER_SEQ = `listing-test-seq-${RUN_ID}`;
const FOLDER_PAR = `listing-test-par-${RUN_ID}`;
const N = 15;

async function uploadItem(key, text) {
  const form = new FormData();
  form.append("file", new Blob([text], {type: "text/plain"}), key);
  const res = await fetch(`${BASE}/items`, {method: "POST", headers, body: form});
  const body = await res.json();
  if (!body.success) throw new Error(`upload ${key} failed: ${JSON.stringify(body.errors)}`);
  return body.result;
}

async function listFolder(folder) {
  const res = await fetch(`${BASE}/items?per_page=50`, {headers});
  const body = await res.json();
  if (!body.success) throw new Error(`list failed: ${JSON.stringify(body.errors)}`);
  return body.result.filter(i => i.key?.startsWith(`worlds/${folder}/`));
}

async function deleteFolder(folder) {
  const items = await listFolder(folder);
  for (const item of items) {
    await fetch(`${BASE}/items/${item.id}`, {method: "DELETE", headers});
  }
  return items.length;
}

function summarize(items) {
  const byStatus = {};
  for (const i of items) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
  return {count: items.length, byStatus, keys: items.map(i => i.key.split("/").pop())};
}

async function pollAndLog(folder, label, durationMs, intervalMs, log) {
  const startedAt = Date.now();
  let prevCount = null;
  const seenCompletedKeys = new Set();
  const regressions = [];
  const fluctuations = [];
  for (;;) {
    const items = await listFolder(folder);
    const s = summarize(items);
    const elapsed = Date.now() - startedAt;
    log.push({label, elapsedMs: elapsed, ...s});
    console.log(`  [${label} +${(elapsed / 1000).toFixed(1)}s] count=${s.count} byStatus=${JSON.stringify(s.byStatus)}`);

    if (prevCount !== null && s.count < prevCount) {
      fluctuations.push({elapsedMs: elapsed, from: prevCount, to: s.count});
      console.log(`    !! COUNT DROPPED: ${prevCount} -> ${s.count}`);
    }
    prevCount = s.count;

    for (const i of items) {
      if (i.status === "completed") seenCompletedKeys.add(i.key);
      else if (seenCompletedKeys.has(i.key)) {
        regressions.push({elapsedMs: elapsed, key: i.key, statusNow: i.status});
        console.log(`    !! REGRESSION: ${i.key} was completed, now ${i.status}`);
      }
    }

    if (Date.now() - startedAt > durationMs) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return {fluctuations, regressions};
}

const log = [];
const report = {runId: RUN_ID, generatedAt: new Date().toISOString()};

console.log(`\n=== Sequential upload (matches seedWorld's real pattern): ${N} items into worlds/${FOLDER_SEQ}/ ===`);
const seqStartedAt = Date.now();
for (let i = 0; i < N; i++) {
  await uploadItem(`worlds/${FOLDER_SEQ}/item-${i}.txt`, `测试命题第 ${i} 条，用于排查列表接口一致性。`);
}
console.log(`  uploaded ${N} items sequentially in ${Date.now() - seqStartedAt}ms`);
const seqResult = await pollAndLog(FOLDER_SEQ, "seq", 120_000, 3_000, log);
report.sequential = {uploadMs: Date.now() - seqStartedAt, ...seqResult};

console.log(`\n=== Parallel upload: ${N} items into worlds/${FOLDER_PAR}/ ===`);
const parStartedAt = Date.now();
await Promise.all(Array.from({length: N}, (_, i) => uploadItem(`worlds/${FOLDER_PAR}/item-${i}.txt`, `测试命题第 ${i} 条，用于排查列表接口一致性（并行上传）。`)));
console.log(`  uploaded ${N} items in parallel in ${Date.now() - parStartedAt}ms`);
const parResult = await pollAndLog(FOLDER_PAR, "par", 120_000, 3_000, log);
report.parallel = {uploadMs: Date.now() - parStartedAt, ...parResult};

console.log("\n=== Cleanup ===");
const deletedSeq = await deleteFolder(FOLDER_SEQ);
const deletedPar = await deleteFolder(FOLDER_PAR);
console.log(`  deleted ${deletedSeq} + ${deletedPar} test items`);

report.log = log;
await mkdir(new URL("./results/", import.meta.url), {recursive: true});
await writeFile(new URL("./results/latest.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);

console.log("\n=== Summary ===");
console.log("Sequential upload:", JSON.stringify({fluctuations: report.sequential.fluctuations.length, regressions: report.sequential.regressions.length}));
console.log("Parallel upload:", JSON.stringify({fluctuations: report.parallel.fluctuations.length, regressions: report.parallel.regressions.length}));
console.log("\nWrote experiments/ai-search-listing-consistency-spike/results/latest.json");
