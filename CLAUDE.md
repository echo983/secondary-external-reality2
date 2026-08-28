# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A text-based persistent virtual reality demo. The core thesis (see `docs/demo-goals.md`): natural language can only express *intent*, never write reality directly — a deterministic protocol owns entity binding, world settlement, commit, perception projection, and presentation. The LLM proposes; it never decides. Project docs and commit messages are in Chinese; code identifiers and comments are in English.

The canonical specs live in `docs/`:
- `docs/world-constitution.md` — invariants: authority hierarchy, truth states (`TRUE`/`FALSE`/`ABSENT_IN_SCOPE`/`UNRESOLVED`/`UNKNOWN_TO_AGENT`/`UNSUPPORTED`/`INVALID`), World Height/Time, finality rules.
- `docs/runtime-protocol.md` — the full runtime protocol: object types, the Height state machine, Collapse policy, perception/presentation, storage interfaces, error codes. **Read this before touching `src/runtime` or `src/protocol`.**
- `docs/demo-goals.md` — product framing and scope for the current demo slice.
- Other files under `docs/` are dated design reviews, evaluation reports, and plan amendments — check filenames for relevance/recency before treating them as current.

When making a design decision that touches world semantics (what creates a Height, what counts as a Canonical Fact, what the LLM is allowed to see or decide), check `docs/runtime-protocol.md` / `docs/world-constitution.md` first — they are the source of truth, not the code's current shortcuts.

## Commands

Requires Node.js 22+ (`.nvmrc` pins the exact version — run `nvm use`).

```bash
npm install
npm test              # tsc build + node --test dist/test/*.test.js
npm run typecheck     # tsc --noEmit
npm run build         # tsc -p tsconfig.json -> dist/
npm run demo          # local deterministic model, .world/demo-v4.sqlite
npm run demo -- --db=/absolute/path.sqlite
npm run demo -- --live-qwen   # requires secret/cftoken.txt (gitignored)
```

`npm test` never touches the network or reads `secret/`. Tests compile first, so always rebuild before re-running after an edit — `npm test` does this automatically.

Run a single compiled test file directly (after `npm run build`):
```bash
node --test dist/test/door-slice.test.js
node --test --test-name-pattern="<pattern>" dist/test/*.test.js
```

Evaluation / spike scripts (all build first, all Qwen-hitting ones are opt-in via explicit flags):
```bash
npm run eval:qwen:runtime-smoke        # smoke gate for the live Qwen adapter
npm run eval:qwen:action-spike         # experimental ActionProposal gate
npm run eval:qwen:phase8d-targeted
npm run eval:free-session              # 15-round session eval, local by default
npm run eval:free-session -- --live-qwen
npm run export:session
```

The `experiments/qwen-boundary/` harness is separate (plain `.mjs`, not part of `npm test`):
```bash
npm run eval:qwen:smoke   # experiments/qwen-boundary/run.mjs --smoke
npm run eval:qwen:full
npm run eval:qwen:score
```

The only approved model is `@cf/qwen/qwen3.8-27b` (Cloudflare Workers AI). Do not add other model fallbacks — the protocol explicitly forbids model fallback (`docs/runtime-protocol.md` §12).

## Architecture

### The pipeline

Every player input flows through a fixed sequence (`docs/runtime-protocol.md` §1, §6):

```
open expression → non-authoritative semantic proposal (LLM)
→ deterministic binding & permission check
→ bounded settlement → atomic commit
→ restricted perception projection → approved presentation
```

Concretely, a Height goes: `OPEN → DELIVER_PENDING → ACCEPT_INPUT → CONSTITUTE → COLLECT_DUE_EVENTS → RESOLVE_DEPENDENCIES → ADJUDICATE → COMPUTE_CLOSURE → VALIDATE → COMMIT → FINALIZE → MATERIALIZE_EXPERIENCE`. Only stages that actually change World Time, Canon, or Process State create a new Height — pure queries, meta input, and binding failures only append to the (non-authoritative) Attempt Audit.

`src/runtime/runtime-session.ts` (`RuntimeSession.handle`) is the orchestrator that walks a single input through this pipeline for the CLI/eval harnesses.

### Layers by directory

- `src/protocol/` — the trusted, deterministic core: `compiler.ts` (clause → primitives), `constitute.ts`, `primitive-action.ts` (constrained `ActionProposal` → `ConstitutedInput`), `deterministic-collapse.ts` / `collapse-policy.ts` (resolving `UNRESOLVED` TruthCells within an authorized, seeded, replayable domain — never via model or player claim), `grounding-gate.ts`, `active-perception-intent.ts`, `perception-request.ts`, `canonical-json.ts` (canonical serialization for state-root hashing), `errors.ts` (the fixed `ProtocolErrorCode` family).
- `src/ai/` — model adapters, all implementing `ProposalModel` (`model-adapter.ts`). `cloudflare-qwen-model.ts` is the only live model; `local-demo-model.ts` is a deterministic stand-in used by default so tests/demo never need network or secrets. Models only ever produce non-authoritative `InputProposal`/`ActionProposal` — they cannot emit Canonical IDs or RealityDelta.
- `src/world/` — fixture definitions (`demo-fixture.ts`, `door-fixture.ts`, `kettle-fixture.ts`) and settlement logic per feature slice (`open-door.ts`, `wait-kettle.ts`, `active-perception.ts`, `primitive-world.ts`, `action-scene.ts`). This is where `ActionProposal`s get validated against world state and turned into committed deltas.
- `src/perception/` — projects Materialized State into what an observer is actually permitted to perceive (`current-scene.ts`, `visibility.ts`). Never hands the model the full hidden Fact set.
- `src/presentation/` — `deterministic-renderer.ts` turns approved `ApprovedPresentationPacket`s into player-facing Chinese text. Templated, not model-generated, in the current phase.
- `src/domain/types.ts` — shared world/domain types (`WorldSnapshot`, etc.).
- `src/audit/attempt-audit.ts` — the non-authoritative `AttemptAudit` trail; never a source of Canon or of things a character can "remember."
- `src/storage/` — `ports.ts` defines the storage interfaces (`WorldCommitPort`, `ExperiencePort`, `AuditPort`); `sqlite-runtime-store.ts` is the real backing store, `in-memory-commit-store.ts`/`in-memory-experience-store.ts` are used in tests.
- `src/runtime/` — `runtime-session.ts` (per-session orchestrator) and `restore-sqlite-session.ts` (strict-replay recovery from SQLite on startup, including repairing committed-but-not-materialized `ExperienceCommit`s).

### Key invariants to preserve when editing

- **Two independent roots**: `stateRoot` covers only materialized world state (Genesis + Finalized Commits); `epistemicRoot` covers the per-observer Experience Ledger. Presentation text and audit data participate in neither.
- **World commit precedes Experience commit.** If a crash happens between them, recovery must regenerate the same experience identity from the seeds already baked into the `SettlementCommit` — never re-derive perception from scratch post hoc.
- **Collapse is narrow**: local-only, registered addresses only, bounded/enumerated domains, ≤2 collapse addresses per Height, deterministic (seeded, replayable — same inputs must yield the same resolved constraint). `dependencySource` may never be `player-claim`; the model never picks values to satisfy what the player is fishing for.
- **One critical-path model call per Height** is the budget target; a second-stage model call requires its own gated experiment.
- **Action sequences** ("open the drawer, if there's a gun take it") settle one primitive/clause at a time, each as its own Height, on the *actual* prior result — never assume an unresolved condition resolves the way the player implies.
- Truth states are distinct and must not be conflated: `UNRESOLVED` ≠ random ≠ nonexistent; `UNKNOWN_TO_AGENT` must never leak through Presentation; `ABSENT_IN_SCOPE` requires a genuinely complete scope.

### Tests

`test/*.test.ts` compiles to `dist/test/*.test.js` and runs on Node's built-in test runner (`node --test`). Test names roughly map to slices: `door-slice.test.ts`, `wait-kettle.test.ts`, `collapse-gate.test.ts`, `commit-replay.test.ts`, `general-action-runtime.test.ts`, `long-session.test.ts`, `model-boundary.test.ts` (LLM failure/boundary handling), `sqlite-runtime-store.test.ts`, `unified-demo.test.ts`. `long-session.test.ts` and `unified-demo.test.ts` in particular exercise multi-Height replay consistency — treat their failures as state-root/replay regressions, not flakiness.
