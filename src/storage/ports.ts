import type {AttemptAudit} from "../audit/attempt-audit.js";
import type {EntityId, ExperienceCommit, SettlementCommit} from "../domain/types.js";

export interface WorldCommitPort {
  append(commit: SettlementCommit): Promise<"committed" | "idempotent">;
}

export interface ExperiencePort {
  append(commit: ExperienceCommit): Promise<"committed" | "idempotent">;
  latestRoot(observerId: EntityId): Promise<string>;
}

export interface AuditPort {
  appendAttempt(audit: AttemptAudit): Promise<void>;
}
