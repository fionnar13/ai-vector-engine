# src-js/critic.js — MODULE DOCUMENTATION (PHASE 3.14)

Read-only critic layer: consumes a valid EvaluationResult and produces inert,
deterministic CorrectionProposal records. Single-orchestrator design. This
file documents the module per spec §53. Line references cite
`src-js/critic.js` unless another file is named.

---

## 1. Critic responsibilities (§23)

The Critic diagnoses the EvaluationResult and proposes corrections:

```text
EvaluationResult -> Critic -> CorrectionProposal[]
```

`proposeCorrections(evaluationResult)` (`critic.js:406-431`) first enforces
the §12 contract by running the evaluation module's OWN validator
(`validateEvaluationResult`, imported at `critic.js:104` — reuse, not
duplication; `critic.js:407-410`), then walks the deviations in order through
a fixed rule table and returns a deep-frozen array (`critic.js:430`). The
Critic is **read-only, deterministic, proposal-only** (§56): it never
executes a tool, never mutates a transaction, and never writes anything.

## 2. Rule engine — supported corrections (§27)

Every rule maps a deviation category/property to an EXISTING planning
capability; restoration values always come from the ExpectedState (the
desired state), never from the deviation's observed side (`critic.js:30-35,
:330-331`):

| Deviation surface | Proposal | Capability |
|---|---|---|
| `geometry.{width,height,rx,ry,area,symmetric}` | create-rebuild intent projected from the desired-state record (`geometryProposal`, `critic.js:300-328`); objectType inferred: width present -> rect, else ellipse | create (`ai.js:255-264`) |
| `appearance.{fill, fill.color, fill.kind}` | `{type:'appearance', targets:[id], fill:<hex>}` (`critic.js:341-348`) | T07 apply_fill (`tools.js:347`) |
| `appearance.opacity` | `{type:'appearance', targets:[id], opacity:<v>}` (`critic.js:333-340`) | T07 opacity-only (`tools.js:375-378`) |
| `placement.center` | translate delta = expected center − observed center (`placementProposal`, `critic.js:352-364`) | T05 move_object delta semantics (`ai.js:764-779`) |
| `transform.transform.tx / .ty` | translate delta, ONLY when the ExpectedState carries the non-null expectation; dormant otherwise (`transformProposal`, `critic.js:369-383`) | T05 |

Intent key vocabularies mirror the Planner's own rejectUnknownKeys tables
(`INTENT_KEYS`, `critic.js:191-197`) — the Critic enforces the KEY vocabulary
only; field-level validation is the Planner's job at the handoff (§35).

## 3. Unsupported corrections — no architecture bypass (§28)

`existence`, `structure`, and `semantic` deviations produce NO proposal
(`critic.js:385-395` fall-through): existence has no creation binding in the
ExpectedState; `grouped:true` cannot be scheduled (T10 requires >= 2 targets,
`ai.js:840-845`) and `grouped:false` targets a group NODE id the
object-targeted intent grammar cannot carry (`tools.js:517-525`); no tool
supports semantic mutation. Placement bbox-edge deviations propose nothing —
which corner moves is ambiguous (`critic.js:353`). Matrix keys a/b/c/d
propose nothing (no safe capability maps node-matrix components). A
correction that would have to INVENT parameters returns null
(`geometryProposal` guard chain, `critic.js:305-320`). The Critic must not
bypass the architecture simply because a correction appears obvious — tests
C-12..C-17 (`tests/evaluation-critic.test.mjs:1010-1066`) and D-10 prove the
no-proposal outcomes.

## 4. CorrectionProposal — the 7-key inert record (§25/§26)

`createCorrectionProposal(content)` (`critic.js:240-267`) builds and
deep-freezes:

```text
{ id, deviationId, targetRef, intent, reason, confidence, priority }
```

- `id` = `'prop-' + FNV-1a(stableStringify(content))` — content-derived,
  no entropy (§29, `critic.js:262-265`).
- `intent` is an intent-LIKE structured description, NOT a Plan and NOT a
  command (`critic.js:209-222`); it is deep-cloned then frozen at
  construction (`critic.js:254`).
- `confidence` is the rule-derived constant 1 — exact restoration from the
  desired-state record (`critic.js:426`).
- `validateCorrectionProposal` (`critic.js:271-290`) requires all 7 keys as
  own-properties, plain data only (functions rejected at any depth,
  `critic.js:276-278`), and every content contract of §25.

The proposal is INERT DATA (Checkpoint F, test F-6 at
`tests/evaluation-critic.test.mjs:1953`): exactly the 7 keys, no
execution-authority key surface, deep-frozen, lossless JSON round-trip. A
proposal is input, not authority.

## 5. Proposal determinism and ordering (§29/§30)

Order follows the deviation order (the §30 primary basis); `priority` equals
the deviation's index (`critic.js:414-428`). Dedup: identical corrections for
the same target collapse to the FIRST deviation — dedup key =
canonical intent + targetRef + objectId (`critic.js:418-420`). Same input,
same output, byte-identical, always (tests C-18..C-20, D-5, E-S7).

## 6. Correction-loop boundary (§31/§32) and no-progress boundary (§33)

The loop STOPS at the planning boundary: the only route back to the document
is `CorrectionProposal -> Intent -> Planner -> Plan -> DSL -> Transaction ->
Commit` (`critic.js:13-16`, §26/§34). There is no self-scheduling machinery
anywhere in the module — critique is a stateless, single, EXPLICIT
invocation; repeated explicit invocations terminate identically without
accumulation (test F-4, `tests/evaluation-critic.test.mjs:1877`). The
no-progress boundary (§33) is DEFINED at the test layer: materially identical
deviation content across cycles is fingerprinted deterministically (the
content-derived dev-/prop- ids hash that identity,
`tests/evaluation-critic.test.mjs:1324-1467`); the MVP response is defined,
bounded, and non-escalating — no autonomous looping exists (test F-5, :1907).

## 7. Read-only guarantees (§24/§42/§52)

- Import contract: EXACTLY `'./evaluation.js'` (`critic.js:104`, test G-4) —
  the Planner is NOT imported (§35: only the Planner turns proposals into
  plans).
- Static: the module carries no toolRegistry, no TransactionExecutor, no
  DSLExecutor, no `.execute(`, no `.commit(`, no mutation-method surface
  (test G-6, `tests/evaluation-critic.test.mjs:2213`), no forbidden
  capability words (test G-5).
- Runtime: the Checkpoint F Proxy mutation-spy proves critique reads through
  the injected surface while committing nothing and touching no mutation
  method (test F-3, `tests/evaluation-critic.test.mjs:1851`).
- The alias-form kill (KILL-2) proves the scan catches even
  never-invoked `const x = eval;` aliases — evidence
  `scripts/phase3.14-evidence/3.14-G-stubkill-run2.txt`.

## 8. Single orchestrator — evaluateAndCritique (§57)

`evaluateAndCritique(expectedState, documentContext, evaluationContext)`
(`critic.js:442-446`) is a thin composition: `evaluate()` (the §55 engine,
which builds the ActualState INSIDE the pipeline from the authoritative
stores) followed by `proposeCorrections()`. The second parameter is the
doc-context read surface, NOT a pre-built ActualState — caller-assembled
snapshots would bypass the §10 contracts (`critic.js:84-89`). The second
parameter being a context is a Checkpoint D acceptance decision. Returns the
frozen plain-data pair `{evaluationResult, proposals}`; the orchestrator
holds no state and performs no mutation (`critic.js:78-83`).

## 9. targetRef flow (§57)

Deviations carry the evaluationContext reference (`'$doc:<id>'` /
`'$<stepId>'`) or null for a plan-level outcome; every proposal copies its
deviation's targetRef verbatim (`critic.js:423`), so plan-level deviations
yield plan-level proposals (object-independent corrections) or no proposal
where the rule table has no capability (existence) — tests D-3/D-4
(`tests/evaluation-critic.test.mjs:1189/:1205`).

## 10. Deterministic IDs

Proposal ids use the same discipline as deviation ids (`evaluation.js:474-478`):
key-sorted canonical JSON -> FNV-1a 32-bit -> 8 hex chars
(`critic.js:158-174, :262-265`). No `Date.now()`, no `Math.random()`, no
UUID randomness anywhere in the module (test C-21 area; A-28 equivalent
holds by import isolation — the module imports only evaluation.js).

## 11. Relationships to the rest of the engine

- **Evaluation (`evaluation.js`)**: the single import — the §12 contract
  consumed through its own validator (`critic.js:104, :407`).
- **Phase 3.13 Planner (`ai.js`)**: downstream DECISION-MAKER. Proposals end
  at Planner INPUT (`validateIntent -> createPlan -> validatePlan`, test
  F-1 at `tests/evaluation-critic.test.mjs:1774`); the resulting correction
  Plan is a NEW deep-frozen plan object, never a mutation of the executed
  plan (test F-2, :1821). The Planner owns the gate; the Critic never
  re-implements Planner logic (§35).
- **Tool Registry (`tools.js`)**: capability metadata informed the rule
  table's design; the registry itself is never imported, read, or executed
  (test G-6).
- **Transaction / History (`transaction.js`)**: never touched. The §52
  matrix (`Critic -> Tool.execute / Transaction.commit / History.write`)
  is statically impossible (G-6) and runtime-proven (F-3).
- **SceneGraph (`scenegraph.js`)**: never imported; structure corrections
  are deliberately unsupported rather than unsafe (§28).
- **Renderer (`renderer.js`)**: no relationship — the Critic produces no
  events and observes nothing visual.
- **SpatialIndex (`spatial-index.js`)**: never imported or touched.
