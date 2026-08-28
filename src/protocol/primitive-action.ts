import type {ConstitutedInput} from "../domain/types.js";
import type {ActionProposal, ActionSceneSlot} from "./action-proposal.js";
import {ProtocolError} from "./errors.js";

export function constitutePrimitiveAction(proposal: ActionProposal, actorId: string,
  slots: readonly ActionSceneSlot[], entityBySlot: ReadonlyMap<string, string>): ConstitutedInput {
  if (proposal.unresolvedDependencies.length !== 0) {
    throw new ProtocolError("TARGET_UNGROUNDED", "action proposal has unresolved world dependencies");
  }
  const slotByName = new Map(slots.map(slot => [slot.slot, slot]));
  const entity = (slot: string): string => {
    const id = entityBySlot.get(slot);
    if (id === undefined || slotByName.get(slot)?.perceivable !== true) throw new ProtocolError("TARGET_UNGROUNDED", "slot is not grounded");
    return id;
  };
  const requireAffordance = (slot: string, affordance: string): void => {
    if (!slotByName.get(slot)?.affordances.includes(affordance)) {
      throw new ProtocolError("CAPABILITY_UNSUPPORTED", `target does not support ${affordance}`);
    }
  };
  for (const effect of proposal.effects) {
    if (effect.kind === "force" && effect.objectSlot !== undefined) requireAffordance(effect.objectSlot, "apply_force");
    if (effect.kind === "holding") requireAffordance(effect.subjectSlot, "hold");
    if (effect.kind === "relation") requireAffordance(effect.subjectSlot, `relation:${effect.field}`);
  }
  if (proposal.kind === "wait" && proposal.durationSeconds !== undefined) {
    return {kind: "wait", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "wait", goal: "wait", method: "wait", targetIds: [], modifiers: {durationSeconds: proposal.durationSeconds}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("hold") && proposal.primitives.includes("place")) {
    const heldSlot = proposal.effects.find(effect => effect.kind === "holding")?.subjectSlot ?? proposal.targetSlots[0];
    const placement = proposal.effects.find(effect => effect.kind === "placement");
    const destinationSlot = placement?.objectSlot ?? proposal.targetSlots.find(slot => slot !== heldSlot);
    if (heldSlot === undefined || destinationSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "composed hold/place targets are absent");
    requireAffordance(heldSlot, "hold"); requireAffordance(heldSlot, "place"); requireAffordance(destinationSlot, "contains");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [
      {clauseIndex: proposal.clauseIndex, operation: "primitive:hold", goal: "hold", method: "hold",
        targetIds: [entity(heldSlot)], modifiers: {}},
      {clauseIndex: proposal.clauseIndex + 1, operation: "primitive:place", goal: "place", method: "place",
        targetIds: [entity(heldSlot), entity(destinationSlot)], modifiers: {occludes: placement?.field === "under_gap" ||
          proposal.effects.some(effect => effect.kind === "relation" && effect.field === "occludes" && effect.value === true)}}
    ]};
  }
  const relation = proposal.effects.find(effect => effect.kind === "relation" && effect.field === "open" && effect.value === true);
  const targetSlot = relation?.subjectSlot ?? proposal.targetSlots[0];
  if (proposal.kind === "attempt" && targetSlot !== undefined && proposal.primitives.includes("contact") &&
      proposal.primitives.includes("apply_force") && proposal.primitives.includes("change_relation")) {
    requireAffordance(targetSlot, "contact");
    requireAffordance(targetSlot, "apply_force");
    requireAffordance(targetSlot, "relation:open");
    const aperture = proposal.effects.find(effect => effect.kind === "relation" && effect.field === "aperture_cm")?.value;
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:door-open", goal: "change open relation", method: "contact+force", targetIds: [entity(targetSlot)],
      modifiers: {apertureCm: typeof aperture === "number" ? aperture : 80}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("hold")) {
    const heldSlot = proposal.effects.find(effect => effect.kind === "holding")?.subjectSlot ?? proposal.targetSlots[0];
    if (heldSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "hold target is absent");
    requireAffordance(heldSlot, "hold");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:hold", goal: "hold", method: "hold", targetIds: [entity(heldSlot)], modifiers: {}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("release")) {
    const heldSlot = proposal.effects.find(effect => effect.kind === "holding")?.subjectSlot ?? proposal.targetSlots[0];
    if (heldSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "release target is absent");
    requireAffordance(heldSlot, "release");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:release", goal: "release", method: "release", targetIds: [entity(heldSlot)], modifiers: {}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("move") && proposal.primitives.includes("place") &&
      !proposal.primitives.includes("hold")) {
    const placement = proposal.effects.find(effect => effect.kind === "placement");
    const subjectSlot = placement?.subjectSlot ?? proposal.targetSlots[0];
    const destinationSlot = placement?.objectSlot ?? proposal.targetSlots.find(slot => slot !== subjectSlot);
    if (subjectSlot === undefined || destinationSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "drag targets are absent");
    requireAffordance(subjectSlot, "move"); requireAffordance(subjectSlot, "place"); requireAffordance(destinationSlot, "contains");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:drag", goal: "move object", method: "contact+move", targetIds: [entity(subjectSlot), entity(destinationSlot)],
      modifiers: {occludes: placement?.field === "under_gap" || proposal.effects.some(effect =>
        effect.kind === "relation" && effect.field === "occludes" && effect.value === true)}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("place")) {
    const subjectSlot = proposal.effects.find(effect => effect.kind === "placement" || effect.kind === "relation")?.subjectSlot ?? proposal.targetSlots[0];
    const destinationSlot = proposal.effects.find(effect => effect.kind === "placement")?.objectSlot ?? proposal.targetSlots.find(slot => slot !== subjectSlot);
    if (subjectSlot === undefined || destinationSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "place targets are absent");
    requireAffordance(subjectSlot, "place");
    requireAffordance(destinationSlot, "contains");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:place", goal: "place", method: "place", targetIds: [entity(subjectSlot), entity(destinationSlot)],
      modifiers: {occludes: proposal.effects.find(effect => effect.kind === "placement")?.field === "under_gap" ||
        proposal.effects.some(effect => effect.kind === "relation" && effect.field === "occludes" && effect.value === true)}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("move")) {
    const destinationSlot = proposal.effects.find(effect => effect.kind === "placement" && effect.objectSlot !== undefined)?.objectSlot ??
      proposal.targetSlots.find(slot => slotByName.get(slot)?.kind === "space");
    if (destinationSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "move destination is absent");
    requireAffordance(destinationSlot, "contains");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:move", goal: "move", method: "move", targetIds: [entity(destinationSlot)], modifiers: {}}]};
  }
  if (proposal.kind === "attempt" && proposal.primitives.includes("orient")) {
    const orientation = proposal.effects.find(effect => effect.kind === "orientation");
    const orientationSlot = orientation?.objectSlot ?? proposal.targetSlots[0];
    if (orientationSlot === undefined) throw new ProtocolError("TARGET_UNGROUNDED", "orientation target is absent");
    return {kind: "attempt", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:orient", goal: "orient", method: "orient", targetIds: [entity(orientationSlot)], modifiers: {}}]};
  }
  if ((proposal.kind === "speech" || proposal.kind === "attempt") && proposal.primitives.includes("communicate")) {
    const speech = proposal.effects.find(effect => effect.kind === "signal" && effect.field === "speech")?.value;
    if (typeof speech !== "string") throw new ProtocolError("INPUT_INVALID", "speech candidate lacks content");
    return {kind: "speech", actorId, unsupportedClaims: [], clauses: [{clauseIndex: proposal.clauseIndex,
      operation: "primitive:speech", goal: "communicate", method: "speech", targetIds: [], modifiers: {speech}}]};
  }
  throw new ProtocolError("CAPABILITY_UNSUPPORTED", "validated primitives have no trusted world rule");
}
