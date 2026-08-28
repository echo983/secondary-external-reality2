import type {JsonScalar} from "../domain/types.js";
import {ProtocolError} from "./errors.js";

export const actionPrimitives = [
  "perceive", "orient", "move", "contact", "apply_force", "hold", "release", "place",
  "change_relation", "communicate", "wait"
] as const;
export type ActionPrimitive = (typeof actionPrimitives)[number];

export const effectKinds = [
  "observation_scope", "orientation", "placement", "contact", "force", "holding", "relation", "signal", "time"
] as const;
export type EffectKind = (typeof effectKinds)[number];

export const perceptionModalities = [
  "vision", "hearing", "touch", "proprioception", "interoception"
] as const;
export type PerceptionModality = (typeof perceptionModalities)[number];

export interface ActionSceneSlot {
  slot: string;
  kind: "actor" | "space" | "object" | "body_part";
  label: string;
  perceivable: boolean;
  affordances: readonly string[];
}

export interface ActionContext {
  actorSlot: string;
  slots: readonly ActionSceneSlot[];
  allowedRelations: readonly string[];
}

export interface ProposedCondition {
  kind: "fact" | "capability" | "relation" | "reachability";
  subjectSlot: string;
  predicate: string;
  objectSlot?: string;
  value?: JsonScalar;
  source: "world_slice" | "operation_contract";
}

export interface ProposedEffect {
  kind: EffectKind;
  subjectSlot: string;
  field: string;
  objectSlot?: string;
  value?: JsonScalar;
  certainty: "required" | "possible";
}

export interface ProposedPerceptionScope {
  modality: PerceptionModality;
  originSlot: string;
  horizon: "ambient" | "directional" | "object" | "body";
  targetSlots: readonly string[];
}

export interface ProposedDependency {
  kind: "binding" | "fact" | "capability" | "constraint";
  slot?: string;
  reason: string;
}

export interface ActionProposal {
  kind: "attempt" | "query" | "wait" | "speech" | "none" | "invalid";
  clauseIndex: number;
  primitives: readonly ActionPrimitive[];
  targetSlots: readonly string[];
  conditions: readonly ProposedCondition[];
  effects: readonly ProposedEffect[];
  perceptionScopes: readonly ProposedPerceptionScope[];
  durationSeconds?: number;
  unresolvedDependencies: readonly ProposedDependency[];
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: JsonObject, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
};
const isScalar = (value: unknown): value is JsonScalar =>
  value === null || typeof value === "string" || typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

function invalid(message: string): never {
  throw new ProtocolError("MODEL_INVALID_SCHEMA", message);
}

function assertSlot(slot: unknown, allowedSlots: ReadonlySet<string>, path: string): string {
  if (typeof slot !== "string" || !allowedSlots.has(slot)) invalid(`${path} references an unknown slot`);
  return slot;
}

export function parseActionProposal(value: unknown, _rawInput: string, context: ActionContext): ActionProposal {
  const required = ["kind", "clauseIndex", "primitives", "targetSlots", "conditions", "effects", "perceptionScopes", "unresolvedDependencies"];
  if (!isObject(value) || !exactKeys(value, required, ["durationSeconds"]) || !Number.isSafeInteger(value.clauseIndex) ||
    typeof value.kind !== "string" || !["attempt", "query", "wait", "speech", "none", "invalid"].includes(value.kind) ||
    !Array.isArray(value.primitives) || !Array.isArray(value.targetSlots) || !Array.isArray(value.conditions) ||
    !Array.isArray(value.effects) || !Array.isArray(value.perceptionScopes) || !Array.isArray(value.unresolvedDependencies)) {
    invalid("action proposal has an invalid shape");
  }
  const allowedSlots = new Set(context.slots.map(item => item.slot));
  if (!allowedSlots.has(context.actorSlot)) throw new ProtocolError("INTERNAL_INVARIANT", "actor slot is absent from action context");
  const primitives = value.primitives.map((item, index) => {
    if (typeof item !== "string" || !actionPrimitives.includes(item as ActionPrimitive)) invalid(`primitives[${index}] is invalid`);
    return item as ActionPrimitive;
  });
  if (new Set(primitives).size !== primitives.length) invalid("primitives must not repeat");

  const targetSlots = value.targetSlots.map((slot, index) => assertSlot(slot, allowedSlots, `targetSlots[${index}]`));
  if (new Set(targetSlots).size !== targetSlots.length) invalid("targetSlots must not repeat");

  const conditionKinds = ["fact", "capability", "relation", "reachability"] as const;
  const conditionSources = ["world_slice", "operation_contract"] as const;
  const conditions = value.conditions.map((item, index): ProposedCondition => {
    if (!isObject(item) || !exactKeys(item, ["kind", "subjectSlot", "predicate", "source"], ["objectSlot", "value"]) ||
      typeof item.kind !== "string" || !conditionKinds.includes(item.kind as never) || typeof item.predicate !== "string" ||
      item.predicate === "" || typeof item.source !== "string" || !conditionSources.includes(item.source as never)) {
      invalid(`conditions[${index}] is invalid`);
    }
    if (item.objectSlot !== undefined && item.value !== undefined) invalid(`conditions[${index}] has two objects`);
    const condition: ProposedCondition = {kind: item.kind as ProposedCondition["kind"],
      subjectSlot: assertSlot(item.subjectSlot, allowedSlots, `conditions[${index}].subjectSlot`),
      predicate: item.predicate, source: item.source as ProposedCondition["source"]};
    if (item.objectSlot !== undefined) condition.objectSlot = assertSlot(item.objectSlot, allowedSlots, `conditions[${index}].objectSlot`);
    if (item.value !== undefined) {
      if (!isScalar(item.value)) invalid(`conditions[${index}].value is invalid`);
      condition.value = item.value;
    }
    return condition;
  });
  if (conditions.length !== 0) invalid("model conditions are disabled; trusted rules read world prerequisites");

  const effects = value.effects.map((item, index): ProposedEffect => {
    if (!isObject(item) || !exactKeys(item, ["kind", "subjectSlot", "field", "certainty"], ["objectSlot", "value"]) ||
      typeof item.kind !== "string" || !effectKinds.includes(item.kind as EffectKind) || typeof item.field !== "string" ||
      item.field === "" || (item.certainty !== "required" && item.certainty !== "possible")) invalid(`effects[${index}] is invalid`);
    const effect: ProposedEffect = {kind: item.kind as EffectKind,
      subjectSlot: assertSlot(item.subjectSlot, allowedSlots, `effects[${index}].subjectSlot`), field: item.field,
      certainty: item.certainty};
    if (item.objectSlot !== undefined) effect.objectSlot = assertSlot(item.objectSlot, allowedSlots, `effects[${index}].objectSlot`);
    if (item.value !== undefined) {
      if (!isScalar(item.value)) invalid(`effects[${index}].value is invalid`);
      effect.value = item.value;
    }
    return effect;
  });

  const perceptionScopes = value.perceptionScopes.map((item, index): ProposedPerceptionScope => {
    if (!isObject(item) || !exactKeys(item, ["modality", "originSlot", "horizon", "targetSlots"]) ||
      typeof item.modality !== "string" || !perceptionModalities.includes(item.modality as PerceptionModality) ||
      !["ambient", "directional", "object", "body"].includes(item.horizon as string) || !Array.isArray(item.targetSlots)) {
      invalid(`perceptionScopes[${index}] is invalid`);
    }
    return {modality: item.modality as PerceptionModality,
      originSlot: assertSlot(item.originSlot, allowedSlots, `perceptionScopes[${index}].originSlot`),
      horizon: item.horizon as ProposedPerceptionScope["horizon"],
      targetSlots: item.targetSlots.map((slot, slotIndex) => assertSlot(slot, allowedSlots, `perceptionScopes[${index}].targetSlots[${slotIndex}]`))};
  });

  const dependencies = value.unresolvedDependencies.map((item, index): ProposedDependency => {
    if (!isObject(item) || !exactKeys(item, ["kind", "reason"], ["slot"]) ||
      !["binding", "fact", "capability", "constraint"].includes(item.kind as string) ||
      typeof item.reason !== "string" || item.reason === "") invalid(`unresolvedDependencies[${index}] is invalid`);
    const dependency: ProposedDependency = {kind: item.kind as ProposedDependency["kind"], reason: item.reason};
    if (item.slot !== undefined) dependency.slot = assertSlot(item.slot, allowedSlots, `unresolvedDependencies[${index}].slot`);
    return dependency;
  });

  if (primitives.includes("perceive") && perceptionScopes.length === 0) invalid("perceive requires a perception scope");
  if (!primitives.includes("perceive") && perceptionScopes.length !== 0) invalid("perception scope requires perceive");
  for (const scope of perceptionScopes) {
    if (scope.horizon === "ambient" && scope.originSlot !== context.actorSlot) invalid("ambient perception must originate at the actor");
    if (scope.horizon === "ambient" && scope.targetSlots.length !== 0) invalid("ambient perception must not invent a target");
  }
  for (const effect of effects) {
    if (effect.kind === "relation" && !context.allowedRelations.includes(effect.field)) invalid("relation effect is outside the allowed vocabulary");
    const requiredPrimitive: Readonly<Record<EffectKind, readonly ActionPrimitive[]>> = {
      observation_scope: ["perceive"], orientation: ["orient"], placement: ["move", "place"],
      contact: ["contact"], force: ["apply_force"], holding: ["hold", "release"],
      relation: ["change_relation", "place"], signal: ["communicate"], time: ["wait"]
    };
    if (!requiredPrimitive[effect.kind].some(primitive => primitives.includes(primitive))) {
      invalid(`${effect.kind} effect lacks its action primitive`);
    }
    if (effect.kind !== "observation_scope" && effect.certainty === "required") {
      invalid("a model cannot require a world-changing effect");
    }
  }
  const result: ActionProposal = {kind: value.kind as ActionProposal["kind"], clauseIndex: value.clauseIndex as number, primitives, targetSlots, conditions, effects,
    perceptionScopes, unresolvedDependencies: dependencies};
  if (value.durationSeconds !== undefined) {
    if (typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0 ||
      value.durationSeconds > 3600) invalid("durationSeconds is invalid");
    result.durationSeconds = value.durationSeconds;
  }
  if (primitives.includes("wait") && (result.durationSeconds === undefined || result.durationSeconds <= 0)) {
    invalid("wait requires a positive duration");
  }
  if (result.kind === "wait" && !primitives.includes("wait")) invalid("wait kind requires wait primitive");
  if (result.kind === "query" && !primitives.includes("perceive")) invalid("query kind requires perceive primitive");
  if ((result.kind === "none" || result.kind === "invalid") &&
      (primitives.length !== 0 || targetSlots.length !== 0 || effects.length !== 0 || perceptionScopes.length !== 0)) {
    invalid("none and invalid kinds must not contain executable candidates");
  }
  return result;
}

export function resolvePerceptionScope(proposal: ActionProposal, context: ActionContext): ProposedPerceptionScope | undefined {
  if (!proposal.primitives.includes("perceive")) return undefined;
  const scope = proposal.perceptionScopes[0];
  if (scope === undefined) invalid("perceive requires a scope");
  if (scope.horizon === "ambient" && scope.originSlot === context.actorSlot && scope.targetSlots.length === 0) return scope;
  return scope;
}
