import assert from "node:assert/strict";
import test from "node:test";
import {FakeProposalModel, requestInputProposal} from "../src/ai/model-adapter.js";
import {ProtocolError} from "../src/protocol/errors.js";
import {constituteInput} from "../src/protocol/constitute.js";
import {InMemoryAuditStore, type RawInput} from "../src/audit/attempt-audit.js";
import {InMemoryCommitStore} from "../src/storage/in-memory-commit-store.js";

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ProtocolError && error.code === code);
}

test("F01 invalid JSON is rejected", async () => {
  await expectCode(requestInputProposal(new FakeProposalModel({content: "not-json"}), "开门"), "MODEL_INVALID_SCHEMA");
});

test("F02 reasoning without content is rejected", async () => {
  await expectCode(requestInputProposal(new FakeProposalModel({reasoning: "我认为这是开门"}), "开门"), "MODEL_NO_CONTENT");
});

test("F03 model failure becomes timeout boundary", async () => {
  await expectCode(requestInputProposal(new FakeProposalModel(new Error("timeout")), "开门"), "MODEL_TIMEOUT");
});

test("F04 unknown fields and wrong array types are rejected", async () => {
  const unknown = JSON.stringify({kind: "attempt", clauses: [], unsupportedClaims: [], success: true});
  await expectCode(requestInputProposal(new FakeProposalModel({content: unknown}), "开门"), "MODEL_INVALID_SCHEMA");
  const wrongType = JSON.stringify({kind: "attempt", clauses: "open", unsupportedClaims: []});
  await expectCode(requestInputProposal(new FakeProposalModel({content: wrongType}), "开门"), "MODEL_INVALID_SCHEMA");
});

test("F05 spans must refer exactly to raw input", async () => {
  const invented = JSON.stringify({
    kind: "attempt",
    clauses: [{clauseIndex: 0, goalSpan: {text: "拿枪", start: 0, end: 2}, targetMentions: [], modifierSpans: []}],
    unsupportedClaims: []
  });
  await expectCode(requestInputProposal(new FakeProposalModel({content: invented}), "开门"), "MODEL_INVALID_SCHEMA");
});

test("valid source-grounded proposal passes strict parsing", async () => {
  const content = JSON.stringify({
    kind: "attempt",
    clauses: [{clauseIndex: 0, goalSpan: {text: "开门", start: 0, end: 2}, targetMentions: [], modifierSpans: []}],
    unsupportedClaims: []
  });
  const proposal = await requestInputProposal(new FakeProposalModel({content}), "开门");
  assert.equal(proposal.kind, "attempt");
  assert.equal(proposal.clauses[0]?.goalSpan?.text, "开门");
});

test("F01-F05 boundary writes audit but creates no height or commit", async () => {
  const auditStore = new InMemoryAuditStore();
  const commitStore = new InMemoryCommitStore();
  const rawInput: RawInput = {
    sessionId: "session-1",
    actorId: "self",
    text: "开门",
    receivedAt: "2026-08-27T12:00:00Z",
    language: "zh"
  };
  const result = await constituteInput(rawInput, new FakeProposalModel({content: "{"}), auditStore);
  assert.equal(result.heightCreated, false);
  assert.equal(result.audit.failureCode, "MODEL_INVALID_SCHEMA");
  assert.equal(auditStore.attempts.length, 1);
  assert.equal(commitStore.commits.length, 0);
  assert.equal(await commitStore.latest(), null);
});
