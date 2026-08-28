import {baseEntities, withBlanketHeld} from "./world.mjs";

// Each case documents *what a correct frame should show*, for manual scoring after
// the run -- this spike does not auto-grade semantic correctness, only structural
// validity (see run.mjs). `sourceEvidence` links back to the concrete failure this
// case reproduces, where applicable.

export const cases = [
  {
    id: "self-move-to-door",
    suite: "real-failure-repro",
    rawInput: "走到门前去",
    entities: baseEntities(),
    sourceEvidence: "human-test-direction-review-2026-08-28.md #1: system wrote placement:self = door-1, " +
      "conflating object-placement with subject spatial movement; downstream 'where am I' then hit INTERNAL_INVARIANT.",
    expectation: "intent=self_move, roles.agent=actor, roles.destination=door-1 with destinationRelation=near " +
      "(not into/onto -- actor does not become contained by the door)."
  },
  {
    id: "already-holding-place-under-gap",
    suite: "real-failure-repro",
    rawInput: "把毛毯堵到门缝下面",
    entities: withBlanketHeld(baseEntities()),
    sourceEvidence: "human-test-direction-review-2026-08-28.md #2: combo plan re-executed hold despite actor " +
      "already holding blanket-1; idempotent prefix not eliminated.",
    expectation: "intent=object_place (not hold), roles.theme=blanket-1, roles.destination=door-1, " +
      "destinationRelation=under; no unresolvedDependency asking to (re)acquire the blanket."
  },
  {
    id: "blanket-to-floor",
    suite: "real-failure-repro",
    rawInput: "把毛毯铺在地面上",
    entities: withBlanketHeld(baseEntities()),
    sourceEvidence: "human-test-direction-review-2026-08-28.md #3: TARGET_UNGROUNDED because 'ground' had no " +
      "pre-registered entity in the tester's session.",
    expectation: "intent=object_place, roles.theme=blanket-1, roles.destination=floor-1, destinationRelation=onto."
  },
  {
    id: "query-self-location",
    suite: "paper-case-C4",
    rawInput: "我在哪里",
    entities: baseEntities(),
    sourceEvidence: "human-test-direction-review-2026-08-28.md: 'where am I' triggered internal invariant after #1.",
    expectation: "kind=query, intent=observe, perceptionFocus.horizon=self, roles.theme=actor; must not be " +
      "interpreted as an attempt to move."
  },
  {
    id: "query-outside-door",
    suite: "paper-case-C4",
    rawInput: "看看门外",
    entities: baseEntities(),
    expectation: "kind=query, perceptionFocus.horizon=directional, targetSlot=door-1; must not assert what is " +
      "visible/audible beyond the closed door (that is the settlement layer's job, not the frame's)."
  },
  {
    id: "query-held-object",
    suite: "paper-case-C4",
    rawInput: "查看毛毯",
    entities: withBlanketHeld(baseEntities()),
    expectation: "kind=query, perceptionFocus.horizon=object, targetSlot=blanket-1, resolved via the holding " +
      "relation already present in context rather than a room search."
  },
  {
    id: "move-bed-to-block-door",
    suite: "paper-case-C2",
    rawInput: "把床推到门口挡住",
    entities: baseEntities(),
    expectation: "intent=object_move (or apply_force), roles.theme=bed-1, roles.destination=door-1, " +
      "destinationRelation=blocking, method mentions pushing; unresolvedDependencies should surface that " +
      "bed-1.properties.movable is unresolved, not silently assume it succeeds."
  },
  {
    id: "gun-induction",
    suite: "paper-case-C5",
    rawInput: "抽屉里一定有枪，我把枪拿出来",
    entities: baseEntities(),
    expectation: "kind=invalid or ambiguous; zero new slots invented for 'drawer' or 'gun'; " +
      "referenceExpressions for both have resolvedSlot=null; unresolvedDependencies explains why (not grounded " +
      "in given context), not phrased as if the object exists but is merely inaccessible."
  },
  {
    id: "mundane-door-baseline",
    suite: "sanity-baseline",
    rawInput: "轻轻推门，只开一条缝，别出声",
    entities: baseEntities(),
    expectation: "intent=apply_force (or object_move), roles.theme=door-1, method captures the manner " +
      "(gentle, partial, quiet) without asserting the door actually ends up cracked open or silent -- that is " +
      "a world result, not an intent."
  }
];

// Two-turn discourse case, run separately in run.mjs because turn 2's context depends
// on turn 1's own output (simulating a minimal DiscourseState per architecture-redesign
// A3, without building the full contract layer).
export const discourseCase = {
  id: "discourse-pronoun-binding",
  suite: "paper-case-A3",
  turn1RawInput: "看看手里有什么",
  turn2RawInput: "把它铺开",
  entities: withBlanketHeld(baseEntities()),
  expectation: "Turn 1 should focus on blanket-1 via the actor's holding relation. Turn 2's referenceExpressions " +
    "for '它' should resolve to blanket-1 using only a recentFocus hint derived from turn 1 -- not by re-stating " +
    "the Chinese word '毛毯' again -- and intent should be object_place (spread out)."
};
