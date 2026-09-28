# src-js/semantic-correction.js — MODULE DOCUMENTATION (PHASE 3.18)

The semantic-correction capability module: a deterministic, zero-import
surface that diagnoses semantic role deviations, converts them into
capability-grounded proposals, executes each proposal as exactly ONE
transaction through the injected substrate, verifies the result by REAL
post-commit re-derivation, rolls attempts back through the substrate's own
undo, and measures regression and convergence — all WITHOUT changing the
correction engine's state machine (spec §50/§51). This file documents the
module per the §91 mandate (the 14 mandated topics, in the mandated order)
and matches the house README style of `src-js/semantic-inference.README.md`
and `src-js/constraint-inference.README.md`. The implementation was built
RED-first across Checkpoints A–H (spec §109); the per-checkpoint evidence
lives in `scripts/phase3.18-evidence/`. All line references cite
`src-js/semantic-correction.js` unless another file is named.

---

## 1. Mission

Correct ONE class of document drift — semantic ROLE drift — honestly and
reversibly. The module owns the full correction pipeline for `category:
'semantic', property: 'role'` deviations (the §13 records emitted by the
3.17 evaluation arm): it turns a deviation into a diagnosis
(:521), a diagnosis into an agenda (:1758), an agenda into a plan (:1920),
a plan into an executed transaction (:977), the commit into a verification
verdict (:1346), and the verdict trail into regression and convergence
reports (:1604, :1692) — with rollback (:1644) and the evaluation-arm role
provider (:1403) beside. It declares NO imports of any kind (:4-60, the
zero-import pin); the substrate is INJECTED and duck-typed, stores are never
touched directly, and every output is a deep-frozen plain-data record. The
engine stays untouched: `correction.js` keeps its ZERO SEMANTIC_ERROR
recipes, and hosts that never inject this layer keep the honest
NO_CAPABILITY terminal.

The module carries exactly TWELVE exports: the `SemanticCorrectionError`
class (:408), the frozen `SEMANTIC_CORRECTION_CAPABILITIES` registry (:426),
and the ten functions above plus `buildSemanticCorrectionProposal` (:780).
Private machinery: the local deterministic id pair `stableStringify` +
`fnv1a32` (:377-395), the validators (:436-501, :693-761, :898-961,
:1235-1245, :1566-1577, :1883-1897), the normalizer `normalizeT20Proposal`
(:1253), the inference runner `runT20Inference` (:1287), the recurrence
predicate `hasRoleRecurrence` (:1580), and the id derivators (:397-401,
:678-691, :1899-1902).

## 2. Architecture

A pure, linear data-flow over frozen records — no session state, no stores,
no globals, no RNG, no wall clock (spec §19):

```
deviation(§13) + objectFacts
  -> diagnoseSemanticDeviation        -> SemanticCorrectionDiagnosis (C3)
  -> buildSemanticCorrectionAgenda    -> SemanticCorrectionAgenda|null (G)
  -> buildSemanticCorrectionPlan      -> SemanticCorrectionPlan (H, scplan-)
  -> buildSemanticCorrectionProposal  -> SemanticCorrectionProposal (C4, scp-)
  -> executeSemanticCorrectionAttempt -> ExecutionResult (atx-)
  -> verifySemanticCorrectionAttempt  -> SemanticVerificationResult
  -> detectSemanticRegression         -> SemanticRegressionReport
  -> detectSemanticConvergence        -> SemanticConvergenceVerdict
  -> rollbackSemanticCorrectionAttempt-> SemanticRollbackResult
```

Every layer re-validates what it consumes (the handed-record posture, SE-6/
SH-4): a proposal handed to execution is re-checked against the uniform-scale
form and the strict-crossing prediction before any transaction exists; a
target handed to verification is re-checked against the C1 record shape.
Design decisions are pinned in the module header blocks (SD-1..7, SE-1..8,
SF-1..7, SG-1..4, SH-1..4) and mirrored by the counted tests
(`tests/semantic-correction.test.mjs`, 93 tests across categories A–K plus
the stub-kill proofs).

## 3. Semantic correction principle (Correct the evidence, not the role)

A semantic role is DERIVED state: T20 re-derives it from geometry,
appearance, and scene structure on every run (`semantic.js:122-280`). There
is therefore nothing to "set" — a role mismatch means the document's
evidence (which role the derivation sees) disagrees with the expectation
(which role the agenda wants). This module corrects the EVIDENCE: it applies
the registered mutation tool (T06 uniform scale) so the object's world area
crosses the derivation threshold, and then lets the REAL re-derivation
confirm the role moved. The verification layer (:1346) never trusts the
proposal's declared effect — it re-runs T20 over the committed state and
compares roles; if the re-derived role does not equal the target, the
verdict is VIOLATED regardless of what the attempt claimed. The stub-kill
tests (spec §68) pin that the critical path cannot succeed through any
shortcut: a lying T20 stub, a commit-skipping executor stub, and a
substituted tool are all exposed (tests stub-kill-1/2/3).

## 4. Capability registry (single entry: shape<->background via T06)

`SEMANTIC_CORRECTION_CAPABILITIES` (:426) is a module-level deep-frozen
array with EXACTLY ONE entry (the A4/B-approved single real/safe/reversible
route): id `cap-shape-background`, sourceRoles `['shape','background']`,
targetRoles `['background','shape']` (positionally paired), toolIds
`['T06']`, evidenceKeys `['size']`, scope `'LOCAL'`, risk `'MEDIUM'`,
reversible true, deterministic true, and preconditions carrying the B-approved
eligibility constraints (the C8 encoding): rect-only geometry, areaGrowThreshold
100000 (strict >), areaShrinkThreshold 5000 (strict <), areaMargin 0.05,
maxChildCountForShrink 2, matrixForm `'UNIFORM_SCALE'`. The registry is a
STATIC literal — nothing content-derived, nothing per-session — mirroring
the engine's `CORRECTION_CAPABILITY_RECIPES` static-side pattern
(`correction.js:1328-1347`). Lookup is array iteration/filter; there is no
map, no registry class, and no mutation path.

## 5. Supported transitions

Exactly two, both on rect geometry through T06's uniform scale:

- **shape -> background (grow)**: scale UP so the world area strictly
  exceeds 100000. The builder anchors the prediction at the threshold with
  the 5% margin: `s = sqrt((100000 * 1.05) / worldArea)`, so the predicted
  post-area is exactly 105000 for every grow proposal (:793-812). Requires a
  finite, positive current world area (diagnosis refuses null/zero/negative
  as `STRICT_CROSSING_UNACHIEVABLE`).
- **background -> shape (shrink)**: scale DOWN so the world area lands
  strictly below 5000: `s = sqrt((5000 * 0.95) / worldArea)` (predicted
  area 4750), gated by childCount <= 2 (the container-override precondition).

Both directions require the object's facts (geometryType, childCount,
worldArea, optional world center) to be read by the HOST before the call —
the module itself reads no store. The thresholds mirror the frozen
derivation engine (`semantic.js:165-188`); the margin is a design constant
(C9 #5) that keeps the landing spot strictly across the threshold against
floating-point noise.

## 6. Unsupported transitions

Everything else refuses HONESTLY, as a frozen `UNSUPPORTED_TRANSITION`
diagnosis with a machine reason — and the agenda builder returns null so the
host falls through to the EXISTING engine terminal (SEMANTIC_ERROR ->
NO_CAPABILITY -> UNFIXABLE, `correction.js:1397-1404`; spec §114's honest
termination). The refusal arms: a (from, to) pair no registry capability
covers — e.g. text->heading, icon->shape — refuses
`ROLE_PAIR_UNSUPPORTED`; non-rect geometry refuses
`GEOMETRY_TYPE_NOT_ELIGIBLE` (the threshold derivation only exists in the
rect branch, `semantic.js:156-194`); a grow direction without a usable area
refuses `STRICT_CROSSING_UNACHIEVABLE`; a shrink past childCount 2 refuses
`CONTAINER_OVERRIDE_WOULD_INTERCEPT` (the override would intercept the
shrink, `semantic.js:218-224`). The third diagnosis value, NO_CAPABILITY, is
deliberately NEVER constructed here — it belongs to the engine's terminal
record and is referenced, not redefined (SD-5).

## 7. Transaction boundary (ONE transaction per attempt, snapshot inverse)

ONE attempt = EXACTLY ONE content-derived transaction (spec §31): id
`atx-` + fnv1a32 over `{proposalId, capabilityId, iteration: 1}`, passed
EXPLICITLY through `TransactionBuilder.begin({id})` (the house disclosure-25
pattern), carrying ONE command bound to the LIVE T06 tool obtained from the
injected registry (:1015-1077). The command executes the tool against a
journaled working-copy view (the `correction.js:2388-2412` mirror) — stores
are never written directly. T06 declares NO command inverse, so
`getInverse: null` routes the transaction to the executor's SNAPSHOT inverse
path (`transaction.js:211-218`) — the B8 reversibility proof. Events publish
only AFTER commit and history grows by exactly one INSIDE the substrate's
own pipeline (invariants 16/13 — never re-implemented here). Failure is
atomic: the executor commits only after all commands and validation succeed,
so a failed attempt leaves the stores and history untouched (tests C-5/C-6,
stub-kill-3).

## 8. Verification (REAL T20 re-inference, no false verification)

`verifySemanticCorrectionAttempt` (:1346) is the B9 contract, mechanically:
it re-runs the LIVE T20 tool (via `registry.has`/`registry.get`) over the
CURRENT committed document state and compares the re-derived role with the
target's — SATISFIED iff equal (the evaluation-arm mirror,
`evaluation.js:1309-1311`). There is NO shortcut: no cached role, no
snapshot, no trust in the attempt record (E-8 proves liveness with an
interleaved second mutation; stub-kill-2 proves a skipped commit is
exposed). Anything T20 cannot honestly deliver becomes UNVERIFIABLE with a
deterministic machine reason — `T20_UNAVAILABLE` (preflight), `T20_NO_PROPOSAL`
(validate refusal, throw, non-success envelope, or no proposal for the
object), `T20_REFUSED` (the normalizer's contract refuses the raw proposal) —
never a guess, never a fabricated SATISFIED (spec §40). On the measured
pair, evidence and confidence are copied VERBATIM from the normalized record
(BD-3/BD-4); they ride outside the comparison. Only a plain ExecutionResult
with status `'EXECUTED'` may verify; anything else throws `INVALID_ATTEMPT`
(SF-5).

## 9. Rollback (substrate's own undo, top-of-history guard)

`rollbackSemanticCorrectionAttempt` (:1644) mirrors the house §32 pattern
(`correction.js:2675-2713`) in shape, with record-not-throw substrate arms:
the top-of-history ownership guard reads through the transactionManager
(`historyManager.getTransactionToUndo()` — the real executor publishes the
history manager as its own property, `transaction.js:189`) and refuses a
foreign transaction BEFORE any undo runs (`REFUSED`/`NOT_TOP_OF_HISTORY` —
the engine never undoes a foreign transaction). The substrate's OWN undo is
then called EXACTLY ONCE — never re-implemented, never bypassed; the restore
is the executor's snapshot-inverse path (`transaction.js:231-263`), which
returns the stores byte-for-byte to the pre-attempt state (test H-2/K-2). An
undo throw or falsy return maps to `REFUSED`/`UNDO_FAILED` with a
MACHINE-ONLY reason (no substrate message leakage — H-6 determinism).
Refusal records carry the attempt's own transactionId. Validation throws:
`INVALID_ATTEMPT` (non-EXECUTED or malformed attempt) and `INVALID_SUBSTRATE`
(missing undo/top-of-history surface).

## 10. Convergence (verdict order: VERIFIED > MAX_ITERATIONS > NO_PROGRESS > OSCILLATION > TERMINATED)

`detectSemanticConvergence` (:1692) reads a chronological trail of
verification verdicts and decides — in EXACTLY this order (SG-3): an empty
trail -> `TERMINATED`/`EMPTY_TRAIL`; a trail whose LAST verdict is SATISFIED
-> `VERIFIED` with reason null (converged is converged — it wins over the
budget, I-2); `iterationCount >= maxIterations` -> `MAX_ITERATIONS`
(fires before no-progress and oscillation, I-3/K-4); a trailing
`noProgressThreshold` window sharing one (status, actualRole) pair ->
`NO_PROGRESS` (repeated UNVERIFIABLE with null roles is honest no-progress
too, I-4); an A -> B -> A role recurrence (there exist i < j < k with
role[i] === role[k] !== role[j], `hasRoleRecurrence` :1580) ->
`OSCILLATION`/`ROLE_RECURRENCE` (the §31 posture, I-5/K-4); otherwise
`TERMINATED`/`NO_CONVERGENCE_PATH`. Policy defaults are `{maxIterations: 5,
noProgressThreshold: 2}`; a PRESENT policy must be a plain object carrying
BOTH finite numbers >= 1 — no hidden defaults (the SD-3 discipline). Pure
and deterministic: same trail + same policy -> the same frozen verdict.

## 11. No direct semantic mutation (role is derived state; forbidden setters)

The module has NO role-write surface of any kind. The forbidden setters —
`setSemanticRole`, `setSemantic`, `forceRole`, `overrideRole` — and any
semanticStore/SemanticStore contact are absent from the module (raw-token
and stripped scans, checkpoint evidence `3.18-H-scans.txt`; in-suite pins
A-11/E-11/J-4). The role is derived state; the ONLY writer in the correction
path is the frozen transaction pipeline through the registered T06 tool, and
the ONLY read bridge to the evaluation arm is the injected provider
(:1403) — a function `(objectId) => role|null` that never throws and never
caches (the DD-1 contract, `evaluation.js:1205-1215`), injected as
`evaluationContext.getActualRole`; `evaluation.js` never imports this
module. No loop-state vocabulary exists in the module (the 9 non-shared
state names are scanned in-suite and in the evidence scans — spec §51), and
no correction.js import exists (integration is injection, not import).

## 12. T20 integration (via registry, normalized records)

T20 (`infer_semantic`, `tools.js:973-999`) is reached EXCLUSIVELY through
the injected registry's `has`/`get` — never imported, never special-cased.
The verification/substrate duck-type is `{registry, objectStore,
geometryStore, appearanceStore, sceneGraph}` (SF-3): exactly the
committed-state read surface T20 needs, deliberately with NO workingCopy
(the committed stores ARE the post-commit state) and NO transaction surface
(T20 is proposal-class; verification runs no transaction). Every raw T20
proposal passes through the local normalizer (:1253), a verbatim mirror of
the house normalizer (`semantic-inference.js:224-248`): one 7-key frozen
record `{id: 'smr-' + fnv1a32(...), objectId, role, confidence, evidence,
source: 'T20', status: 'PROPOSED'}` — role guarded to the 7-role emission
vocabulary, confidence verbatim-or-null (BD-3), evidence cloned verbatim or
[] (BD-4), envelope entropy stripped. Hostile tools are caught: a validate/
execute throw or a non-success envelope maps to the honest no-delivery
reasons, so the provider built on top never throws (SF-7).

## 13. Limitations (single transition, single object, rect-only, no shear)

- ONE capability, TWO role pairs (shape<->background); every other transition
  refuses (section 6). There is no heading/text/icon/container capability.
- ONE object per attempt (scope LOCAL): `objectIds` is exactly
  `[target.objectId]`; T06 touches nothing else (`tools.js:335-342`).
- RECT-only: the threshold derivation lives in the rect branch of the
  derivation engine; ellipse/path/text roles are out of scope by construction.
- UNIFORM_SCALE matrices only: b === c === 0 and a === d (no shear, no
  rotation, no translation-only) — T06's own validator would accept shears
  (any |det| >= 1e-12, `tools.js:333`), so the 3.18 layer refuses them
  MANDATORILY (C8 row (d), tests B-11/stub-kill-3).
- Shrink is capped at childCount 2 (the container-override precondition);
  the margin arithmetic assumes a positive finite current area.
- T20 is heuristic-grade: verification confidence/evidence are carried
  verbatim, never strengthened; an UNVERIFIABLE verdict is never promoted.
- One attempt per plan per checkpoint posture: `iteration` is pinned to 1 in
  the transaction id derivation; a real loop host would re-plan per iteration
  (the plan/target ids are iteration-independent by design).

## 14. Examples (the golden chain: dev-8305da82 -> sct-86f52be0 -> scp-f09b1135 -> atx-8f9fc7f8)

The C6 worked example, reproduced byte-for-byte by the test suite (A-16,
B-2, D-4, E-2, J-1, K-1) and by Checkpoint F's live probe:

```
document        : rect (100,100) 200x100  -> world area 20000, center (200,150)
REAL T20        : role 'shape' (mid-band: 5000 <= 20000 <= 100000 -> the
                  else-branch 'shape', semantic.js:184-188; flips at 100000)
deviation       : dev-8305da82  (content id over the §13 record)
diagnosis       : sct-86f52be0  CORRECTABLE, capabilityId cap-shape-background
plan            : scplan-582b7a32  expectedRegression {status: 'IMPROVED', reason: null}
proposal        : scp-f09b1135  s = 2.29128784747792
                  matrix {a: s, b: 0, c: 0, d: s, tx: -258.257569495584, ty: -193.693177121688}
                  predictedWorldArea 105000 (= 100000 * 1.05, exactly)
attempt         : atx-8f9fc7f8  ONE transaction, inverseKind 'snapshot',
                  diffCounts {added: 0, removed: 0, modified: 1}
post document   : rect (-29.128784747791997, 35.435607626104) 458.257569495584 x 229.128784747792
                  -> world area 105000 (exactly)
REAL T20 re-run : role 'background'
verification    : SATISFIED, actualRole 'background', confidence/evidence verbatim
regression      : detectSemanticRegression(VIOLATED-pre, SATISFIED-post) -> IMPROVED
convergence     : detectSemanticConvergence([pre, post]) -> VERIFIED
rollback        : ROLLED_BACK (reason null) -> stores restored, REAL T20 re-derives 'shape'
no-capability   : text->heading -> UNSUPPORTED_TRANSITION/ROLE_PAIR_UNSUPPORTED
                  -> agenda null -> NO transaction -> the host's honest fall-through
```

The chain is fully deterministic: re-running the pipeline over the same
document reproduces every id and every number with no RNG and no wall clock
(spec §19) — the property the whole module is built to guarantee.
