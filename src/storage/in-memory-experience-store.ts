import type {EntityId, ExperienceCommit, Height, SettlementCommit} from "../domain/types.js";
import {canonicalJson} from "../protocol/canonical-json.js";
import {sha256Canonical} from "../protocol/canonical-json.js";
import {ProtocolError} from "../protocol/errors.js";

export class InMemoryExperienceStore {
  readonly commits: ExperienceCommit[] = [];

  async append(commit: ExperienceCommit): Promise<"committed" | "idempotent"> {
    const existing = this.commits.find(item => item.experienceId === commit.experienceId);
    if (existing !== undefined) {
      if (canonicalJson(existing) === canonicalJson(commit)) return "idempotent";
      throw new ProtocolError("REVISION_CONFLICT", "experience identity has different content");
    }
    const latest = this.commits.filter(item => item.observerId === commit.observerId).at(-1);
    const expectedParent = latest?.epistemicRoot ?? "genesis";
    if (commit.parentEpistemicRoot !== expectedParent) {
      throw new ProtocolError("REVISION_CONFLICT", "epistemic root is discontinuous");
    }
    if (commit.epistemicRoot !== computeEpistemicRoot(commit)) {
      throw new ProtocolError("REPLAY_INVALID", "epistemic root does not match experience content");
    }
    this.commits.push(structuredClone(commit));
    return "committed";
  }

  async *readObserver(observerId: EntityId): AsyncIterable<ExperienceCommit> {
    for (const commit of this.commits) {
      if (commit.observerId === observerId) yield structuredClone(commit);
    }
  }

  async latestRoot(observerId: EntityId): Promise<string> {
    return this.commits.filter(item => item.observerId === observerId).at(-1)?.epistemicRoot ?? "genesis";
  }

  pending(commits: readonly SettlementCommit[], observerId: EntityId, from: Height = 1): SettlementCommit[] {
    const completed = new Set(this.commits.filter(item => item.observerId === observerId).map(item => item.sourceHeight));
    return commits.filter(commit => commit.height >= from &&
      commit.observationSeeds.some(seed => seed.observerId === observerId) && !completed.has(commit.height));
  }
}

export function computeEpistemicRoot(commit: Omit<ExperienceCommit, "epistemicRoot" | "committedAt">): string {
  return sha256Canonical({
    experienceId: commit.experienceId,
    sourceHeight: commit.sourceHeight,
    observerId: commit.observerId,
    observations: commit.observations,
    evidence: commit.evidence,
    acquisitions: commit.acquisitions,
    parentEpistemicRoot: commit.parentEpistemicRoot
  });
}
