// Single self-contained HTML page, served directly by this Worker at GET /w/<worldId>.
// No build step, no external assets -- plain inline CSS/JS, calling this same Worker's
// own /state, /seed, /attempt routes (same-origin, no CORS to worry about). Keeps the
// whole loop (page + API + model + truth store) on Cloudflare, nothing local.

export function renderPage(worldId) {
  const safeWorldId = worldId.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeWorldId} 的世界</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 640px; margin: 0 auto; padding: 12px; background: Canvas; color: CanvasText; }
  h1 { font-size: 16px; font-weight: 600; opacity: 0.7; }
  #log { display: flex; flex-direction: column; gap: 10px; margin-bottom: 90px; }
  .turn { display: flex; flex-direction: column; gap: 4px; }
  .attempt { align-self: flex-end; background: #2563eb; color: white; padding: 8px 12px; border-radius: 12px 12px 2px 12px; max-width: 85%; }
  .narration { align-self: flex-start; background: color-mix(in srgb, CanvasText 8%, Canvas); padding: 8px 12px; border-radius: 12px 12px 12px 2px; max-width: 85%; white-space: pre-wrap; }
  .narration.boundary { opacity: 0.6; font-style: italic; }
  .meta { font-size: 11px; opacity: 0.5; align-self: flex-start; }
  #composer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; padding: 12px; background: Canvas; border-top: 1px solid color-mix(in srgb, CanvasText 15%, transparent); max-width: 640px; margin: 0 auto; box-sizing: border-box; }
  #input { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); background: Canvas; color: CanvasText; font-size: 15px; }
  button { padding: 10px 16px; border-radius: 8px; border: none; background: #2563eb; color: white; font-size: 14px; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  #resetBtn { background: transparent; color: #b91c1c; border: 1px solid #b91c1c; padding: 4px 10px; font-size: 12px; }
  #status { font-size: 13px; opacity: 0.6; padding: 8px 0; }
  #initGate { text-align: center; padding: 60px 20px; }
  .narration.error { opacity: 0.7; border: 1px dashed #b91c1c; }
  #factsBtn { background: transparent; color: CanvasText; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); padding: 4px 10px; font-size: 12px; }
  #factsPanel { display: none; margin-bottom: 90px; font-size: 13px; }
  #factsPanel table { width: 100%; border-collapse: collapse; }
  #factsPanel th, #factsPanel td { text-align: left; padding: 4px 6px; border-bottom: 1px solid color-mix(in srgb, CanvasText 10%, transparent); vertical-align: top; }
  #factsPanel th { opacity: 0.6; font-weight: 500; }
  #factsPanel td.h { white-space: nowrap; opacity: 0.6; }
</style>
</head>
<body>
<h1>世界：${safeWorldId} <button id="factsBtn">世界记忆</button> <button id="resetBtn">重置世界</button></h1>
<div id="initGate" style="display:none;">
  <p>这个世界还没有初始化。</p>
  <button id="initBtn">初始化世界（写入创世事实）</button>
</div>
<div id="factsPanel"></div>
<div id="log"></div>
<div id="status"></div>
<div id="composer" style="display:none;">
  <input id="input" type="text" placeholder="输入你想做的事…" autocomplete="off">
  <button id="sendBtn">发送</button>
</div>
<script>
const worldId = ${JSON.stringify(worldId)};
const base = "/w/" + encodeURIComponent(worldId);
const log = document.getElementById("log");
const status = document.getElementById("status");
const composer = document.getElementById("composer");
const initGate = document.getElementById("initGate");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const initBtn = document.getElementById("initBtn");
const resetBtn = document.getElementById("resetBtn");
const factsBtn = document.getElementById("factsBtn");
const factsPanel = document.getElementById("factsPanel");

function addTurn(attempt, result) {
  const turn = document.createElement("div");
  turn.className = "turn";
  const a = document.createElement("div");
  a.className = "attempt";
  a.textContent = attempt;
  turn.appendChild(a);
  const n = document.createElement("div");
  // A raw pipeline error (result.error set, no narration) is not the same as an
  // in-world boundary rejection -- don't show the player a stack-trace-shaped string
  // as if it were world feedback, that breaks immersion for no reason and isn't
  // actionable to them anyway.
  const isError = result.narration === undefined && result.error !== undefined;
  n.className = "narration" + (result.kind === "boundary" ? " boundary" : "") + (isError ? " error" : "");
  n.textContent = isError ? "这次结算失败了（模型调用异常），你的输入没有生效，世界状态没有变化，可以直接重试。" : (result.narration ?? "(无反馈)");
  turn.appendChild(n);
  const m = document.createElement("div");
  m.className = "meta";
  m.textContent = isError
    ? "失败 · " + Math.round((result.totalElapsedMs ?? 0) / 1000) + "s"
    : "H" + (result.height ?? "?") + " · " + (result.kind ?? "?") + " · " + Math.round((result.totalElapsedMs ?? 0) / 1000) + "s";
  turn.appendChild(m);
  log.appendChild(turn);
  window.scrollTo(0, document.body.scrollHeight);
}

function escapeHtml(s) {
  const map = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"};
  return s.replace(/[&<>"]/g, c => map[c]);
}

let factsVisible = false;
async function toggleFacts() {
  factsVisible = !factsVisible;
  if (!factsVisible) { factsPanel.style.display = "none"; return; }
  factsPanel.style.display = "block";
  factsPanel.textContent = "加载中…";
  const res = await fetch(base + "/facts");
  const body = await res.json();
  if (body.error) { factsPanel.textContent = "加载失败：" + body.error; return; }
  const rows = body.facts.map(f =>
    "<tr><td class='h'>H" + (f.height ?? "?") + "</td><td>" + escapeHtml(f.text ?? ("(还未索引完成: " + f.status + ")")) + "</td></tr>"
  ).join("");
  factsPanel.innerHTML = "<table><tr><th>Height</th><th>命题</th></tr>" + rows + "</table>";
}
factsBtn.onclick = toggleFacts;

// itemCount alone doesn't mean the world is usable yet -- AI Search indexing takes
// anywhere from ~1s to 2+ minutes per item in practice, and an /attempt sent before
// indexing finishes gets an empty RETRIEVE (confirmed during testing). Poll until the
// backend reports pendingCount === 0, don't just check once.
async function waitUntilReady(onProgress) {
  for (;;) {
    const state = await (await fetch(base + "/state")).json();
    onProgress(state);
    if (state.initialized) return state;
    await new Promise(r => setTimeout(r, 4000));
  }
}

async function refreshState() {
  status.textContent = "检查世界状态…";
  const res = await fetch(base + "/state");
  const state = await res.json();
  if (state.itemCount === 0) {
    initGate.style.display = "block";
    composer.style.display = "none";
    status.textContent = "";
    return;
  }
  initGate.style.display = "none";
  if (state.initialized) {
    composer.style.display = "flex";
    status.textContent = "";
  } else {
    composer.style.display = "none";
    status.textContent = "世界正在建立索引中（" + state.pendingCount + "/" + state.itemCount + " 条未完成），请稍候…";
    await waitUntilReady(s => { status.textContent = "世界正在建立索引中（" + s.pendingCount + "/" + s.itemCount + " 条未完成），请稍候…"; });
    composer.style.display = "flex";
    status.textContent = "";
  }
}

initBtn.onclick = async () => {
  initBtn.disabled = true;
  status.textContent = "初始化中…";
  await fetch(base + "/seed", {method: "POST"});
  log.innerHTML = "";
  await refreshState();
  initBtn.disabled = false;
};

resetBtn.onclick = async () => {
  if (!confirm("重置会清空这个世界的全部历史，确定吗？")) return;
  initGate.style.display = "none";
  composer.style.display = "none";
  status.textContent = "重置中…";
  await fetch(base + "/seed", {method: "POST"});
  log.innerHTML = "";
  await refreshState();
};

async function send() {
  const attempt = input.value.trim();
  if (!attempt) return;
  input.value = "";
  sendBtn.disabled = true;
  input.disabled = true;
  status.textContent = "结算中，可能需要几十秒到几分钟…";
  try {
    const res = await fetch(base + "/attempt", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({attempt})
    });
    const result = await res.json();
    addTurn(attempt, result);
  } catch (error) {
    addTurn(attempt, {error: String(error)});
  }
  status.textContent = "";
  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}

sendBtn.onclick = send;
input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });

refreshState();
</script>
</body>
</html>`;
}
