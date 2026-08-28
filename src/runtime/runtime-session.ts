import type {ProposalModel} from "../ai/model-adapter.js";
import {requestInputProposal} from "../ai/model-adapter.js";
import type {AttemptAudit, RawInput} from "../audit/attempt-audit.js";
import type {WorldSnapshot} from "../domain/types.js";
import {renderApprovedPacket, renderWaitPacket} from "../presentation/deterministic-renderer.js";
import {compileInput} from "../protocol/compiler.js";
import {ProtocolError, type ProtocolErrorCode} from "../protocol/errors.js";
import {screenGroundedPrefix} from "../protocol/grounding-gate.js";
import type {AuditPort, ExperiencePort, WorldCommitPort} from "../storage/ports.js";
import type {DemoFixture} from "../world/demo-fixture.js";
import {randomUUID} from "node:crypto";
import {settleOpenDoor} from "../world/open-door.js";
import {materializeWaitExperience, settleWait} from "../world/wait-kettle.js";
import {projectCurrentScene, type PerceptionMode} from "../perception/current-scene.js";
import {detectPerceptionRequest} from "../protocol/perception-request.js";
import {detectActivePerceptionIntent} from "../protocol/active-perception-intent.js";
import {renderActivePerceptionPacket, settleActivePerception} from "../world/active-perception.js";

export type SessionResult =
  | {kind: "world"; height: number; text: string}
  | {kind: "query"; height: number; text: string}
  | {kind: "none"; height: number; text: string}
  | {kind: "boundary"; height: number; code: ProtocolErrorCode; text: string};

export interface RuntimeSessionOptions {
  sessionId: string;
  actorId: string;
  fixture: DemoFixture;
  model: ProposalModel;
  worldStore: WorldCommitPort;
  experienceStore: ExperiencePort;
  auditStore: AuditPort;
  initialSnapshot?: WorldSnapshot;
  now?: () => Date;
}

const boundaryText: Partial<Record<ProtocolErrorCode, string>> = {
  TARGET_UNGROUNDED: "这个目标还没有在当前可接触的世界中落地。",
  CAPABILITY_UNSUPPORTED: "当前 Demo 还不支持这种行动。",
  MODEL_TIMEOUT: "语言解析服务暂时没有及时响应，世界没有变化。",
  MODEL_NO_CONTENT: "语言解析没有产生可用结果，世界没有变化。",
  MODEL_INVALID_SCHEMA: "语言解析结果不符合协议，世界没有变化。",
  MODEL_CAPACITY: "语言解析服务暂时繁忙，世界没有变化。",
  INPUT_INVALID: "这次输入没有形成可执行的行动。"
};

export class RuntimeSession {
  private snapshot: WorldSnapshot;
  private attemptSequence = 0;
  private readonly now: () => Date;

  constructor(private readonly options: RuntimeSessionOptions) {
    this.snapshot = options.initialSnapshot ?? options.fixture.genesis;
    this.now = options.now ?? (() => new Date());
  }

  currentSnapshot(): WorldSnapshot { return structuredClone(this.snapshot); }

  observe(mode: PerceptionMode = "ambient"): SessionResult {
    const projected = projectCurrentScene(this.snapshot, this.options.fixture, this.options.actorId, mode);
    return {kind: "query", height: this.snapshot.height, text: projected.text};
  }

  private async audit(rawInput: RawInput, attemptId: string, fields: Omit<AttemptAudit, "rawInput" | "attemptId">): Promise<void> {
    await this.options.auditStore.appendAttempt({attemptId, rawInput, ...fields});
  }

  async handle(text: string): Promise<SessionResult> {
    this.attemptSequence += 1;
    const attemptId = `attempt:${this.options.sessionId}:${this.attemptSequence}:${randomUUID()}`;
    const rawInput: RawInput = {sessionId: this.options.sessionId, actorId: this.options.actorId, text,
      receivedAt: this.now().toISOString(), language: /[\u3400-\u9fff]/u.test(text) ? "zh" : "unknown"};
    try {
      const activePerception = detectActivePerceptionIntent(text);
      if (activePerception !== undefined) {
        const settled = await settleActivePerception(this.snapshot, this.options.actorId, activePerception, attemptId,
          this.options.worldStore, this.options.experienceStore, this.now().toISOString());
        this.snapshot = settled.snapshot;
        await this.audit(rawInput, attemptId, {status: "committed", committedHeight: settled.commit.height});
        return {kind: "world", height: settled.commit.height, text: renderActivePerceptionPacket(settled.packet)};
      }
      const perceptionMode = detectPerceptionRequest(text);
      if (perceptionMode !== undefined) {
        const projected = projectCurrentScene(this.snapshot, this.options.fixture, this.options.actorId, perceptionMode);
        await this.audit(rawInput, attemptId, {status: "constituted", observations: projected.observations});
        return {kind: "query", height: this.snapshot.height, text: projected.text};
      }
      const proposal = await requestInputProposal(this.options.model, text);
      const telemetry = this.options.model.telemetry?.();
      if (proposal.kind === "none") {
        await this.audit(rawInput, attemptId, {proposal, status: "boundary", ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
        return {kind: "none", height: this.snapshot.height, text: "没有发生新的世界行动。"};
      }
      const grounding = screenGroundedPrefix(proposal, this.options.actorId, this.options.fixture.entities);
      if (grounding.boundaryCode !== undefined) {
        await this.audit(rawInput, attemptId, {proposal, status: "boundary", failureCode: grounding.boundaryCode,
          ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
        return {kind: "boundary", height: this.snapshot.height, code: grounding.boundaryCode,
          text: boundaryText[grounding.boundaryCode] ?? "世界没有变化。"};
      }
      if (proposal.kind === "query") {
        const open = this.snapshot.facts.find(fact => fact.address === "door:door-1:open" && fact.status === "active")?.value;
        await this.audit(rawInput, attemptId, {proposal, status: "boundary", ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
        return {kind: "query", height: this.snapshot.height, text: open === "true" ? "门现在开着。" : "门现在关着。"};
      }
      const constituted = compileInput(proposal, text, this.options.actorId, this.options.fixture.entities);
      const operation = constituted.clauses[0]?.operation;
      if (operation === "open") {
        const settled = await settleOpenDoor(this.snapshot, constituted, attemptId, this.options.worldStore,
          this.options.experienceStore, this.now().toISOString());
        this.snapshot = settled.snapshot;
        await this.audit(rawInput, attemptId, {proposal, status: "committed", committedHeight: settled.commit.height,
          ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
        return {kind: "world", height: settled.commit.height, text: renderApprovedPacket(settled.packet)};
      }
      if (operation === "wait") {
        const settled = await settleWait(this.snapshot, constituted, attemptId, this.options.worldStore, {}, this.now().toISOString());
        this.snapshot = settled.snapshot;
        const projected = await materializeWaitExperience(settled.commit, this.options.experienceStore, this.now().toISOString());
        await this.audit(rawInput, attemptId, {proposal, status: "committed", committedHeight: settled.commit.height,
          ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
        return {kind: "world", height: settled.commit.height, text: renderWaitPacket(projected.packet)};
      }
      throw new ProtocolError("CAPABILITY_UNSUPPORTED", "no runtime dispatcher for operation");
    } catch (cause) {
      const error = cause instanceof ProtocolError ? cause : new ProtocolError("INTERNAL_INVARIANT", "runtime session failed", {cause});
      const telemetry = this.options.model.telemetry?.();
      await this.audit(rawInput, attemptId, {status: "failed", failureCode: error.code,
        ...(telemetry === undefined ? {} : {modelTelemetry: telemetry})});
      return {kind: "boundary", height: this.snapshot.height, code: error.code,
        text: boundaryText[error.code] ?? "内部一致性检查阻止了这次处理，世界没有变化。"};
    }
  }
}
