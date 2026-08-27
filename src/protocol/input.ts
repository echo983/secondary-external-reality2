import {ProtocolError} from "./errors.js";

export const inputKinds = [
  "attempt", "query", "recall", "wait", "speech", "meta", "none",
  "ambiguous", "invalid"
] as const;
export type InputKind = (typeof inputKinds)[number];

export interface SourceSpan {
  text: string;
  start: number;
  end: number;
}

export interface ProposedClause {
  clauseIndex: number;
  goalSpan?: SourceSpan;
  methodSpan?: SourceSpan;
  targetMentions: readonly SourceSpan[];
  modifierSpans: readonly SourceSpan[];
  conditionalOn?: number;
}

export interface InputProposal {
  kind: InputKind;
  clauses: readonly ProposedClause[];
  unsupportedClaims: readonly SourceSpan[];
}

type JsonObject = Record<string, unknown>;
const ownKeysEqual = (value: JsonObject, allowed: readonly string[]): boolean =>
  Object.keys(value).every(key => allowed.includes(key));
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

function invalid(message: string): never {
  throw new ProtocolError("MODEL_INVALID_SCHEMA", message);
}

function parseSpan(value: unknown, rawInput: string, path: string): SourceSpan {
  if (!isObject(value) || !ownKeysEqual(value, ["text", "start", "end"])) invalid(`${path} has unknown fields`);
  if (Object.keys(value).length !== 3 || typeof value.text !== "string" || !isInteger(value.start) || !isInteger(value.end)) {
    invalid(`${path} must contain text/start/end`);
  }
  if (value.start < 0 || value.end <= value.start || value.end > rawInput.length) invalid(`${path} is out of range`);
  if (rawInput.slice(value.start, value.end) !== value.text) invalid(`${path} is not source-grounded`);
  return {text: value.text, start: value.start, end: value.end};
}

export function parseInputProposal(value: unknown, rawInput: string): InputProposal {
  if (!isObject(value) || !ownKeysEqual(value, ["kind", "clauses", "unsupportedClaims"])) invalid("proposal has unknown fields");
  if (Object.keys(value).length !== 3 || typeof value.kind !== "string" || !inputKinds.includes(value.kind as InputKind)) invalid("invalid kind");
  if (!Array.isArray(value.clauses) || !Array.isArray(value.unsupportedClaims)) invalid("clauses and unsupportedClaims must be arrays");

  const clauses = value.clauses.map((item, index): ProposedClause => {
    const allowed = ["clauseIndex", "goalSpan", "methodSpan", "targetMentions", "modifierSpans", "conditionalOn"];
    if (!isObject(item) || !ownKeysEqual(item, allowed) || !isInteger(item.clauseIndex)) invalid(`clauses[${index}] is invalid`);
    if (!Array.isArray(item.targetMentions) || !Array.isArray(item.modifierSpans)) invalid(`clauses[${index}] spans must be arrays`);
    const clause: ProposedClause = {
      clauseIndex: item.clauseIndex,
      targetMentions: item.targetMentions.map((span, i) => parseSpan(span, rawInput, `clauses[${index}].targetMentions[${i}]`)),
      modifierSpans: item.modifierSpans.map((span, i) => parseSpan(span, rawInput, `clauses[${index}].modifierSpans[${i}]`))
    };
    if (item.goalSpan !== undefined) clause.goalSpan = parseSpan(item.goalSpan, rawInput, `clauses[${index}].goalSpan`);
    if (item.methodSpan !== undefined) clause.methodSpan = parseSpan(item.methodSpan, rawInput, `clauses[${index}].methodSpan`);
    if (item.conditionalOn !== undefined) {
      if (!isInteger(item.conditionalOn)) invalid(`clauses[${index}].conditionalOn is invalid`);
      clause.conditionalOn = item.conditionalOn;
    }
    return clause;
  });

  return {
    kind: value.kind as InputKind,
    clauses,
    unsupportedClaims: value.unsupportedClaims.map((span, index) => parseSpan(span, rawInput, `unsupportedClaims[${index}]`))
  };
}
