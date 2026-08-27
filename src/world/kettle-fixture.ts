import type {CanonicalFact, ProcessState, WorldBasis, WorldSnapshot} from "../domain/types.js";
import {createGenesis} from "./materialized-world.js";

export interface KettleFixture {worldBasis: WorldBasis; genesis: WorldSnapshot}

export function createKettleFixture(): KettleFixture {
  const worldBasis = {worldId: "kettle-demo", schemaVersion: "1", fixtureVersion: "kettle-v1", genesisHash: "kettle-genesis-v1"};
  const fact: CanonicalFact = {factId: "g-kettle-state", address: "kettle:kettle-1:state", value: "heating",
    status: "active", canonicalHeight: 0, validFromWorldTime: "2026-08-27T18:24:00.000Z", sourceRef: "genesis", revision: 1};
  const process: ProcessState = {processId: "process:kettle-1", kind: "kettle_heating", ownerRef: "kettle-1",
    state: {phase: "heating"}, lastEvaluatedAt: "2026-08-27T18:24:00.000Z",
    nextSemanticTransitionAt: "2026-08-27T18:27:00.000Z", revision: 1};
  return {worldBasis, genesis: createGenesis(worldBasis, "2026-08-27T18:24:00.000Z", {facts: [fact], processes: [process]})};
}
