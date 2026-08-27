import type {Height, SettlementCommit} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";

export class InMemoryCommitStore {
  readonly commits: SettlementCommit[] = [];

  async latest(): Promise<SettlementCommit | null> {
    return this.commits.at(-1) ?? null;
  }

  async append(commit: SettlementCommit): Promise<"committed" | "idempotent"> {
    const existing = this.commits.find(item => item.height === commit.height);
    if (existing !== undefined) {
      if (JSON.stringify(existing) === JSON.stringify(commit)) return "idempotent";
      throw new ProtocolError("REVISION_CONFLICT", "height already has different content");
    }
    this.commits.push(structuredClone(commit));
    return "committed";
  }

  async *readRange(from: Height, to = Number.MAX_SAFE_INTEGER): AsyncIterable<SettlementCommit> {
    for (const commit of this.commits) {
      if (commit.height >= from && commit.height <= to) yield structuredClone(commit);
    }
  }
}
