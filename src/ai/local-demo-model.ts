import {ALLOWED_MODEL, type ModelResponse, type ProposalModel} from "./model-adapter.js";
import type {SourceSpan} from "../protocol/input.js";

function span(input: string, text: string, from = 0): SourceSpan {
  const start = input.indexOf(text, from);
  if (start < 0) throw new Error(`local parser could not find source text: ${text}`);
  return {text, start, end: start + text.length};
}

export class LocalDemoProposalModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;

  async propose(input: string): Promise<ModelResponse> {
    const trimmed = input.trim();
    if (trimmed === "" || /^(?:…|\.\.\.)+$/u.test(trimmed)) {
      return {content: JSON.stringify({kind: "none", clauses: [], unsupportedClaims: []})};
    }
    if (input.includes("枪")) {
      const claimText = input.includes("抽屉里一定有枪") ? "抽屉里一定有枪" : "枪";
      const goalText = input.includes("把枪拿出来") ? "把枪拿出来" : "枪";
      const gunStart = input.lastIndexOf("枪");
      return {content: JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0, goalSpan: span(input, goalText),
        targetMentions: [{text: "枪", start: gunStart, end: gunStart + 1}], modifierSpans: []}],
        unsupportedClaims: [span(input, claimText)]})};
    }
    const waitText = input.match(/等(?:五|\d+)分钟/u)?.[0];
    if (waitText !== undefined) {
      return {content: JSON.stringify({kind: "wait", clauses: [{clauseIndex: 0, goalSpan: span(input, waitText),
        targetMentions: [], modifierSpans: []}], unsupportedClaims: []})};
    }
    if (input.includes("门") && /吗|状态|如何|怎样/u.test(input)) {
      return {content: JSON.stringify({kind: "query", clauses: [{clauseIndex: 0, goalSpan: span(input, input.replace(/[？?]$/u, "")),
        targetMentions: [span(input, "门")], modifierSpans: []}], unsupportedClaims: []})};
    }
    const goalText = input.includes("推门") ? "推门" : input.includes("开门") ? "开门" : undefined;
    if (goalText !== undefined) {
      const modifierTexts = ["轻轻", "慢慢", "一条缝", "只开一条缝", "别出声", "安静"]
        .filter(value => input.includes(value));
      return {content: JSON.stringify({kind: "attempt", clauses: [{clauseIndex: 0, goalSpan: span(input, goalText),
        targetMentions: [span(input, "门")], modifierSpans: modifierTexts.map(value => span(input, value))}], unsupportedClaims: []})};
    }
    return {content: JSON.stringify({kind: "invalid", clauses: [], unsupportedClaims: []})};
  }
}
