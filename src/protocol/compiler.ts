import type {ConstitutedClause, ConstitutedInput, EntityId, JsonScalar} from "../domain/types.js";
import type {FixtureEntity} from "../world/door-fixture.js";
import type {InputProposal, ProposedClause, SourceSpan} from "./input.js";
import {ProtocolError} from "./errors.js";

function bindMention(mention: SourceSpan, actorId: EntityId, entities: readonly FixtureEntity[]): EntityId {
  const matches = entities.filter(entity => entity.aliases.includes(mention.text) && entity.perceivableBy.includes(actorId));
  if (matches.length !== 1) throw new ProtocolError("TARGET_UNGROUNDED", `cannot uniquely bind ${mention.text}`);
  return (matches[0] as FixtureEntity).entityId;
}

function compileClause(clause: ProposedClause, rawInput: string, actorId: EntityId, entities: readonly FixtureEntity[]): ConstitutedClause {
  const goal = clause.goalSpan?.text ?? "";
  const operation = /开|推门/u.test(goal) ? "open" : undefined;
  if (operation === undefined) throw new ProtocolError("CAPABILITY_UNSUPPORTED", "operation is outside the closed registry");
  const modifiers: Record<string, JsonScalar> = {};
  const modifierText = clause.modifierSpans.map(span => span.text).join("|");
  if (/轻|慢/u.test(modifierText)) modifiers.speed = "slow";
  if (/一条缝|缝/u.test(modifierText) || /一条缝|缝/u.test(rawInput)) modifiers.apertureCm = 4;
  if (/别出声|安静|无声/u.test(modifierText)) modifiers.noisePolicy = "minimize";
  const result: ConstitutedClause = {
    clauseIndex: clause.clauseIndex,
    operation,
    goal,
    method: clause.methodSpan?.text ?? goal,
    targetIds: clause.targetMentions.map(mention => bindMention(mention, actorId, entities)),
    modifiers
  };
  if (clause.conditionalOn !== undefined) result.conditionalOn = clause.conditionalOn;
  return result;
}

export function compileInput(
  proposal: InputProposal,
  rawInput: string,
  actorId: EntityId,
  entities: readonly FixtureEntity[]
): ConstitutedInput {
  return {
    kind: proposal.kind,
    actorId,
    clauses: proposal.clauses.map(clause => compileClause(clause, rawInput, actorId, entities)),
    unsupportedClaims: proposal.unsupportedClaims
  };
}
