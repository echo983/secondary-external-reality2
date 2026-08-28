import assert from "node:assert/strict";
import test from "node:test";
import {requestActionProposal, type ActionProposalModel} from "../src/ai/action-proposal-model.js";
import {ALLOWED_MODEL} from "../src/ai/model-adapter.js";
import type {ActionContext} from "../src/protocol/action-proposal.js";

const context: ActionContext = {actorSlot: "actor", slots: [
  {slot: "actor", kind: "actor", label: "你", perceivable: true, affordances: ["perceive"]}
], allowedRelations: []};

test("strict action model response accepts targetless ambient perception", async () => {
  const model: ActionProposalModel = {model: ALLOWED_MODEL, proposeAction: async () => ({content: JSON.stringify({
    kind: "query", clauseIndex: 0, primitives: ["perceive"], targetSlots: [], conditions: [],
    effects: [{kind: "observation_scope", subjectSlot: "actor", field: "vision", certainty: "required"}],
    perceptionScopes: [{modality: "vision", originSlot: "actor", horizon: "ambient", targetSlots: []}],
    unresolvedDependencies: []
  })})};
  const result = await requestActionProposal(model, "看看四周", 0, context);
  assert.equal(result.perceptionScopes[0]?.horizon, "ambient");
});
