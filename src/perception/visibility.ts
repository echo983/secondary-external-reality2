import type {CanonicalFact, EntityId, WorldSnapshot} from "../domain/types.js";
import type {FixtureEntity} from "../world/door-fixture.js";
import {ProtocolError} from "../protocol/errors.js";

function activePlacement(snapshot: WorldSnapshot, entityId: EntityId): CanonicalFact | undefined {
  return snapshot.facts.find(fact => fact.address === `placement:${entityId}` && fact.status === "active");
}

export function containingSpace(snapshot: WorldSnapshot, entities: readonly FixtureEntity[], entityId: EntityId): EntityId | undefined {
  let cursor = entityId;
  const visited = new Set<EntityId>();
  for (let depth = 0; depth < 16; depth += 1) {
    if (visited.has(cursor)) throw new ProtocolError("INTERNAL_INVARIANT", "placement cycle reached perception projector");
    visited.add(cursor);
    const placement = activePlacement(snapshot, cursor);
    if (placement === undefined || typeof placement.value !== "string") return undefined;
    const parent = entities.find(entity => entity.entityId === placement.value);
    if (parent?.kind === "room") return parent.entityId;
    cursor = placement.value;
  }
  throw new ProtocolError("INTERNAL_INVARIANT", "placement depth exceeded perception budget");
}

export function visibleEntitiesInActorSpace(
  snapshot: WorldSnapshot,
  entities: readonly FixtureEntity[],
  actorId: EntityId
): readonly {entity: FixtureEntity; placementFact: CanonicalFact}[] {
  const actorSpace = containingSpace(snapshot, entities, actorId);
  if (actorSpace === undefined) throw new ProtocolError("INTERNAL_INVARIANT", "actor has no containing space");
  const visible: {entity: FixtureEntity; placementFact: CanonicalFact}[] = [];
  for (const entity of entities) {
    if (entity.entityId === actorId || entity.kind === "room" || !entity.perceivableBy.includes(actorId)) continue;
    if (containingSpace(snapshot, entities, entity.entityId) !== actorSpace) continue;
    const placementFact = activePlacement(snapshot, entity.entityId);
    if (placementFact !== undefined) visible.push({entity, placementFact});
  }
  return visible;
}
