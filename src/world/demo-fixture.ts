import type {CanonicalFact, ProcessState, WorldBasis, WorldSnapshot} from "../domain/types.js";
import type {FixtureEntity} from "./door-fixture.js";
import {createGenesis} from "./materialized-world.js";

export interface DemoFixture {
  worldBasis: WorldBasis;
  entities: readonly FixtureEntity[];
  genesis: WorldSnapshot;
}

function fact(factId: string, address: string, value: string | number): CanonicalFact {
  return {factId, address, value, status: "active", canonicalHeight: 0,
    validFromWorldTime: "2026-08-27T18:24:00.000Z", sourceRef: "genesis", revision: 1};
}

export function createDemoFixture(): DemoFixture {
  const worldBasis = {worldId: "text-vr-demo", schemaVersion: "1", fixtureVersion: "demo-v1", genesisHash: "demo-genesis-v1"};
  const entities: FixtureEntity[] = [
    {entityId: "self", kind: "actor", aliases: ["我", "自己"], perceivableBy: ["self"]},
    {entityId: "bedroom", kind: "room", aliases: ["卧室"], perceivableBy: ["self"]},
    {entityId: "hallway", kind: "room", aliases: ["走廊"], perceivableBy: []},
    {entityId: "door-1", kind: "door", aliases: ["门", "房门"], perceivableBy: ["self"]}
  ];
  const facts = [
    fact("g-self-place", "placement:self", "bedroom"),
    fact("g-door-open", "door:door-1:open", "false"),
    fact("g-door-aperture", "door:door-1:aperture_cm", 0),
    fact("g-door-locked", "door:door-1:locked", "false"),
    fact("g-kettle-state", "kettle:kettle-1:state", "heating")
  ];
  const processes: ProcessState[] = [{processId: "process:kettle-1", kind: "kettle_heating", ownerRef: "kettle-1",
    state: {phase: "heating"}, lastEvaluatedAt: "2026-08-27T18:24:00.000Z",
    nextSemanticTransitionAt: "2026-08-27T18:27:00.000Z", revision: 1}];
  return {worldBasis, entities, genesis: createGenesis(worldBasis, "2026-08-27T18:24:00.000Z", {facts, processes})};
}
