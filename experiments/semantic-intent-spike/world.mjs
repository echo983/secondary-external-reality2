// Shared entity source-of-truth for the spike. Both the NEW (SemanticIntentFrame)
// and OLD (production ActionProposal) prompt arms are built from the same entities,
// so any behavioral difference is attributable to the prompt/context shape, not to
// the underlying scene differing between arms.
//
// This intentionally mirrors src/world/demo-fixture.ts's bedroom/door/bed/floor/blanket
// scene (same entity ids and Chinese aliases) so findings transfer to the real fixture.

export function baseEntities() {
  return [
    {slot: "actor", kind: "actor", labels: ["我", "自己"], placement: "bedroom",
      posture: "standing", holding: [], affordances: ["perceive", "orient", "move", "communicate"]},
    {slot: "door-1", kind: "door", labels: ["门", "房门", "门缝"], placement: "bedroom",
      properties: {open: false, aperture_cm: 0, locked: false}, spatial: {otherSide: "hallway"},
      affordances: ["contact", "apply_force", "occludes"]},
    {slot: "bed-1", kind: "object", labels: ["床"], placement: "bedroom",
      properties: {movable: "unresolved"}, affordances: ["contact", "support"]},
    {slot: "floor-1", kind: "object", labels: ["地面", "地板"], placement: "bedroom",
      affordances: ["contact", "support"]},
    {slot: "blanket-1", kind: "object", labels: ["毛毯", "毯子"], placement: "bed-1",
      properties: {fits_under_door_gap: "unresolved"},
      affordances: ["hold", "release", "place", "move", "deformable"]},
    {slot: "hallway", kind: "space", labels: ["走廊"], placement: null, affordances: ["contains"]}
  ];
}

export function withBlanketHeld(entities) {
  return entities.map(entity => {
    if (entity.slot === "blanket-1") return {...entity, placement: "held_by:actor"};
    if (entity.slot === "actor") return {...entity, holding: ["blanket-1"]};
    return entity;
  });
}

// Rich world context for the NEW SemanticIntentFrame prompt: exposes placement,
// properties (including declared-unresolved ones) and current holding relations.
export function richContext(entities, discourse) {
  return {
    actorSlot: "actor",
    entities: entities.map(entity => ({
      slot: entity.slot, kind: entity.kind, labels: entity.labels, placement: entity.placement,
      ...(entity.properties === undefined ? {} : {properties: entity.properties}),
      ...(entity.spatial === undefined ? {} : {spatial: entity.spatial}),
      ...(entity.holding === undefined ? {} : {holding: entity.holding}),
      affordances: entity.affordances
    })),
    allowedRelations: ["open", "aperture_cm", "held_by", "placed_at", "occludes"],
    ...(discourse === undefined ? {} : {discourse})
  };
}

// Legacy opaque-slot context matching src/world/action-scene.ts's ActionContext shape:
// slot/kind/label/perceivable/affordances only. No placement, properties, or holding
// state is exposed -- this is the real production shape, reproduced faithfully so the
// baseline arm is not a strawman.
export function legacyContext(entities) {
  return {
    actorSlot: "actor",
    slots: entities.map(entity => ({
      slot: entity.slot,
      kind: entity.kind === "actor" ? "actor" : entity.kind === "space" ? "space" : "object",
      label: entity.labels.join("/"), perceivable: true, affordances: entity.affordances
    })),
    allowedRelations: ["open", "aperture_cm", "held_by", "placed_at", "occludes"]
  };
}
