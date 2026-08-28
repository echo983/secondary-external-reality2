import {ProtocolError} from "../protocol/errors.js";
import {parseActionProposal, type ActionContext, type ActionProposal} from "../protocol/action-proposal.js";
import {ALLOWED_MODEL, type ModelResponse, type ModelTelemetry} from "./model-adapter.js";

export interface ActionProposalModel {
  readonly model: typeof ALLOWED_MODEL;
  proposeAction(rawInput: string, clauseIndex: number, context: ActionContext): Promise<ModelResponse>;
  telemetry?(): ModelTelemetry | undefined;
}

export async function requestActionProposal(
  model: ActionProposalModel,
  rawInput: string,
  clauseIndex: number,
  context: ActionContext
): Promise<ActionProposal> {
  if (model.model !== ALLOWED_MODEL) throw new ProtocolError("INTERNAL_INVARIANT", "model is not allowed");
  let response: ModelResponse;
  try {
    response = await model.proposeAction(rawInput, clauseIndex, context);
  } catch (cause) {
    if (cause instanceof ProtocolError) throw cause;
    throw new ProtocolError("MODEL_TIMEOUT", "action proposal request failed or timed out", {cause});
  }
  if (typeof response.content !== "string" || response.content.trim() === "") {
    throw new ProtocolError("MODEL_NO_CONTENT", "reasoning is not action proposal content");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(response.content); }
  catch (cause) { throw new ProtocolError("MODEL_INVALID_SCHEMA", "action proposal content is not JSON", {cause}); }
  return parseActionProposal(parsed, rawInput, context);
}
