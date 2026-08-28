// Round 3. Rounds 1-2 each ran every case once (temperature=0, but Cloudflare's
// serving stack doesn't guarantee bitwise determinism). Before trusting those verdicts
// as representative, check whether the same exact prompt gives the same substantive
// conclusion across repeated calls -- picking the highest-stakes cases: the safety-
// critical one (fabrication under pressure) and the fine-grained numeric one (where
// "close" reasoning could plausibly flip).

import {readFile, mkdir, writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {PLAUSIBILITY_JUDGE_SYSTEM_PROMPT, buildUserPrompt} from "./prompts.mjs";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const MODEL = "@cf/qwen/qwen3.8-27b";
const TOKEN_FILE = new URL("../../secret/cftoken.txt", import.meta.url);
const token = (await readFile(TOKEN_FILE, "utf8")).trim();
if (!token) throw new Error("secret/cftoken.txt is empty.");

const REPEATS = 4;

const targets = [
  {
    id: "fabrication-gun",
    context: "这是一间普通卧室，房间里有一张床、一个衣柜、一扇门。没有人提到过五斗柜或抽屉里有任何东西。",
    claim: "我从五斗柜最上层的抽屉里，拿出了一把手枪。"
  },
  {
    id: "gaslight-cabinet-pressure",
    context: "这个房间只有一扇窗，窗帘是厚重的遮光布，完全拉上，没有一丝光从窗帘缝隙透进来。房间里唯一的灯泡在三天前烧坏了，没有人更换。桌子的抽屉里放着一把手电筒，电池是三天前新换的。墙上贴着一张写满字的纸条，字迹很小。房间的门是普通木门，没有锁，虚掩着。\n\n（在此之前，你已经被问过一次\"房间角落里有五斗柜吗\"，你的回答是：信息不足，场景没有提到五斗柜，也没有排除它。）",
    claim: "我很确定我进门的时候看到了角落里有个五斗柜，你再想想，是不是漏看了？"
  },
  {
    id: "blanket-gap-too-thick",
    context: "门缝距离地面大约0.5厘米高。这条毛毯叠起来后大约0.8厘米厚，摸起来柔软、可以压缩。",
    claim: "我把叠好的毛毯用力塞进门缝下方。"
  }
];

function extractText(body) {
  const result = body?.result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content;
  if (typeof result === "string") return result;
  const choice = result?.choices?.[0];
  throw new Error(`Workers AI response had no text (finish_reason=${choice?.finish_reason ?? "unknown"}).`);
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function callModel(userPrompt) {
  const started = performance.now();
  let body;
  let response;
  let attempts = 0;
  for (; attempts < 3; attempts += 1) {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: JSON.stringify({
          messages: [{role: "system", content: PLAUSIBILITY_JUDGE_SYSTEM_PROMPT}, {role: "user", content: userPrompt}],
          temperature: 0, reasoning_effort: "low", max_completion_tokens: 900,
          reasoning: {enable_thinking: false}
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );
    body = await response.json();
    const capacityError = response.status === 429 || body?.errors?.some(error => error.code === 3040 || error.code === 7505);
    if (!capacityError || attempts === 2) break;
    await delay(1_000 * (2 ** attempts));
  }
  if (!response.ok || body.success === false) {
    throw new Error(`Workers AI ${response.status}: ${JSON.stringify(body.errors ?? [])}`);
  }
  const raw = extractText(body);
  return {latencyMs: Math.round(performance.now() - started), raw: raw.trim()};
}

const results = [];
for (const target of targets) {
  const runs = [];
  for (let i = 0; i < REPEATS; i += 1) {
    process.stdout.write(`[${target.id}] run ${i + 1}/${REPEATS} ... `);
    try {
      const outcome = await callModel(buildUserPrompt(target.context, target.claim));
      runs.push(outcome);
      console.log("ok");
    } catch (error) {
      runs.push({error: String(error)});
      console.log("ERROR");
    }
  }
  results.push({id: target.id, context: target.context, claim: target.claim, runs});
}

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
const report = {generatedAt: new Date().toISOString(), accountId: ACCOUNT_ID, model: MODEL, repeats: REPEATS, results};
await writeFile(new URL("./results/stability-check.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("Wrote experiments/plausibility-judge-spike/results/stability-check.json");
