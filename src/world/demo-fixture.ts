import type {CanonicalFact, ProcessState, WorldBasis, WorldSnapshot} from "../domain/types.js";
import type {FixtureEntity} from "./door-fixture.js";
import {createGenesis} from "./materialized-world.js";

export interface DemoFixture {
  worldBasis: WorldBasis;
  entities: readonly FixtureEntity[];
  genesis: WorldSnapshot;
  affordances: Readonly<Record<string, readonly string[]>>;
  allowedRelations: readonly string[];
}

function fact(factId: string, address: string, value: string | number): CanonicalFact {
  return {factId, address, value, status: "active", canonicalHeight: 0,
    validFromWorldTime: "2026-08-27T18:24:00.000Z", sourceRef: "genesis", revision: 1};
}

export function createDemoFixture(): DemoFixture {
  const worldBasis = {worldId: "text-vr-demo", schemaVersion: "1", fixtureVersion: "demo-v3", genesisHash: "demo-genesis-v3"};
  const entities: FixtureEntity[] = [
    {entityId: "self", kind: "actor", aliases: ["我", "自己"], perceivableBy: ["self"]},
    {entityId: "bedroom", kind: "room", aliases: ["卧室"], perceivableBy: ["self"]},
    {entityId: "hallway", kind: "room", aliases: ["走廊"], perceivableBy: []},
    {entityId: "door-1", kind: "door", aliases: ["门", "房门", "门缝"], perceivableBy: ["self"]},
    {entityId: "bed-1", kind: "object", aliases: ["床"], perceivableBy: ["self"]},
    {entityId: "blanket-1", kind: "object", aliases: ["毛毯", "毯子"], perceivableBy: ["self"]}
  ];
  const facts = [
    fact("g-self-place", "placement:self", "bedroom"),
    fact("g-door-open", "door:door-1:open", "false"),
    fact("g-door-aperture", "door:door-1:aperture_cm", 0),
    fact("g-door-locked", "door:door-1:locked", "false"),
    fact("g-door-place", "placement:door-1", "bedroom"),
    fact("g-door-other-side", "door:door-1:other_side", "hallway"),
    fact("g-bed-place", "placement:bed-1", "bedroom"),
    fact("g-blanket-place", "placement:blanket-1", "bed-1"),
    fact("g-room-light", "room:bedroom:light", "lit"),
    fact("g-room-sound", "room:bedroom:ambient_sound", "quiet"),
    fact("g-hallway-light", "room:hallway:light", "lit"),
    fact("g-hallway-sound", "room:hallway:ambient_sound", "quiet"),
    fact("g-self-posture", "body:self:posture", "standing"),
    fact("g-self-orientation", "body:self:orientation", "room"),
    fact("g-self-pain", "body:self:pain", "none"),
    fact("g-kettle-state", "kettle:kettle-1:state", "heating")
  ];
  const processes: ProcessState[] = [{processId: "process:kettle-1", kind: "kettle_heating", ownerRef: "kettle-1",
    state: {phase: "heating"}, lastEvaluatedAt: "2026-08-27T18:24:00.000Z",
    nextSemanticTransitionAt: "2026-08-27T18:27:00.000Z", revision: 1}];
  const affordances = {
    self: ["perceive", "orient", "move", "communicate"], bedroom: ["contains"], hallway: ["contains"],
    "door-1": ["contact", "apply_force", "relation:open", "relation:aperture_cm", "occludes"],
    "bed-1": ["contact", "support", "contains"], "blanket-1": ["contact", "hold", "release", "place", "move", "relation:held_by", "relation:placed_at", "deformable"]
  } as const;
  return {worldBasis, entities, genesis: createGenesis(worldBasis, "2026-08-27T18:24:00.000Z", {facts, processes}),
    affordances, allowedRelations: ["open", "aperture_cm", "held_by", "placed_at", "occludes"]};
}
