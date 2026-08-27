import type {SettlementCommit, WorldSnapshot} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {applyCommit} from "./materialized-world.js";

export interface ReplayIssue {
  height: number;
  code: string;
  message: string;
}

export function replayStrict(genesis: WorldSnapshot, commits: readonly SettlementCommit[]): WorldSnapshot {
  return commits.reduce((snapshot, commit) => applyCommit(snapshot, commit), genesis);
}

export function replayDiagnostic(genesis: WorldSnapshot, commits: readonly SettlementCommit[]): {
  snapshot: WorldSnapshot;
  issues: readonly ReplayIssue[];
} {
  let snapshot = genesis;
  const issues: ReplayIssue[] = [];
  for (const commit of commits) {
    try {
      snapshot = applyCommit(snapshot, commit);
    } catch (error) {
      issues.push({
        height: commit.height,
        code: error instanceof ProtocolError ? error.code : "INTERNAL_INVARIANT",
        message: error instanceof Error ? error.message : String(error)
      });
      break;
    }
  }
  return {snapshot, issues};
}
