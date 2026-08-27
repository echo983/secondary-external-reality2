import type {AttemptId, EntityId, Height} from "../domain/types.js";
import type {InputProposal} from "../protocol/input.js";
import type {ProtocolErrorCode} from "../protocol/errors.js";

export interface RawInput {
  sessionId: string;
  actorId: EntityId;
  text: string;
  receivedAt: string;
  language: "zh" | "en" | "unknown";
}

export interface AttemptAudit {
  attemptId: AttemptId;
  rawInput: RawInput;
  proposal?: InputProposal;
  status: "received" | "constituted" | "boundary" | "failed" | "committed";
  failureCode?: ProtocolErrorCode;
  committedHeight?: Height;
}

export class InMemoryAuditStore {
  readonly attempts: AttemptAudit[] = [];
  async appendAttempt(audit: AttemptAudit): Promise<void> {
    this.attempts.push(structuredClone(audit));
  }
}
