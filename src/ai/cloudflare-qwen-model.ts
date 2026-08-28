import {performance} from "node:perf_hooks";
import {ALLOWED_MODEL, type ModelResponse, type ModelTelemetry, type ProposalModel} from "./model-adapter.js";
import {INPUT_PROPOSAL_SYSTEM_PROMPT} from "./input-proposal-prompt.js";
import {ACTION_PROPOSAL_JSON_SCHEMA, ACTION_PROPOSAL_SYSTEM_PROMPT, buildActionProposalUserPrompt} from "./action-proposal-prompt.js";
import type {ActionContext} from "../protocol/action-proposal.js";
import {ProtocolError} from "../protocol/errors.js";

interface CloudflareEnvelope {
  success?: boolean;
  errors?: readonly {code?: number; message?: string}[];
  result?: unknown;
}

export interface CloudflareQwenOptions {
  accountId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function extract(body: CloudflareEnvelope): {content?: string; reasoning?: string; finishReason?: string; promptTokens?: number; completionTokens?: number} {
  const result = asRecord(body.result);
  if (typeof body.result === "string") return {content: body.result};
  if (typeof result?.response === "string") return {content: result.response};
  if (result?.response !== undefined && typeof result.response === "object") return {content: JSON.stringify(result.response)};
  const nested = asRecord(result?.result);
  if (typeof nested?.response === "string") return {content: nested.response};
  const choice = Array.isArray(result?.choices) ? asRecord(result.choices[0]) : undefined;
  const message = asRecord(choice?.message);
  const usage = asRecord(result?.usage);
  return {
    ...(typeof message?.content === "string" ? {content: message.content} : {}),
    ...(typeof message?.reasoning === "string" ? {reasoning: message.reasoning} : {}),
    ...(typeof choice?.finish_reason === "string" ? {finishReason: choice.finish_reason} : {}),
    ...(typeof usage?.prompt_tokens === "number" ? {promptTokens: usage.prompt_tokens} : {}),
    ...(typeof usage?.completion_tokens === "number" ? {completionTokens: usage.completion_tokens} : {})
  };
}

export class CloudflareQwenModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;
  lastTelemetry?: ModelTelemetry;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly now: () => Date;

  constructor(private readonly options: CloudflareQwenOptions) {
    if (options.accountId.trim() === "" || options.apiToken.trim() === "") {
      throw new ProtocolError("INTERNAL_INVARIANT", "Cloudflare account and token are required");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.delay = options.delay ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? (() => new Date());
  }

  telemetry(): ModelTelemetry | undefined {
    return this.lastTelemetry === undefined ? undefined : structuredClone(this.lastTelemetry);
  }

  async propose(rawInput: string): Promise<ModelResponse> {
    return this.run(INPUT_PROPOSAL_SYSTEM_PROMPT, rawInput);
  }

  async proposeAction(rawInput: string, clauseIndex: number, context: ActionContext): Promise<ModelResponse> {
    return this.run(ACTION_PROPOSAL_SYSTEM_PROMPT, buildActionProposalUserPrompt(rawInput, clauseIndex, context), true, 1800);
  }

  private async run(systemPrompt: string, userPrompt: string, structured = false, maxCompletionTokens = 2000): Promise<ModelResponse> {
    const startedAt = this.now().toISOString();
    const started = performance.now();
    let attempts = 0;
    try {
      for (attempts = 1; attempts <= 3; attempts += 1) {
        let response: Response;
        try {
          response = await this.fetchImpl(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.options.accountId)}/ai/run/${ALLOWED_MODEL}`,
            {method: "POST", headers: {Authorization: `Bearer ${this.options.apiToken}`, "Content-Type": "application/json"},
              body: JSON.stringify({messages: [{role: "system", content: systemPrompt},
                {role: "user", content: userPrompt}], temperature: 0, reasoning_effort: "low", max_completion_tokens: maxCompletionTokens,
                ...(structured ? {reasoning: {enable_thinking: false},
                  response_format: {type: "json_schema", json_schema: ACTION_PROPOSAL_JSON_SCHEMA}} : {})}),
              signal: AbortSignal.timeout(this.timeoutMs)}
          );
        } catch (cause) {
          throw new ProtocolError("MODEL_TIMEOUT", "Workers AI request failed or timed out", {cause});
        }
        let body: CloudflareEnvelope;
        try { body = await response.json() as CloudflareEnvelope; }
        catch (cause) { throw new ProtocolError("MODEL_INVALID_SCHEMA", "Workers AI returned a non-JSON envelope", {cause}); }
        const capacity = response.status === 429 || body.errors?.some(error => error.code === 3040 || error.code === 7505) === true;
        if (capacity && attempts < 3) { await this.delay(1000 * (2 ** (attempts - 1))); continue; }
        if (capacity) throw new ProtocolError("MODEL_CAPACITY", "Workers AI capacity retry budget exhausted");
        if (!response.ok || body.success === false) {
          const summary = body.errors?.map(error => `${error.code ?? "unknown"}:${error.message ?? "unknown"}`).join("; ") ??
            `HTTP ${response.status}`;
          throw new ProtocolError("INTERNAL_INVARIANT", `Workers AI request was rejected (${summary})`);
        }
        const extracted = extract(body);
        this.lastTelemetry = {model: this.model, startedAt, latencyMs: Math.round(performance.now() - started), attempts,
          ...(extracted.finishReason === undefined ? {} : {finishReason: extracted.finishReason}),
          ...(extracted.promptTokens === undefined ? {} : {promptTokens: extracted.promptTokens}),
          ...(extracted.completionTokens === undefined ? {} : {completionTokens: extracted.completionTokens})};
        return { ...(extracted.content === undefined ? {} : {content: extracted.content}),
          ...(extracted.reasoning === undefined ? {} : {reasoning: extracted.reasoning}) };
      }
      throw new ProtocolError("MODEL_CAPACITY", "Workers AI retry loop exhausted");
    } catch (cause) {
      const error = cause instanceof ProtocolError ? cause : new ProtocolError("INTERNAL_INVARIANT", "unexpected Workers AI failure", {cause});
      this.lastTelemetry = {model: this.model, startedAt, latencyMs: Math.round(performance.now() - started), attempts,
        errorCode: error.code};
      throw error;
    }
  }
}
