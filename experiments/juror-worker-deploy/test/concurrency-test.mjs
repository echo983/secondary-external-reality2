// Empirical test for docs/architecture-direction-consensus-2026-08-28.md section 12's
// core claim: a plain stateless Worker does NOT serialize concurrent callers the way a
// Durable-Object-backed Agent instance would ("calls to one identity run one at a
// time"). Fires N /juror requests at the deployed Worker simultaneously and compares
// wall-clock total against what N sequential calls would cost -- if the Worker were
// secretly serializing, total time would scale ~linearly with N; if truly concurrent,
// total time should stay close to a single call's latency regardless of N.

const WORKER_URL = process.argv[2] ?? "https://sr2-juror-worker.edwin-abel-3.workers.dev";
const CONCURRENCY = Number(process.argv[3] ?? 5);

const payload = {
  propositions: [
    {text: "self 在卧室里，站着。", height: 0},
    {text: "door-1 现在是关着的，没有上锁。", height: 0},
    {text: "blanket-1 摸起来柔软，可以压缩。", height: 0}
  ],
  proposedFact: "door-1 的门缝宽度大约是一厘米。"
};

async function callOnce(index) {
  const startedAt = Date.now();
  const response = await fetch(`${WORKER_URL}/juror`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return {
    index,
    ok: response.ok,
    clientElapsedMs: Date.now() - startedAt,
    workerReportedElapsedMs: body.totalElapsedMs,
    handledAt: body.handledAt
  };
}

console.log(`Firing ${CONCURRENCY} concurrent /juror requests at ${WORKER_URL} ...`);
const batchStartedAt = Date.now();
const results = await Promise.all(Array.from({length: CONCURRENCY}, (_, i) => callOnce(i)));
const batchElapsedMs = Date.now() - batchStartedAt;

for (const r of results) {
  console.log(`  #${r.index}: ok=${r.ok} clientElapsedMs=${r.clientElapsedMs} workerReportedElapsedMs=${r.workerReportedElapsedMs} handledAt=${r.handledAt}`);
}

const avgSingleCallMs = results.reduce((sum, r) => sum + r.workerReportedElapsedMs, 0) / results.length;
const serialEstimateMs = avgSingleCallMs * CONCURRENCY;

console.log(`\nBatch wall-clock total: ${batchElapsedMs}ms`);
console.log(`Average single-call worker-reported time: ${Math.round(avgSingleCallMs)}ms`);
console.log(`If serialized (queued), ${CONCURRENCY} calls would cost roughly: ${Math.round(serialEstimateMs)}ms`);
console.log(`Batch total is ${(batchElapsedMs / serialEstimateMs * 100).toFixed(0)}% of the serial estimate ${batchElapsedMs < serialEstimateMs * 0.6 ? "-- NOT serialized, requests ran concurrently." : "-- looks close to serial, investigate."}`);
