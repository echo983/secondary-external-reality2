import {ALLOWED_MODEL, type ModelResponse, type ProposalModel} from "./model-adapter.js";
import type {SourceSpan} from "../protocol/input.js";
import type {ActionContext} from "../protocol/action-proposal.js";

function span(input: string, text: string, from = 0): SourceSpan {
  const start = input.indexOf(text, from);
  if (start < 0) throw new Error(`local parser could not find source text: ${text}`);
  return {text, start, end: start + text.length};
}

export class LocalDemoProposalModel implements ProposalModel {
  readonly model = ALLOWED_MODEL;

  async proposeAction(input: string, clauseIndex: number, context: ActionContext): Promise<ModelResponse> {
    const empty = (kind: "none" | "invalid") => ({kind, clauseIndex, primitives: [], targetSlots: [], conditions: [],
      effects: [], perceptionScopes: [], unresolvedDependencies: []});
    const trimmed = input.trim();
    if (trimmed === "" || /^(?:…|\.\.\.)+$/u.test(trimmed)) return {content: JSON.stringify(empty("none"))};
    const door = context.slots.find(slot => /门/u.test(slot.label))?.slot;
    const blanket = context.slots.find(slot => /毛毯|毯子/u.test(slot.label))?.slot;
    const bed = context.slots.find(slot => /床/u.test(slot.label))?.slot;
    const hallway = context.slots.find(slot => /走廊/u.test(slot.label))?.slot;
    if (input.includes("枪")) return {content: JSON.stringify({...empty("invalid"), unresolvedDependencies: [
      {kind: "binding", reason: "场景没有已批准的枪对象"}]})};
    const minutes = input.match(/等(?:一|五|(\d+))分钟/u);
    if (minutes !== null) {
      const durationSeconds = minutes[1] !== undefined ? Number(minutes[1]) * 60 : input.includes("一") ? 60 : 300;
      return {content: JSON.stringify({kind: "wait", clauseIndex, primitives: ["wait"], targetSlots: [], conditions: [],
        effects: [{kind: "time", subjectSlot: "actor", field: "elapsed", value: durationSeconds, certainty: "possible"}],
        perceptionScopes: [], durationSeconds, unresolvedDependencies: []})};
    }
    if (door !== undefined && input.includes("门") && /吗|状态|如何|怎样/u.test(input)) {
      return {content: JSON.stringify({kind: "query", clauseIndex, primitives: ["perceive"], targetSlots: [door], conditions: [],
        effects: [{kind: "observation_scope", subjectSlot: "actor", field: "vision", certainty: "required"}],
        perceptionScopes: [{modality: "vision", originSlot: "actor", horizon: "object", targetSlots: [door]}], unresolvedDependencies: []})};
    }
    if (door !== undefined && /推|开|顶|挤/u.test(input) && input.includes("门")) {
      const apertureCm = /一条缝|门缝/u.test(input) ? 4 : 80;
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "apply_force", "change_relation"],
        targetSlots: [door], conditions: [], effects: [
          {kind: "force", subjectSlot: "actor", field: "toward", objectSlot: door, certainty: "possible"},
          {kind: "relation", subjectSlot: door, field: "open", value: true, certainty: "possible"},
          {kind: "relation", subjectSlot: door, field: "aperture_cm", value: apertureCm, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && bed !== undefined && /拿|拾|捡|抓/u.test(input) && /放|搁|摆/u.test(input) && /床/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "hold", "place"], targetSlots: [blanket, bed],
        conditions: [], effects: [
          {kind: "holding", subjectSlot: blanket, field: "held_by", objectSlot: "actor", certainty: "possible"},
          {kind: "placement", subjectSlot: blanket, field: "at", objectSlot: bed, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && /拿|拾|捡|抓/u.test(input) && /毛毯|毯子/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "hold"], targetSlots: [blanket],
        conditions: [], effects: [{kind: "holding", subjectSlot: blanket, field: "held_by", objectSlot: "actor", certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && /松开|放下|撒手/u.test(input) && /毛毯|毯子/u.test(input) && !/床/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["release"], targetSlots: [blanket],
        conditions: [], effects: [{kind: "holding", subjectSlot: blanket, field: "held_by", value: false, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && door !== undefined && /拖|拉/u.test(input) && /毛毯|毯子/u.test(input) && /门/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "move", "place"],
        targetSlots: [blanket, door], conditions: [], effects: [
          {kind: "placement", subjectSlot: blanket, field: "at", objectSlot: door, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && door !== undefined && /塞|挡|堵/u.test(input) && /毛毯|毯子/u.test(input) && /门|门缝/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["contact", "hold", "place", "change_relation"],
        targetSlots: [blanket, door], conditions: [], effects: [
          {kind: "holding", subjectSlot: blanket, field: "held_by", objectSlot: "actor", certainty: "possible"},
          {kind: "placement", subjectSlot: blanket, field: "under_gap", objectSlot: door, certainty: "possible"},
          {kind: "relation", subjectSlot: blanket, field: "occludes", objectSlot: door, value: true, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (blanket !== undefined && bed !== undefined && /放|搁|摆/u.test(input) && /床/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["place", "change_relation"], targetSlots: [blanket, bed],
        conditions: [], effects: [{kind: "placement", subjectSlot: blanket, field: "at", objectSlot: bed, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (hallway !== undefined && /走|去|移动|穿过/u.test(input) && /走廊|门外/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["move"], targetSlots: [hallway], conditions: [],
        effects: [{kind: "placement", subjectSlot: "actor", field: "at", objectSlot: hallway, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    if (door !== undefined && /转身|朝向|面向/u.test(input) && /门/u.test(input)) {
      return {content: JSON.stringify({kind: "attempt", clauseIndex, primitives: ["orient"], targetSlots: [door], conditions: [],
        effects: [{kind: "orientation", subjectSlot: "actor", field: "toward", objectSlot: door, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    const speech = input.match(/(?:说|喊|叫)(?:一声|道)?[：:“"]?([^”"]+)[”"]?$/u)?.[1]?.trim();
    if (speech !== undefined && speech !== "") {
      return {content: JSON.stringify({kind: "speech", clauseIndex, primitives: ["communicate"], targetSlots: [], conditions: [],
        effects: [{kind: "signal", subjectSlot: "actor", field: "speech", value: speech, certainty: "possible"}],
        perceptionScopes: [], unresolvedDependencies: []})};
    }
    return {content: JSON.stringify(empty("invalid"))};
  }

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
