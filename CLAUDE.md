# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A text-based persistent virtual reality demo. The core thesis (see `docs/demo-goals.md`): natural language can only express *intent*, never write reality directly — a deterministic protocol owns entity binding, world settlement, commit, perception projection, and presentation. The LLM proposes; it never decides. Project docs and commit messages are in Chinese; code identifiers and comments are in English.

**There is no separate "production" tier.** The whole project is demo and experiment. The original typed-schema (`EntitySchema`/`Component`/`ActionProposal`) runtime that used to live under `src/` was retired 2026-08-29 after `experiments/` accumulated enough validated, real-API evidence (including two real Cloudflare Worker deployments) that the natural-language-proposition architecture works end-to-end and should replace it outright, not sit alongside it as a subordinate layer. `experiments/` is the only code that matters now; anything under `docs/` describing the old typed-schema layer is historical record, not a spec to implement against.

### Document priority (load-bearing, not a suggestion)

When a design question touches world semantics, this ranking governs, highest first:

1. `docs/这是一个已分享的 ChatGPT 聊天副本.txt` — the original design conversation: Height/TruthCell/Collapse/RealityDelta, append-only, authority hierarchy. This is where the architecture came from.
2. `docs/fc1.txt`, `docs/fc2.txt` — first real-play validation of "事实先行，语义后赋" (facts first, meaning assigned after), and the 世界反馈者 (World Feedback Giver) ethics: consistency is the only hard duty, don't care about outcomes, don't judge right/wrong (see `docs/世界反馈者手册.md` for the operationalized version — treat the handbook as near-source, not as derivative, but if it ever conflicts with real experiment results or cost constraints, the handbook is what gets revised).
3. Everything else in `docs/` (including `world-constitution.md`, `runtime-protocol.md`, and this file) — derivative, never outweighs 1 or 2. `docs/architecture-direction-consensus-2026-08-28.md` is the running decision log for the current direction and the best single entry point for "why is it built this way" — read it before re-litigating an already-settled architecture question.

## Commands

Requires Node.js 22+ (`.nvmrc`). No build step — every experiment is plain `.mjs`, run directly with `node`.

```bash
nvm use
node experiments/<spike-name>/run.mjs      # each experiment directory is self-contained
```

Real calls go to Cloudflare Workers AI, model `@cf/qwen/qwen3.8-27b` only — **this is the only approved model, do not add fallbacks.** Put an API token in `secret/cftoken.txt` (gitignored). AI Search (RAG) calls use the same token against instance `sr2-truth-store`.

```bash
npm run eval:qwen:smoke   # experiments/qwen-boundary/run.mjs --smoke
npm run eval:qwen:full
npm run eval:qwen:score
```

There is no `npm test` / unit test suite. Validation happens by running an experiment against the real model/store and writing a findings doc (`docs/*-findings-*.md`) with the actual output, not by asserting against expected values.

### Deployed infrastructure (real, not simulated)

Two Cloudflare Workers are live, deployed via `npx wrangler deploy` from within their directory (needs `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env vars, and a `CF_API_TOKEN` Worker secret set via `wrangler secret put` for AI Search REST calls):

- `experiments/juror-worker-deploy/` → `sr2-juror-worker` — judge+clerk only, proves concurrent callers aren't serialized.
- `experiments/pipeline-worker-deploy/` → `sr2-pipeline-worker` — the full pipeline, `POST /seed` then `POST /attempt {attempt}`.

Both are plain stateless Workers calling Workers AI via the `env.AI` binding — **not** the Durable-Object-backed Cloudflare Agents SDK. See `docs/architecture-direction-consensus-2026-08-28.md` §12 for why (DO instances serialize same-identity requests, which would fight the concurrency this project actually wants; a stateless Worker doesn't have that failure mode). Height bookkeeping in the deployed pipeline is derived from AI Search's existing item keys on every call, not an in-memory counter — a stateless Worker has no memory across requests, so anything that must persist across a session lives in the truth store, never in the role.

## Architecture

### The pipeline

Every player input flows through, one Height per settled step (`docs/adjudicator-pipeline-design-v0.1-2026-08-28.md`):

```
GROUND (bind mentioned entities, reject unbound ones as a boundary)
→ RETRIEVE (semantic search against the truth store, not exact match)
→ ADJUDICATE (plausibility verdict in plain language, no schema)
→ groundVerdict (audit ADJUDICATE's own claims for reachability — self-report alone misses confident-but-ungrounded assertions)
→ CLASSIFY (plausible / implausible / insufficient)
→ COLLAPSE if needed (Continuity Resolver proposes → 3 jurors + clerk validate → commit if approved)
→ COMMIT (FACT_WRITER turns the verdict into a clean settled-state proposition)
→ NARRATE + audit (same extract-claims → check-reachability → resolve-via-Collapse mechanism applied to the narration draft)
```

Reference implementation: `experiments/pipeline-integration-slice/pipeline.mjs` (`processAttempt`), ported unchanged in logic to the deployed Worker (`experiments/pipeline-worker-deploy/src/index.mjs`).

### The truth store: structured, not formalized

No typed schema, no fields, no enums. A world is `namespace → entity name (identity + retrieval key only) → flat, ordered, one-proposition-per-line natural-language list`. Structure lives in the format convention, not in a type system:

- One proposition = one self-contained natural-language sentence, subject-predicate, no dangling pronouns (propositions get retrieved and read out of original order).
- Each proposition is tagged `[H<n>]` (the Height it was established at). **On conflict between two propositions about the same thing, the higher Height wins** — old propositions are never edited or deleted, just lose authority (the "Netflix screenwriter retcon" rule). This only works if conflicting facts are phrased comparably enough to be recognized as about the same thing, which is why COMMIT goes through `FACT_WRITER` instead of storing raw verdict text.
- Three derived, constrained subsets of this base grammar — Attempt-shape (must express intent, must never assert a settled result), Fact-shape (must be settled, only from Genesis/Collapse/real settlement), Collapse-proposal-shape (must not contradict, minimal, no truth status before jury) — defined once in `experiments/shared/proposition-language.mjs`, imported by every prompt instead of restated ad hoc. Full spec: `docs/proposition-language-spec-v0.1-2026-08-28.md`.
- The engineering payoff over the old typed schema: **non-atomic failure.** One bad proposition gets rejected by the jury or corrected later; it doesn't invalidate a whole structured object the way one bad field used to (`docs/semantic-intent-spike-findings-2026-08-28.md`'s gun-induction case is the concrete example that forced this realization).

### Key invariants to preserve when editing

- **Collapse stays narrow**: Continuity Resolver proposes the minimal completion needed, never more; jury validates against `COLLAPSE_PROPOSAL_RULES` (no contradiction, no fabricated entity, no over-specificity) — "not yet confirmed by the scene" is never valid rejection grounds, since that's true of every genuine Collapse candidate by definition. `dependencySource` is never player-claim; the resolver does not pick values to satisfy what the player is fishing for, and can rule against the player's interest (it has, repeatedly, in real runs).
- **Jury + clerk**: 3 same-source jurors (true diversity deferred, not required to start), majority (2/3) passes, ambiguous verdicts default to not-passing. Single-vote veto only for "this entity/fact has zero basis in given context" (fabrication) — not for general disagreement, which is read as a signal for genuine Collapse need, not noise.
- **Reactive Collapse audit runs at two checkpoints**, not one: right after ADJUDICATE and right after NARRATE, sharing one `resolveClaimViaCollapse` helper. CLASSIFY's self-reported "insufficient" only catches a model that flags its own uncertainty; it does not catch a model that confidently asserts an ungrounded specific claim without ever admitting doubt — a real bug this dual-checkpoint design exists to catch.
- **Task-level statelessness, not session-level.** A role's single call/execution can hold internal state (e.g. a bounded multi-round retrieval loop) as long as that state's lifecycle is closed within the one call and never persisted or leaked across calls. Anything that must survive across calls belongs in the truth store, not in the role.
- **One approved model, no fallback**: `@cf/qwen/qwen3.8-27b` via Cloudflare Workers AI only.
- `reasoning_effort: "low"` is the real, documented lever for this model (values: `low`/`medium`/`xhigh`-default — `"high"` is invalid and 400s). There is no `reasoning`/`enable_thinking` parameter for this model; sending one is silently ignored, not a working control (confirmed via controlled A/B, `docs/reasoning-token-diagnosis-findings-2026-08-29.md`). Reasoning-token length is inherently variable even at `"low"`, and consumes the same `max_completion_tokens` budget as visible content — budget `max_completion_tokens` with real headroom for this, don't assume it can be suppressed further.

### Findings docs are the record, not commit messages alone

Every experiment that ran real calls has a `docs/*-findings-*.md` (dated) recording what was actually observed, including failures — read the relevant one before assuming a mechanism works or re-running an experiment that's already been settled. `docs/architecture-direction-consensus-2026-08-28.md` is the index/summary of how these fit together and where the open questions still are.
