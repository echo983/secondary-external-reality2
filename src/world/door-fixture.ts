import type {CanonicalFact, EntityId, WorldBasis, WorldSnapshot} from "../domain/types.js";
import {createGenesis} from "./materialized-world.js";

export interface FixtureEntity {
  entityId: EntityId;
  kind: "actor" | "room" | "door" | "object";
  aliases: readonly string[];
  perceivableBy: readonly EntityId[];
}

export interface DoorFixture {
  worldBasis: WorldBasis;
  entities: readonly FixtureEntity[];
  genesis: WorldSnapshot;
}

function genesisFact(factId: string, address: string, value: string | number): CanonicalFact {
  return {factId, address, value, status: "active", canonicalHeight: 0,
    validFromWorldTime: "2026-08-27T12:00:00.000Z", sourceRef: "genesis", revision: 1};
}

export function createDoorFixture(): DoorFixture {
  const worldBasis = {worldId: "door-demo", schemaVersion: "1", fixtureVersion: "door-v1", genesisHash: "door-genesis-v1"};
  const entities: FixtureEntity[] = [
    {entityId: "self", kind: "actor", aliases: ["我", "自己"], perceivableBy: ["self"]},
    {entityId: "bedroom", kind: "room", aliases: ["卧室"], perceivableBy: ["self"]},
    {entityId: "hallway", kind: "room", aliases: ["走廊"], perceivableBy: []},
    {entityId: "door-1", kind: "door", aliases: ["门", "房门"], perceivableBy: ["self"]}
  ];
  const facts = [
    genesisFact("g-self-place", "placement:self", "bedroom"),
    genesisFact("g-door-open", "door:door-1:open", "false"),
    genesisFact("g-door-aperture", "door:door-1:aperture_cm", 0),
    genesisFact("g-door-locked", "door:door-1:locked", "false")
  ];
  return {worldBasis, entities, genesis: createGenesis(worldBasis, "2026-08-27T12:00:00.000Z", {facts})};
}
