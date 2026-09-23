# src-js/correction.js — MODULE DOCUMENTATION (PHASE 3.15)

The Correction Loop engine: closes the execution–feedback–correction loop
between PHASE 3.13 (ai.js) and PHASE 3.14 (evaluation.js / critic.js). Given
an EvaluationResult whose deviations the Planner/Critic pipeline could not
prevent, this module diagnoses, plans, executes, re-evaluates, and either
verifies or honestly terminates. This file documents the module per spec §55
(single-file house style mirroring ai.js / evaluation.js / critic.js) and the
§53-mandate documentation precedent of the two 3.14 READMEs. All line
references cite `src-js/correction.js` unless another file is named.

---

## 1. Module identity — one file, zero imports

Everything PHASE 3.15 adds lives in this single module
(`correction.js:1-3335`, 76 exports). The import contract is pinned to
EXACTLY ZERO imports: the substrate (tool registry, transaction machinery),
the critic, and the document are INJECTED duck-typed at the call site and
never constructed here (header `correction.js:327-338`; the counted pin is
test G-1, `tests/correction.test.mjs:3615`). Helpers that other modules get
from their imports are local house copies: `stableStringify`
(`correction.js:607`), `fnv1a32` (`:619`), `contentId` (`:628`),
`deepFreeze` (`:590`). Consequences: no fs/network/DOM/eval surface
(test G-2, `:3622`), no autonomous scheduling primitive (test G-7, `:3684`),
and no npm dependency can enter through this module (test G-10, `:3711`).

## 2. State machine (§3/§5)

Eleven states (`CORRECTION_LOOP_STATES`, `correction.js:661-665`): IDLE,
PLANNING, EXECUTING, EVALUATING, DIAGNOSING, CORRECTING, RE_EXECUTING,
RE_EVALUATING, VERIFIED, ROLLING_BACK, TERMINATED. Transition legality is a
frozen literal map (`CORRECTION_LOOP_TRANSITIONS`, `:1238-1252`): the
eleven §3 cycle edges plus the disclosed derived edges
(EVALUATING→VERIFIED clean pass, RE_EVALUATING→DIAGNOSING cycle,
ROLLING_BACK→DIAGNOSING retry, ROLLING_BACK→TERMINATED, VERIFIED→TERMINATED
formal close). `canTransition` (`:1253-1258`) is the pure predicate;
`transitionSession` (`:1259-1280`) validates, refuses TERMINATED-source
jumps, and returns a NEW deep-frozen session with the trail appended —
records are immutable, never patched. `terminateSession` (`:1281-1304`)
enforces the §50 termination contract: every non-USER_CANCELLED reason must
arrive over a legal §3 edge, while §53 USER_CANCELLED is legal from ANY
active state at ANY iteration (test A-31, `tests/correction.test.mjs:714`).
TERMINATED is absorbing and always carries a
`CORRECTION_TERMINATION_REASONS` value (`:666-671`).

## 3. Session (§4) and Policy (§18)

A `CorrectionLoopSession` (`createCorrectionLoopSession`,
`correction.js:1108-1160`; validator `:1161-1237`) is inert frozen plain
data: content-derived `loop-` id, rootIntentId, rootTransactionId
(§4 field name; the §12 prose calls it parentTransactionId — header
disclosure 1), iteration counter, state, `visitedStates` trail,
`corrections` (the §6 attempt trail), currentEvaluation, and optional
terminationReason. Sessions never carry authority — no substrate, no
critic, no functions (function-path scan, `correction.js:572-589`; test
A-5 discipline). A `CorrectionLoopPolicy` (`POLICY_DEFAULTS`,
`:695-704`; `createCorrectionLoopPolicy` `:705`; validator `:715-751`)
carries the §18 loop-safety budget: maxIterations (5), maxConsecutiveNoProgress
(3), minimumImprovementDelta (0.01), maximumRegression (0.05), and the three
booleans allowOscillationRecovery / preserveBestState /
rollbackOnCriticalRegression (all true by default). Policy is validated
strictly against these types and ranges; unknown keys refuse.

## 4. Target (§7) and Attempt (§6)

A `CorrectionTarget` (`createCorrectionTarget`, `correction.js:754-774`)
freeses the correction agenda entry: content-derived `ctarget-` id, one of
11 §7 categories (`CORRECTION_TARGET_CATEGORIES`, `:676-680`), objectIds,
metric, observedValue, one of 4 severities (`:681`), confidence in [0,1],
and a non-empty evidence array (§28 evidence discipline). A
`CorrectionAttempt` (`createCorrectionAttempt`, `:1030-1053`; statuses
`:672-675`) is ONE auditable correction try: iteration, embedded target,
embedded plan, its own transactionId, the mandatory beforeEvaluation, and a
status; afterEvaluation/delta are appended by the acceptance stage — a
distinct immutable stage record per status (header disclosure, `:87`).
Validators (`validateCorrectionTarget` `:795`; `validateCorrectionAttempt`
`:1075`) enforce the exact key sets and cross-field coherence.

## 5. Diagnosis (§8) — resolution, not invention

The Critic does not produce commands; a failure first becomes a TARGET,
then a `CorrectionDiagnosis` (`createCorrectionDiagnosis`,
`correction.js:824-841`; 10 root causes `:683-688`). Resolution is a
deterministic attribution table `CATEGORY_TO_ROOT_CAUSE` (`:1305-1327`)
from the §7 category to the §8 root cause; `resolveCorrectionDiagnosis`
(`:1383-1427`) derives the diagnosis from the target with the
capability-backed recommended strategies. Where no capability exists the
honesty rule applies: categories SEMANTIC/CONSTRAINT/TEXT resolve to
NO_CAPABILITY — a frozen, self-describing record that cannot enter
planning (tests B-10/B-11, `tests/correction.test.mjs:914, :923`;
test B-1 pins the 11-key table `:788`).

## 6. Strategy (§9), ranking (§19), impact/cost, explainability

A `CorrectionStrategy` (`createCorrectionStrategy`,
`correction.js:884-901`) names one capability-backed correction: applicability,
the command descriptors, expectedEffect, risk ∈ {LOW, MEDIUM, HIGH}
(`:689`), a reversibility flag, and confidence ∈ (0,1] — strictly positive
so every legal strategy is viable (header disclosure 7). Candidate
strategies are ranked by the deterministic §19 priority:
Severity × Confidence × Impact × Correctability with the disclosed §19
weights (`:1361-1365`); `rankCorrectionStrategies` (`:1502-1542`) returns
the frozen ranked list with EXACT priorities, deterministic ordering, and
diagnosis-recommendation tie-breaks (tests B-16–B-19,
`tests/correction.test.mjs:977-1018`). `computeCorrectionImpact`
(`:1437-1467`, §20: LOCAL/SUBTREE/GLOBAL scope, secondary objects,
reversibility) and `computeCorrectionCost` (`:1468-1501`, §38:
deterministic integer total = riskWeight × (commandCount + objectCount))
feed the ranking and the preview. Explainability is first-class:
`explainCorrectionDiagnosis` (`:1543-1564`) and
`explainCorrectionStrategySelection` (`:1565-1600`, §27) produce frozen,
human-readable rationales with the numeric factors attached.

## 7. Plan (§10/§11) generation and Preview (§42)

`deriveCorrectionCommands` (`correction.js:1752-1798`) materializes a
strategy's descriptors into EXACT command deltas through the capability
recipes (`CORRECTION_CAPABILITY_RECIPES`, `:1328-1353`) and the local
input contract (`CORRECTION_CAPABILITY_INPUT_CONTRACT`, `:1601-1616`)
that mirrors the LIVE tool validators (test C-18,
`tests/correction.test.mjs:1446` — necessary AND sufficient). Planning is
refusing by design: `generateCorrectionPlan` (`:1956-2054`) emits a frozen
§10 `CorrectionPlan` (`createCorrectionPlan` `:951`; validator `:986-1027`)
only when evidence, scope, and hard constraints permit — otherwise the
frozen refusal vocabulary `PLAN_REFUSAL_REASONS` = INSUFFICIENT_EVIDENCE /
HARD_CONSTRAINT_REJECTED / OUT_OF_SCOPE (`:1950-1955`) with the §35 context
attached (tests C-12/C-13, `:1344, :1356`). A plan is session-bound
(plan.sessionId must name the owning session) and diagnosis-bound.
`buildCorrectionPreview` (`:2055-2098`, §42 dry run) returns the exact
affected objects, the materialized commands, the §43 RULE_BASED
expectedEvaluation, and the exact §38 cost — no execution (test C-16,
`:1410`).

## 8. Safety: hard constraints, scope, dependencies

`evaluateCorrectionSafety` (`correction.js:1870-1914`, §35–§37) is the
rule-based REJECT gate: a plan whose command mutation axes
(`TOOL_MUTATION_AXES`, `:1667`; canonical-axis derivation `:1679-1722`)
would move a pinned hard-constraint axis (`CONSTRAINT_PINNED_AXES`,
`:1648`) is refused with the §35 context BEFORE any execution.
`verifyCorrectionScope` (`:1915-1949`, §40) proves every command's object
ids stay inside the affected set; `scanCorrectionDependencies`
(`:1799-1869`, §41) derives the dependency closure so downstream objects
are not silently broken. These are read-only analyses over plain data —
the safety layer never executes anything.

## 9. Execution (§12), acceptance (§14), regression (§15), best state (§16)

`executeCorrectionAttempt` (`correction.js:2492-2571`) turns ONE plan into
ONE INDEPENDENT substrate transaction: a content-derived `atx-` transaction
id passed EXPLICITLY through `TransactionBuilder.begin({id})` (`:2528-2531`)
with parentId = the session root — lineage, never nesting (disclosure 25;
test G-9 pins the begin-receiver). Commands are wrapper Commands routing
the plan descriptors through the LIVE tools after pre-flight registry
validation (`executionPreflightRefusal` `:2464-2491`; the only
`tool.execute` in the module lives inside the wrapper Command body —
disclosure 26, pinned by test G-6, `:3669`). A runtime tool failure fails
the transaction ATOMICALLY (stores untouched, nothing pushed — substrate
guarantee, `transaction.js:225-228`) and surfaces as a FAILED attempt.
`acceptCorrectionAttempt` (`:2572-2674`) is the §14 verdict authority:
ACCEPTED only on strict post > pre improvement of the plan metric
(`metricGapOf` `:2140-2159`), the §15 critical-regression gate, structural
validity, and transaction validity — otherwise REJECTED with a reason from
`CORRECTION_REJECTION_REASONS` (`:2100`). `detectCorrectionRegression`
(`:2314-2387`, §15) emits the frozen RegressionReport (criticality =
target-metric regression, new error deviations, or worsening beyond
`maximumRegression` — `:2369-2373`); critical + policyRollback drives the
§3 ROLLING_BACK disposition. `preserveCorrectionBestState` (`:2282-2308`,
§16) keeps the best evaluation under the strict deterministic total order
`isBetterEvaluation` (`:2270-2281`: errors, then warnings, then canonical
id tie-break) — the loop never assumes last is best (test D-16,
`tests/correction.test.mjs:2025`; test D-19 `:2112`).

## 10. Fingerprints, no-progress (§30/§33), oscillation (§31)

`computeCorrectionFingerprint` (`correction.js:2166-2181`, §30) hashes the
plan's identity content; `computeEvaluationFingerprint` (`:2182-2189`)
hashes the evaluation's deviation identity. `shouldSkipCorrection`
(`:2226-2255`, §33) SKIPs the Δ=0 re-application of the same correction
(idempotency; test D-17, `tests/correction.test.mjs:2057`).
`detectCorrectionOscillation` (`:2208-2225`, §31) detects A→B→A cycling as
fingerprint recurrence over the post-attempt trail (disclosure 40: rolled-back
entries keep their post-attempt fingerprints; a rollback restore is safety
working, not oscillation). The no-progress streak (`detectCorrectionNoProgress`,
`:2190-2207`) counts consecutive near-zero deltas against
`maxConsecutiveNoProgress`.

## 11. Rollback (§32)

`rollbackCorrectionAttempt` (`correction.js:2675-2715`) rides the
substrate's OWN undo API — it never re-implements inverse machinery. The
top-of-history guard (`:2687-2696`) reads `historyManager.getTransactionToUndo`
(the ONLY sanctioned history reach in the module — test G-5, `:3663`) and
refuses to undo a foreign transaction. The substrate's undo reconstructs
inverse commands where every command carries `getInverse` and falls back to
the before-snapshot restore otherwise (`transaction.js:214-218`, snapshot
restore path `:291-297` via `createRestoreCommands` `:298`). The engine's
manual rollback operation (`engineRollback` `:3304-3328`) performs the REAL
undo, reports ROLLED_BACK at the ROLLING_BACK position, and refreshes
through the critic (test E-17, `tests/correction.test.mjs:2567`); the
HistoryManager stays LINEAR throughout — invariant 13 incl. the
undo-truncation signature (tests D-18 `:2076`, F-5 `:3086`, F-11 `:3269`).

## 12. Convergence (§17), Modes (§26), Engine orchestration (§24)

`detectCorrectionConvergence` (`correction.js:2828-2863`) is the engine's
judgment OVER the critic's records — never a re-derivation: VERIFIED
(agenda-scoped gap zero), NO_PROGRESS (streak exhausted),
OSCILLATION_DETECTED, MAX_ITERATIONS_REACHED, or CONTINUE
(`CORRECTION_CONVERGENCE_KINDS` `:2746`). `CorrectionEngine`
(`:3329-3335`) is the §24 driver: five pure operations
`start / iterate / run / terminate / rollback` (`engineStart` `:3208`,
`engineIterate` `:3244`, `engineRun` `:3273`, `engineTerminate` `:3293`,
`engineRollback` `:3304`) over immutable engine states — no cycles, no
self-scheduling (test G-7). Modes dispatch through the frozen table
`CORRECTION_MODE_DISPATCH` (`:2751-2757`): AUTO iterates to termination
behind the guarded bound (the module's ONLY `while`, capped at
`policy.maxIterations + 2` with the §17/§18 throw — `:3282-3289`; test G-8
pins the static face `:3691`, the dynamic face is E-18's 48-seed battery
`:2583`); GUIDED parks the proposal as `pendingProposal` and waits for
`{approved}` directives (tests E-11/E-12, `tests/correction.test.mjs:2458,
:2491`); SINGLE_STEP executes one attempt per engine lifetime (test E-13,
`:2505`; dispatch determinism E-14 `:2522`; AUTO end-to-end E-5 `:2348`).
Termination always lands with a §50 reason
and a valid session.

## 13. Audit metadata (§45/§46/§47/§48)

Audit is realized as immutable records, not a log file: the session trail
(`visitedStates`, `corrections` — one FINAL stage record per attempt),
the engine's iteration ledger (per-iteration `{iteration, plan,
beforeEvaluation, afterEvaluation, outcome, attempt}` — the §45 event
source of truth; disclosure 40), the per-call `lastReport` action record
(STARTED/PROPOSED/WAITED/APPROVED/PROPOSAL_REJECTED/ATTEMPT/
MANUAL_ROLLBACK/TERMINATED — disclosure 38), and the host-facing
`buildCorrectionHistoryMetadata` (`:2718-2732`, §47/§48:
`{source:'correction', sessionId, attemptId, transactionId, iteration,
attemptStatus}`) that rides the substrate's history metadata without
touching its topology (test F-12, `tests/correction.test.mjs:3298`).
Every record is deep-frozen plain data, content-derived, losslessly
JSON-round-trippable, and free of Date.now()/uuid entropy (test D-20,
`:2145`; disclosure 41).

## 14. Integration (§21/§22/§23/§25)

The engine is a CONSUMER ONLY of the Critic: `validateCorrectionLoopRequest`
(`correction.js:2767-2827`) refuses any request whose injected
`critic.evaluate(document, context)` is missing (§23 — the loop never
self-evaluates, `:2800-2801`), demands the §25 envelope fields, and
plain-data-scans the request (disclosure 33/G-47: `document` is a
sanctioned request FIELD, never the global). Every evaluation — initial
and per-iteration — comes from the critic verbatim (`:3089-3090`);
convergence and acceptance are judgments OVER those records (disclosure
35). Planner integration (§21) is the disclosed re-entry discipline:
corrections ride the SAME validateIntent → createPlan → validatePlan gate
the Planner owns — this module builds CorrectionPlans for its own
attempts and never passes the Planner's gate for it; proposals and
correction intents stay inert data across the boundary. Transaction
integration is the injected substrate trio {registry, transactionManager,
transactionBuilder} plus the read-only scene projection
`findNodeByObjectId` (test G-4, `:3655`) and the WorkingCopy view mirror
(test G-6, `:3669`).

## 15. Determinism (§44) and architecture pins

For the same document + evaluation + policy + strategy the module produces
byte-identical canonical records: content-derived ids everywhere
(loop-/attempt-/ctarget-/diag-/strategy-/cplan-/atx-), key-sorted canonical
JSON, no clocks, no randomness (test D-20, `tests/correction.test.mjs:2145`;
test C-15 `:1394`). The static architecture pins live in the counted G-era
suite (`tests/correction.test.mjs:3615-3768`): zero imports (G-1), alias-form
capability ban with the request.document carve-out (G-2), mutation-surface
receiver pinning (G-3/G-6), scene-graph boundary (G-4), HistoryManager
read-pin (G-5), no autonomous loop (G-7), MAX_ITERATIONS boundedness (G-8),
no nesting/DAG (G-9), zero npm dependencies (G-10), frozen src/core
178-file manifest (G-11), anti-vacuity harness sanity (G-12). Probe
evidence: `scripts/phase3.15-evidence/3.15-G-probe.txt` (re-run green at H:
`3.15-H-probe.txt`).
