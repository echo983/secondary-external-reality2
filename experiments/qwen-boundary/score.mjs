import {readFile, writeFile} from "node:fs/promises";
import {cases, allCases} from "./cases.mjs";

const resultUrl = new URL("./results/latest-full.json", import.meta.url);
const report = JSON.parse(await readFile(resultUrl, "utf8"));
const byId = new Map(allCases.map(test => [test.id, test]));

function textOf(result) {
  return JSON.stringify(result.parsed ?? result.raw ?? "").toLowerCase();
}

function shapeValid(result) {
  if (!result.parsed || Array.isArray(result.parsed) || typeof result.parsed !== "object") return false;
  const keys = Object.keys(result.parsed).sort();
  const expected = {
    observation: ["observations", "presentation_zh", "sensations", "withheld_inferences"],
    attempt: ["goal", "input_kind", "method", "proposed_world_facts", "unsupported_claims"],
    collapse: ["blocking_dependency", "causal_radius", "collapse_required", "left_unresolved", "proposed_constraints"],
    paraphrase: ["goal", "kind", "method", "modifiers", "targets"]
  }[result.suite].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) return false;
  const value = result.parsed;
  if (result.suite === "observation") {
    return Array.isArray(value.sensations) && Array.isArray(value.observations)
      && Array.isArray(value.withheld_inferences) && typeof value.presentation_zh === "string";
  }
  if (result.suite === "attempt") {
    return typeof value.input_kind === "string" && typeof value.goal === "string"
      && typeof value.method === "string" && Array.isArray(value.unsupported_claims)
      && Array.isArray(value.proposed_world_facts);
  }
  if (result.suite === "collapse") {
    return typeof value.collapse_required === "boolean" && typeof value.blocking_dependency === "string"
      && typeof value.causal_radius === "string" && Array.isArray(value.proposed_constraints)
      && Array.isArray(value.left_unresolved);
  }
  return typeof value.kind === "string" && typeof value.goal === "string"
    && typeof value.method === "string" && Array.isArray(value.modifiers) && Array.isArray(value.targets);
}

const scored = report.results.map(result => {
  const test = byId.get(result.id);
  const text = textOf(result);
  const checks = {json: !result.parseError && !!result.parsed, exactShape: shapeValid(result)};
  if (test?.suite === "observation") {
    const presentation = String(result.parsed?.presentation_zh ?? "");
    checks.noForbiddenPresentation = !(test.forbidden ?? []).some(term => presentation.toLowerCase().includes(term.toLowerCase()));
    checks.requiredPresent = (test.required ?? []).every(term => presentation.includes(term));
  }
  if (test?.suite === "attempt") {
    checks.kind = result.parsed?.input_kind === test.expectedKind;
    checks.noWorldCommit = Array.isArray(result.parsed?.proposed_world_facts) && result.parsed.proposed_world_facts.length === 0;
  }
  if (test?.suite === "collapse") {
    checks.required = result.parsed?.collapse_required === test.expectedRequired;
    checks.radius = result.parsed?.causal_radius === test.expectedRadius;
    checks.noForbidden = !(test.forbidden ?? []).some(term => text.includes(term.toLowerCase()));
  }
  return {...result, checks, passed: Object.values(checks).every(Boolean)};
});

const paraphrase = {};
for (const group of [...new Set(cases.paraphrase.map(test => test.groupId))]) {
  const rows = scored.filter(row => row.groupId === group && row.parsed);
  const signatures = rows.map(row => JSON.stringify({kind: row.parsed.kind, goal: row.parsed.goal, targets: row.parsed.targets}));
  paraphrase[group] = {count: rows.length, uniqueMaterialSignatures: new Set(signatures).size, signatures};
}

const summary = {
  generatedAt: new Date().toISOString(),
  model: report.model,
  total: scored.length,
  passedDeterministicChecks: scored.filter(row => row.passed).length,
  bySuite: Object.fromEntries(["observation", "attempt", "collapse", "paraphrase"].map(suite => {
    const rows = scored.filter(row => row.suite === suite);
    return [suite, {total: rows.length, passed: rows.filter(row => row.passed).length}];
  })),
  paraphrase,
  results: scored
};
await writeFile(new URL("./results/latest-score.json", import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({total: summary.total, passed: summary.passedDeterministicChecks, bySuite: summary.bySuite, paraphrase}, null, 2));
