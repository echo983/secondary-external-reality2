import {randomUUID} from "node:crypto";
import {type AttemptAudit, type RawInput, InMemoryAuditStore} from "../audit/attempt-audit.js";
import type {InputProposal} from "./input.js";
import {ProtocolError} from "./errors.js";
import type {ProposalModel} from "../ai/model-adapter.js";
import {requestInputProposal} from "../ai/model-adapter.js";

export interface ConstitutionResult {
  proposal?: InputProposal;
  audit: AttemptAudit;
  heightCreated: false;
}

export async function constituteInput(
  rawInput: RawInput,
  model: ProposalModel,
  auditStore: InMemoryAuditStore
): Promise<ConstitutionResult> {
  const base = {attemptId: randomUUID(), rawInput};
  try {
    const proposal = await requestInputProposal(model, rawInput.text);
    const telemetry = model.telemetry?.();
    const audit: AttemptAudit = {...base, proposal, status: "constituted", ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})};
    await auditStore.appendAttempt(audit);
    return {proposal, audit, heightCreated: false};
  } catch (error) {
    const failure = error instanceof ProtocolError
      ? error
      : new ProtocolError("INTERNAL_INVARIANT", "unexpected constitution failure", {cause: error});
    const telemetry = model.telemetry?.();
    const audit: AttemptAudit = {...base, status: "failed", failureCode: failure.code,
      ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})};
    await auditStore.appendAttempt(audit);
    return {audit, heightCreated: false};
  }
}
