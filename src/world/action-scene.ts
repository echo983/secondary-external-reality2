import type {WorldSnapshot} from "../domain/types.js";
import type {ActionContext} from "../protocol/action-proposal.js";
import type {DemoFixture} from "./demo-fixture.js";
import {visibleEntitiesInActorSpace} from "../perception/visibility.js";

export interface ActionScene {
  context: ActionContext;
  entityBySlot: ReadonlyMap<string, string>;
}

export function buildActionScene(snapshot: WorldSnapshot, fixture: DemoFixture, actorId: string): ActionScene {
  const actorSpace = snapshot.facts.find(fact => fact.address === `placement:${actorId}` && fact.status === "active")?.value;
  const doorOpen = snapshot.facts.some(fact => fact.address === "door:door-1:open" && fact.status === "active" && fact.value === "true");
  const visibleIds = new Set(visibleEntitiesInActorSpace(snapshot, fixture.entities, actorId).map(item => item.entity.entityId));
  if (typeof actorSpace === "string") visibleIds.add(actorSpace);
  if (doorOpen && actorSpace === "bedroom") visibleIds.add("hallway");
  const records = fixture.entities.filter(entity => entity.entityId === actorId || visibleIds.has(entity.entityId));
  const entityBySlot = new Map<string, string>();
  const slots = records.map((entity, index) => {
    const slot = entity.entityId === actorId ? "actor" : `scene-${index}`;
    entityBySlot.set(slot, entity.entityId);
    return {slot, kind: entity.kind === "actor" ? "actor" as const : entity.kind === "room" ? "space" as const : "object" as const,
      label: entity.aliases.join("/"), perceivable: entity.entityId === actorId || visibleIds.has(entity.entityId),
      affordances: fixture.affordances[entity.entityId] ?? []};
  });
  return {context: {actorSlot: "actor", slots, allowedRelations: fixture.allowedRelations}, entityBySlot};
}
