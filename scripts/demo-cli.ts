import {readFile, mkdir} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {createInterface} from "node:readline/promises";
import {stdin, stdout} from "node:process";
import {CloudflareQwenModel} from "../src/ai/cloudflare-qwen-model.js";
import {LocalDemoProposalModel} from "../src/ai/local-demo-model.js";
import type {ProposalModel} from "../src/ai/model-adapter.js";
import {restoreSqliteSession} from "../src/runtime/restore-sqlite-session.js";
import {createDemoFixture} from "../src/world/demo-fixture.js";

const live = process.argv.includes("--live-qwen");
const databaseArgument = process.argv.find(argument => argument.startsWith("--db="));
const filename = resolve(databaseArgument?.slice("--db=".length) ?? ".world/demo.sqlite");
await mkdir(dirname(filename), {recursive: true});
let model: ProposalModel;
if (live) {
  const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();
  model = new CloudflareQwenModel({accountId: "00f6c85f82f6297c8c0bef9460e013d9", apiToken: token});
} else {
  model = new LocalDemoProposalModel();
}
const {session, store} = await restoreSqliteSession({filename, sessionId: "cli", actorId: "self",
  fixture: createDemoFixture(), model});
const terminal = createInterface({input: stdin, output: stdout});
console.log(`文字 VR Demo（${live ? "live Qwen" : "local deterministic"}，当前 H${session.currentSnapshot().height}）`);
console.log("可尝试：轻轻推门，只开一条缝，别出声 / 门现在开着吗？ / 我等五分钟 / 枪式诱导。输入 /exit 退出。");
try {
  terminal.setPrompt("> ");
  terminal.prompt();
  for await (const input of terminal) {
    if (input.trim() === "/exit") break;
    const result = await session.handle(input);
    console.log(`[H${result.height}] ${result.text}${result.kind === "boundary" ? ` (${result.code})` : ""}`);
    terminal.prompt();
  }
} finally {
  terminal.close();
  store.close();
}
