// Minimal in-memory truth store matching docs/adjudicator-pipeline-design-v0.1-2026-08-28.md
// section 1: namespace -> entity name (identity + retrieval key only) -> flat,
// ordered, natural-language proposition list. Deliberately not a typed schema.
//
// The scenario reuses the demo-fixture bedroom/door/blanket names for continuity with
// every prior spike this session, but represents Genesis as natural-language
// propositions instead of typed CanonicalFact/TruthCell records. Door gap width and
// blanket folded thickness are deliberately NEVER stated -- they must stay genuinely
// unresolved until an Attempt actually depends on them, exercising the COLLAPSE branch
// instead of it being a no-op.

export const entityRegistry = [
  {name: "self", aliases: ["我", "自己"]},
  {name: "bedroom", aliases: ["卧室", "房间"]},
  {name: "door-1", aliases: ["门", "房门", "门缝"]},
  {name: "bed-1", aliases: ["床"]},
  {name: "blanket-1", aliases: ["毛毯", "毯子"]},
  {name: "floor-1", aliases: ["地面", "地板"]}
];

let nextId = 1;
function makeId() { return `p${nextId++}`; }

export function createStore() {
  const propositions = [
    {id: makeId(), text: "self 在卧室里，站着。", entities: ["self", "bedroom"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "door-1 在卧室里，通向走廊。", entities: ["door-1", "bedroom"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "door-1 现在是关着的，没有上锁。", entities: ["door-1"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "bed-1 在卧室里。", entities: ["bed-1", "bedroom"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "floor-1 是卧室的地面。", entities: ["floor-1", "bedroom"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "blanket-1 现在放在 bed-1 上。", entities: ["blanket-1", "bed-1"], height: 0, status: "active", source: "genesis"},
    {id: makeId(), text: "blanket-1 摸起来柔软，可以压缩。", entities: ["blanket-1"], height: 0, status: "active", source: "genesis"}
  ];
  let height = 0;

  return {
    nextHeight() { height += 1; return height; },
    currentHeight() { return height; },
    retrieve(entityNames) {
      const set = new Set(entityNames);
      return propositions.filter(p => p.status === "active" && p.entities.some(e => set.has(e)));
    },
    append(text, entities, atHeight, source, supersedes) {
      if (supersedes !== undefined) {
        const target = propositions.find(p => p.id === supersedes);
        if (target !== undefined) target.status = "superseded";
      }
      const record = {id: makeId(), text, entities, height: atHeight, status: "active", source, ...(supersedes === undefined ? {} : {supersedes})};
      propositions.push(record);
      return record;
    },
    all() { return propositions.slice(); }
  };
}
