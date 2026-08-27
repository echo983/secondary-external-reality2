import {randomUUID} from "node:crypto";
import type {AttemptAudit, RawInput} from "../audit/attempt-audit.js";
import {InMemoryAuditStore} from "../audit/attempt-audit.js";
import type {EntityId} from "../domain/types.js";
import type {ProposalModel} from "../ai/model-adapter.js";
import {requestInputProposal} from "../ai/model-adapter.js";
import type {FixtureEntity} from "../world/door-fixture.js";
import type {InputProposal} from "./input.js";
import {ProtocolError} from "./errors.js";

export interface GroundingDecision {
  executablePrefix: readonly number[];
  stoppedAtClause?: number;
  boundaryCode?: "TARGET_UNGROUNDED";
}

export function screenGroundedPrefix(
  proposal: InputProposal,
  actorId: EntityId,
  entities: readonly FixtureEntity[]
): GroundingDecision {
  const executablePrefix: number[] = [];
  for (const clause of [...proposal.clauses].sort((a, b) => a.clauseIndex - b.clauseIndex)) {
    const grounded = clause.targetMentions.every(mention =>
      entities.filter(entity => entity.aliases.includes(mention.text) && entity.perceivableBy.includes(actorId)).length === 1
    );
    if (!grounded) return {executablePrefix, stoppedAtClause: clause.clauseIndex, boundaryCode: "TARGET_UNGROUNDED"};
    executablePrefix.push(clause.clauseIndex);
  }
  return {executablePrefix};
}

export async function constituteAndScreen(
  rawInput: RawInput,
  model: ProposalModel,
  entities: readonly FixtureEntity[],
  auditStore: InMemoryAuditStore
): Promise<{proposal?: InputProposal; decision?: GroundingDecision; audit: AttemptAudit; heightCreated: false}> {
  const base = {attemptId: randomUUID(), rawInput};
  try {
    const proposal = await requestInputProposal(model, rawInput.text);
    const decision = screenGroundedPrefix(proposal, rawInput.actorId, entities);
    const telemetry = model.telemetry?.();
    const audit: AttemptAudit = decision.boundaryCode === undefined
      ? {...base, proposal, status: "constituted", ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})}
      : {...base, proposal, status: "boundary", failureCode: decision.boundaryCode,
        ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})};
    await auditStore.appendAttempt(audit);
    return {proposal, decision, audit, heightCreated: false};
  } catch (cause) {
    const error = cause instanceof ProtocolError ? cause : new ProtocolError("INTERNAL_INVARIANT", "grounding failed", {cause});
    const telemetry = model.telemetry?.();
    const audit: AttemptAudit = {...base, status: "failed", failureCode: error.code,
      ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})};
    await auditStore.appendAttempt(audit);
    return {audit, heightCreated: false};
  }
}
