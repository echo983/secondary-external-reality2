import type {Height, SettlementCommit} from "../domain/types.js";
import {ProtocolError} from "../protocol/errors.js";
import {canonicalJson} from "../protocol/canonical-json.js";

export class InMemoryCommitStore {
  readonly commits: SettlementCommit[] = [];

  async latest(): Promise<SettlementCommit | null> {
    const commit = this.commits.at(-1);
    return commit === undefined ? null : structuredClone(commit);
  }

  async append(commit: SettlementCommit): Promise<"committed" | "idempotent"> {
    const existing = this.commits.find(item => item.height === commit.height);
    if (existing !== undefined) {
      if (canonicalJson(existing) === canonicalJson(commit)) return "idempotent";
      throw new ProtocolError("REVISION_CONFLICT", "height already has different content");
    }
    const latest = this.commits.at(-1);
    if (latest !== undefined && (commit.height !== latest.height + 1 || commit.parentHeight !== latest.height ||
        commit.parentStateRoot !== latest.stateRoot)) {
      throw new ProtocolError("REVISION_CONFLICT", "commit does not extend latest height");
    }
    if (latest === undefined && commit.height !== commit.parentHeight + 1) {
      throw new ProtocolError("REVISION_CONFLICT", "first commit height is invalid");
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
