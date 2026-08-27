import Database from "better-sqlite3";
import type {AttemptAudit} from "../audit/attempt-audit.js";
import type {EntityId, ExperienceCommit, Height, SettlementCommit} from "../domain/types.js";
import {canonicalJson} from "../protocol/canonical-json.js";
import {ProtocolError} from "../protocol/errors.js";
import {computeEpistemicRoot} from "./in-memory-experience-store.js";

interface JsonRow {json: string}

export class SqliteRuntimeStore {
  private readonly database: Database.Database;

  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS world_commits (
        height INTEGER PRIMARY KEY,
        parent_height INTEGER NOT NULL,
        parent_state_root TEXT NOT NULL,
        state_root TEXT NOT NULL,
        json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS experience_commits (
        experience_id TEXT PRIMARY KEY,
        source_height INTEGER NOT NULL,
        observer_id TEXT NOT NULL,
        parent_epistemic_root TEXT NOT NULL,
        epistemic_root TEXT NOT NULL,
        json TEXT NOT NULL,
        UNIQUE(observer_id, source_height),
        FOREIGN KEY(source_height) REFERENCES world_commits(height)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS experience_observer_height
        ON experience_commits(observer_id, source_height);
      CREATE TABLE IF NOT EXISTS attempt_audit (
        attempt_id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL,
        status TEXT NOT NULL,
        json TEXT NOT NULL
      ) STRICT;
    `);
  }

  close(): void { this.database.close(); }

  latest(): SettlementCommit | null {
    const row = this.database.prepare("SELECT json FROM world_commits ORDER BY height DESC LIMIT 1").get() as JsonRow | undefined;
    return row === undefined ? null : JSON.parse(row.json) as SettlementCommit;
  }

  appendWorld(commit: SettlementCommit): "committed" | "idempotent" {
    return this.database.transaction(() => {
      const existing = this.database.prepare("SELECT json FROM world_commits WHERE height = ?").get(commit.height) as JsonRow | undefined;
      const json = canonicalJson(commit);
      if (existing !== undefined) {
        if (existing.json === json) return "idempotent";
        throw new ProtocolError("REVISION_CONFLICT", "height already has different content");
      }
      const latest = this.latest();
      if (latest !== null && (commit.height !== latest.height + 1 || commit.parentHeight !== latest.height ||
          commit.parentStateRoot !== latest.stateRoot)) {
        throw new ProtocolError("REVISION_CONFLICT", "commit does not extend latest height");
      }
      if (latest === null && commit.height !== commit.parentHeight + 1) {
        throw new ProtocolError("REVISION_CONFLICT", "first commit height is invalid");
      }
      this.database.prepare(`INSERT INTO world_commits
        (height, parent_height, parent_state_root, state_root, json) VALUES (?, ?, ?, ?, ?)`)
        .run(commit.height, commit.parentHeight, commit.parentStateRoot, commit.stateRoot, json);
      return "committed";
    })();
  }

  readWorld(from: Height, to = Number.MAX_SAFE_INTEGER): SettlementCommit[] {
    const rows = this.database.prepare("SELECT json FROM world_commits WHERE height BETWEEN ? AND ? ORDER BY height")
      .all(from, to) as JsonRow[];
    return rows.map(row => JSON.parse(row.json) as SettlementCommit);
  }

  appendExperience(commit: ExperienceCommit): "committed" | "idempotent" {
    return this.database.transaction(() => {
      const existing = this.database.prepare("SELECT json FROM experience_commits WHERE experience_id = ?")
        .get(commit.experienceId) as JsonRow | undefined;
      const json = canonicalJson(commit);
      if (existing !== undefined) {
        if (existing.json === json) return "idempotent";
        throw new ProtocolError("REVISION_CONFLICT", "experience identity has different content");
      }
      const latest = this.database.prepare("SELECT epistemic_root FROM experience_commits WHERE observer_id = ? ORDER BY source_height DESC LIMIT 1")
        .get(commit.observerId) as {epistemic_root: string} | undefined;
      if (commit.parentEpistemicRoot !== (latest?.epistemic_root ?? "genesis")) {
        throw new ProtocolError("REVISION_CONFLICT", "epistemic root is discontinuous");
      }
      if (commit.epistemicRoot !== computeEpistemicRoot(commit)) {
        throw new ProtocolError("REPLAY_INVALID", "epistemic root does not match experience content");
      }
      this.database.prepare(`INSERT INTO experience_commits
        (experience_id, source_height, observer_id, parent_epistemic_root, epistemic_root, json)
        VALUES (?, ?, ?, ?, ?, ?)`).run(commit.experienceId, commit.sourceHeight, commit.observerId,
        commit.parentEpistemicRoot, commit.epistemicRoot, json);
      return "committed";
    })();
  }

  pending(observerId: EntityId, from: Height = 1): SettlementCommit[] {
    return this.readWorld(from).filter(commit => commit.observationSeeds.some(seed => seed.observerId === observerId) &&
      this.database.prepare("SELECT 1 FROM experience_commits WHERE observer_id = ? AND source_height = ?")
        .get(observerId, commit.height) === undefined);
  }

  appendAttempt(audit: AttemptAudit): void {
    const json = canonicalJson(audit);
    this.database.prepare(`INSERT INTO attempt_audit (attempt_id, received_at, status, json) VALUES (?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO UPDATE SET status=excluded.status, json=excluded.json`)
      .run(audit.attemptId, audit.rawInput.receivedAt, audit.status, json);
  }

  exportJsonl(): string {
    const lines: string[] = [];
    for (const row of this.database.prepare("SELECT json FROM world_commits ORDER BY height").all() as JsonRow[]) lines.push(row.json);
    for (const row of this.database.prepare("SELECT json FROM experience_commits ORDER BY observer_id, source_height").all() as JsonRow[]) lines.push(row.json);
    for (const row of this.database.prepare("SELECT json FROM attempt_audit ORDER BY received_at, attempt_id").all() as JsonRow[]) lines.push(row.json);
    return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  }
}
