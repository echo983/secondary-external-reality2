// Shared corpus for comparing two ingestion granularities against the real Cloudflare
// AI Search instance `sr2-truth-store`: one file per proposition ("A") vs one file per
// Height batch ("B"). Same underlying facts either way -- only the file grouping
// differs, per docs/adjudicator-pipeline-design-v0.1-2026-08-28.md's proposition
// model, extended with a couple more entities (kettle-1, closet-1, rug-1) for real
// cross-entity distractor risk, matching the same bedroom/door/blanket world used
// throughout this session for continuity.
//
// Height numbers were reassigned 2026-08-28 (round 2, see
// docs/ai-search-retrieval-spike-findings-2026-08-28.md's "下一步" #1): round 1 lumped
// all 11 genesis facts into a single height/file, which is not representative --
// pipeline-integration-slice's real runs typically commit 1-3 propositions per Height,
// never anywhere near 11. Genesis is now spread across 6 small heights (max 2 facts
// each) instead of one oversized one, to test the batching question without that
// confound. Text/entities are otherwise unchanged from round 1 for a clean comparison.

export const propositions = [
  {height: 0, entities: ["self", "bedroom"], text: "self 在卧室里，站着。"},
  {height: 0, entities: ["door-1", "bedroom"], text: "door-1 在卧室里，通向走廊。"},
  {height: 1, entities: ["door-1"], text: "door-1 现在是关着的，没有上锁。"},
  {height: 1, entities: ["bed-1", "bedroom"], text: "bed-1 在卧室里。"},
  {height: 2, entities: ["floor-1", "bedroom"], text: "floor-1 是卧室的地面。"},
  {height: 2, entities: ["blanket-1", "bed-1"], text: "blanket-1 现在放在 bed-1 上。"},
  {height: 3, entities: ["blanket-1"], text: "blanket-1 摸起来柔软，可以压缩。"},
  {height: 3, entities: ["kettle-1", "bedroom"], text: "kettle-1 在卧室里，插着电。"},
  {height: 4, entities: ["kettle-1"], text: "kettle-1 正在加热。"},
  {height: 4, entities: ["closet-1", "bedroom"], text: "closet-1 在卧室里，门是关着的。"},
  {height: 5, entities: ["rug-1", "bedroom"], text: "rug-1 卷着放在墙角。"},
  {height: 6, entities: ["blanket-1"], text: "blanket-1 的厚度约为三厘米。"},
  {height: 7, entities: ["door-1"], text: "door-1 门底缝隙宽约一厘米。"},
  {height: 8, entities: ["kettle-1"], text: "kettle-1 的水已经烧开，发出鸣笛声。"},
  {height: 9, entities: ["self", "kettle-1"], text: "self 把 kettle-1 关掉了。"},
  {height: 10, entities: ["kettle-1"], text: "kettle-1 不再加热，安静下来。"},
  {height: 11, entities: ["closet-1"], text: "closet-1 被打开了，露出里面挂着的衣服。"},
  {height: 12, entities: ["rug-1", "blanket-1"], text: "rug-1 摸起来比 blanket-1 粗糙，不太柔软。"},
  {height: 13, entities: ["self", "blanket-1", "door-1"], text: "self 把 blanket-1 从 bed-1 上拿起来，塞进了 door-1 门底的缝隙里。"},
  {height: 14, entities: ["blanket-1", "door-1"], text: "blanket-1 现在是压缩状态，塞在 door-1 门底缝隙里，不再放在 bed-1 上。"},
  {height: 15, entities: ["self", "closet-1"], text: "self 走到 closet-1 前面，看了看里面的衣服。"}
];

// Each query names what a correct retrieval should surface (by matching substring in
// the returned chunk text) -- scoring is substring-match against top-K results, not a
// separate LLM judge, to keep this experiment about retrieval mechanics specifically.
export const queries = [
  {id: "blanket-location-current", query: "毛毯现在放在哪里？", expectSubstring: "门底的缝隙里",
    note: "recency test：门缝、床上两条都在语料里，正确答案是更晚那条(H9/H8)，不是H0的创世设定。"},
  {id: "door-gap-width", query: "门缝有多宽？", expectSubstring: "一厘米"},
  {id: "kettle-still-boiling", query: "水壶现在还在烧水吗？", expectSubstring: "不再加热",
    note: "同样是recency：H3说在烧，H5说不再烧，正确答案是H5。"},
  {id: "rug-texture-not-blanket", query: "地毯摸起来怎么样？", expectSubstring: "比 blanket-1 粗糙",
    note: "干扰测试：rug-1和blanket-1的质感描述很像，不能查地毯却答出毛毯的。"},
  {id: "blanket-texture-not-rug", query: "毛毯摸起来怎么样？", expectSubstring: "柔软，可以压缩",
    note: "反向干扰测试：查毛毯不能被rug-1的相似内容抢走。"},
  {id: "closet-contents", query: "衣柜里有什么？", expectSubstring: "挂着的衣服"},
  {id: "self-current-room", query: "自己现在在哪个房间？", expectSubstring: "卧室里"},
  {id: "blanket-thickness", query: "毛毯的厚度大概多少？", expectSubstring: "三厘米"}
];
