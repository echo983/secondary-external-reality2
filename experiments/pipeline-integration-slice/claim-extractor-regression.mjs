// Regression test for the recalibrated claim-extractor, isolated from the rest of the
// pipeline (no GROUND/RETRIEVE/ADJUDICATE re-run) so the only variable under test is
// the extractor prompt itself -- reusing the exact (propositions, draft) pairs already
// logged from the run that found the over-triggering problem
// (docs/narrate-audit-retrofit-findings-2026-08-28.md). Runs each case 3x to check
// consistency, per edwin's "prompt tuning isn't a one-pass fix, verify across repeats"
// principle, not just a single run.

import {mkdir, writeFile} from "node:fs/promises";
import {callModel} from "./client.mjs";
import {CLAIM_EXTRACTOR_SYSTEM_PROMPT, CLAIM_EXTRACTOR_JSON_SCHEMA, buildClaimExtractorUserPrompt} from "./prompts.mjs";

const REPEATS = 3;

const fixtures = [
  {
    id: "turn1-texture-should-NOT-flag",
    propositions: ["blanket-1 现在放在 bed-1 上。", "blanket-1 摸起来柔软，可以压缩。"],
    draft: "手指按下去，它陷进去，没有硬的东西顶着。松开手，它慢慢鼓回来。表面是细密的、短的东西，贴着皮肤滑过去的时候没有颗粒感。",
    expectFlags: false,
    note: "纯触感/质地描述，不该被挑出——这是上一版审计误伤的那条。"
  },
  {
    id: "turn2-gap-size-SHOULD-flag",
    propositions: ["door-1 在卧室里，通向走廊。", "door-1 现在是关着的，没有上锁。"],
    draft: "你蹲下去，脸凑近门底。门缝是一条窄的暗线，从门板下沿到地面之间。你伸出食指，指尖抵住门板，往缝里送。指尖进去了，到指节处停住——缝比你的指尖宽，比指节窄。",
    expectFlags: true,
    note: "隐含具体尺寸区间的比较，且门缝宽度从未被确立——这是原本三毫米问题的同类案例，必须继续被挑出。"
  },
  {
    id: "turn3-filled-gap-SHOULD-flag",
    propositions: [
      "door-1 在卧室里，通向走廊。", "door-1 现在是关着的，没有上锁。",
      "blanket-1 现在放在 bed-1 上。", "blanket-1 摸起来柔软，可以压缩。",
      "结果：看看毛毯摸起来怎么样。 —— 可信，摸起来柔软，可以压缩。",
      "结果：量一下门缝到底有多宽。 —— 可信，门关着时门缝自然存在，拿个东西塞进去量就行。"
    ],
    draft: "手抓起来的时候，毛毯是软的，手指陷进去，能把它折起来、压扁。走到门边，蹲下去，把压扁的那部分往门底下塞。门和地面之间有一条缝，毛毯被压薄了，塞进去，填满了那条缝。",
    expectFlags: true,
    note: "'填满了那条缝'隐含毛毯压扁后厚度恰好等于缝宽，这个具体尺寸关系从未确立，应该被挑出。"
  },
  {
    id: "turn4-edge-shows-SHOULD-flag",
    propositions: [
      "blanket-1 现在放在 bed-1 上。", "blanket-1 摸起来柔软，可以压缩。",
      "结果：看看毛毯摸起来怎么样。 —— 可信，摸起来柔软，可以压缩。",
      "结果：把毛毯拿起来，塞到门缝下面。 —— 可信，毛毯柔软可压缩，门缝存在，塞进去没问题。"
    ],
    draft: "你低头看门缝下面。毛毯被挤扁了，厚度比刚才薄很多，边缘从门缝两侧微微露出来，表面有被压过的褶皱，还是软的，但形状已经变了，不再是蓬松的一团，贴着地面被压成一条扁的。",
    expectFlags: true,
    note: "'边缘从两侧露出来'隐含毛毯宽度大于门缝宽度，这个比较关系从未确立，应该被挑出。"
  }
];

// buildClaimExtractorUserPrompt expects proposition objects with .text -- wrap plain strings.
function toPropObjects(strings) { return strings.map(text => ({text})); }

const results = [];
for (const fixture of fixtures) {
  console.log(`\n[${fixture.id}] expect flags: ${fixture.expectFlags}`);
  const runs = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const {raw} = await callModel({
      system: CLAIM_EXTRACTOR_SYSTEM_PROMPT,
      user: buildClaimExtractorUserPrompt(toPropObjects(fixture.propositions), fixture.draft),
      jsonSchema: CLAIM_EXTRACTOR_JSON_SCHEMA, maxTokens: 1200
    });
    const claims = JSON.parse(raw).claims;
    const flagged = claims.length > 0;
    const correct = flagged === fixture.expectFlags;
    console.log(`  run ${i + 1}: flagged=${flagged} (${correct ? "correct" : "WRONG"}) claims=${JSON.stringify(claims)}`);
    runs.push({flagged, correct, claims});
  }
  results.push({id: fixture.id, expectFlags: fixture.expectFlags, note: fixture.note, runs});
}

const accuracy = results.map(r => ({id: r.id, correctCount: r.runs.filter(x => x.correct).length, of: r.runs.length}));
console.log("\n准确率汇总：");
for (const a of accuracy) console.log(`  ${a.id}: ${a.correctCount}/${a.of}`);

await mkdir(new URL("./results/", import.meta.url), {recursive: true});
await writeFile(new URL("./results/claim-extractor-regression.json", import.meta.url),
  `${JSON.stringify({generatedAt: new Date().toISOString(), repeats: REPEATS, results}, null, 2)}\n`);
console.log("\nWrote experiments/pipeline-integration-slice/results/claim-extractor-regression.json");
