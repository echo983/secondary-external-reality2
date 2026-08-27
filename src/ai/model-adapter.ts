import {ProtocolError} from "../protocol/errors.js";
import {parseInputProposal, type InputProposal} from "../protocol/input.js";

export const ALLOWED_MODEL = "@cf/qwen/qwen3.8-27b" as const;

export interface ModelResponse {
  content?: string;
  reasoning?: string;
}

export interface ProposalModel {
  readonly model: typeof ALLOWED_MODEL;
  propose(rawInput: string): Promise<ModelResponse>;
}

export async function requestInputProposal(model: ProposalModel, rawInput: string): Promise<InputProposal> {
  if (model.model !== ALLOWED_MODEL) throw new ProtocolError("INTERNAL_INVARIANT", "model is not allowed");
  let response: ModelResponse;
  try {
    response = await model.propose(rawInput);
  } catch (cause) {
    if (cause instanceof ProtocolError) throw cause;
    throw new ProtocolError("MODEL_TIMEOUT", "model request failed or timed out", {cause});
  }
  if (typeof response.content !== "string" || response.content.trim() === "") {
    throw new ProtocolError("MODEL_NO_CONTENT", "reasoning is not protocol content");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch (cause) {
    throw new ProtocolError("MODEL_INVALID_SCHEMA", "model content is not JSON", {cause});
  }
  return parseInputProposal(parsed, rawInput);
}

export class FakeProposalModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;
  constructor(private readonly result: ModelResponse | Error) {}
  async propose(_rawInput: string): Promise<ModelResponse> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}
