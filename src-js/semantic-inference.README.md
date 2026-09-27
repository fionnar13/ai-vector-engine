# src-js/semantic-inference.js — MODULE DOCUMENTATION (PHASE 3.17)

The T20 semantic-inference normalization module: a deterministic, zero-import
boundary that turns a raw T20 `infer_semantic` tool result into stable,
deep-frozen, entropy-free semantic records (and honest refusals), ready for
the Planner / Evaluation / Critic / Correction surfaces built in Checkpoints
C–F. This file documents the module per the §93-precedent convention (the 14
mandated topics, in the mandated order, as pinned by the 3.16 M-18 test) and
is pinned by counted test H-1 (`tests/semantic-inference.test.mjs`, the M-18
mirror). All line references cite `src-js/semantic-inference.js` unless
another file is named.

---

## 1. Mission

Pure normalization — nothing else. The module owns the boundary between the
raw T20 tool result (the frozen `tools.js:973-999` surface delegating to the
frozen engine `semantic.js:122-280`) and the rest of the 3.17 pipeline. It
reads one tool-result envelope, validates it, and returns frozen normalized
records and frozen refusal records. It declares NO imports of any kind
(:4-7, the `constraint-inference.js:1-38` zero-import discipline, spec §44);
it holds no store, writes nothing anywhere, never mutates caller structures,
and never throws (BD-6). A normalized record is evidence-backed information
that a semantic role MAY apply — it is never canonical document state
(Invariant 15; spec §32's session-local ownership branch).

The module carries exactly one factory face: `createInferenceSession`
(:289-311), whose session exposes `ingest` / `getRecords` / `getRefusals` /
`getRegistry`. The private machinery beneath it: `normalizeResult`
(:256-287), `normalizeProposal` (:224-254), `createRefusal` (:214-222), the
content-id pair `stableStringify` (:171-179) + `fnv1a32` (:181-189) +
`deriveRecordId` (:191-194), `cloneData` (:196-212), `deepFreeze`
(:162-169), and the plain-data validators (:159-160).

## 2. T20 role

T20 (`infer_semantic`, `tools.js:973-999`) is the ONLY origin this module
accepts. T20 is a proposal-category tool: it reads geometry, appearance,
scene structure, and world bboxes, and emits `{success, output:{proposals}}`
envelopes whose proposals carry `proposedRole`, graded `confidence`,
sorted `evidence`, and `source:'heuristic'` (the ALGORITHM name; the tool is
the ORIGIN — BD-4 normalizes the record's `source` to the constant `'T20'`).
T20 is deterministic (`deterministic:true`, `tools.js:974`) and never writes
the SemanticStore (the :47/:54 gate). This module NEVER calls T20: the
caller runs the tool and hands the envelope to `ingest`. In Checkpoint G's
golden scenario the same real tool doubles as the D-1 role provider's
derivation source (the §31 bridge), re-run against the current document.

## 3. Proposal lifecycle

`ingest(envelope)` -> `normalizeResult` -> per-proposal `normalizeProposal`
-> ACCEPT (a seven-field frozen record) or REFUSE (a flat frozen refusal
record). Accepted records accumulate in session-local arrays;
`getRecords`/`getRefusals`/`getRegistry` return deep-frozen plain snapshots
(:299-310). The lifecycle ends at the Planner: Checkpoint C consumes
`getRecords()` as the optional `PlanningContext.semantic` array, and only
records with `status === 'PROPOSED'` can enter `ExpectedState.semantic.
expectations` (the CD-3 filter; refusals are never promoted into desired
state — O-11). Nothing in the module tracks state beyond the two arrays;
there is no store, no persistence, no eventing (spec §32).

## 4. Semantic vocabulary

The normalized role vocabulary IS T20's emission vocabulary — seven roles,
pinned locally as `T20_EMITTED_ROLES` (:150-158 area, the BD-1 pin):
`text, heading, background, shape, icon, container, unknown`. No mapping
onto the 14-role `VALID_ROLES` house set (`semantic.js:6`) and no aliases
exist anywhere in src-js (Checkpoint A-2/A-4 findings). `'unknown'` is
accepted as a real role — T20 honestly labels no-evidence objects
(`semantic.js:239-249`, BD-2). The refusal vocabulary is exactly two
machine reasons: `UNSUPPORTED_TYPE` (a role outside the seven, :148) and
`MALFORMED` (a non-plain-object proposal, missing objectId, or a
non-string role, :149/:224-226). Envelope-level failures (e.g. T20's
precondition failure `{success:false, errors:[...]}`) also refuse, with the
upstream envelope preserved (BD-6, `normalizeResult` :256-287).

## 5. Planner integration

The Planner consumes accepted records VERBATIM as the optional
`PlanningContext.semantic` array (`ai.js` §13 projection, Checkpoint C /
spec §56): plain-data + no-functions + deep-frozen, accepted without any
Planner code change (CD-5). `createExpectedState` applies the semantic
section `{satisfied: null, expectations: [...]}` — `satisfied` stays the
unevaluated null marker (the Planner invents no verdict), `expectations`
carries the accepted records verbatim in order (CD-1), and a semantic-free
context reproduces the pre-3.17 ExpectedState byte-identically (CD-2).
Refusals cannot enter the desired state (CD-3). The Planner stays read-only
w.r.t. semantics: zero coupling to this module (no import), no transactions,
no store writes (CD-6, pinned by O-6..O-8).

## 6. Evaluation integration

The D-1 semantic arm inside `evaluation.js` evaluates the accepted agenda
against the CURRENT document (Checkpoint D / spec §57). The ACTUAL role
comes ONLY from the injected provider `evaluationContext.getActualRole
(objectId)` (DD-1) — no evaluation-to-tools coupling, no store read; in the
Checkpooint G golden scenario the provider re-runs the REAL T20 against the
document it is handed (the §31 bridge, SG-4). The arm emits the five §57
statuses ONLY where actually supported — `SATISFIED` / `VIOLATED` /
`UNSUPPORTED` / `UNEVALUABLE` / `INSUFFICIENT_EVIDENCE` — with deterministic
machine reasons, never guessing (DD-2). A VIOLATED verdict rides ONE
reserved `category:'semantic'` deviation per expectation (DD-4; the
evaluation.js:146 category, dormant since 3.14), and the total
null-normalized sidecar `metadata.semanticResults` preserves
{objectId, role, status, confidence, reason} in agenda order (DD-5). The
arm is pure, read-only, deterministic, and adds NO exports (P-11/P-13).

## 7. Critic integration

The E-1 semantic rule inside `critic.js` DECLINES semantic deviations
(Checkpoint E / spec §58): semantic deviations produce NO correction
proposal — the §28 honest decline (EE-1; the proposal validator rejects any
non-capability intent type, a capability-typed broken intent would fake a
capability request, and the 3.16 size/distance precedent is "surfaced,
never patched"). The diagnostic signal is the EXISTING D-1 sidecar plus the
verbatim B-record agenda on `result.expected.semantic.expectations` (EE-2)
— the critic adds no new channel and preserves evidence, provenance, and
confidence verbatim while mutating nothing (the §58 duties, pinned Q-7/
Q-12). The explicit `category === 'semantic'` routing lives in
`proposalFor` + the named `semanticProposalFor` decline function (EE-3).

## 8. Correction integration

The F-1/G-1 correction face (spec §59/§60) is the EXISTING frozen
Correction Loop, unchanged: a semantic deviation reaches the loop only
through the §7 CorrectionTarget agenda (the caller's projection — FD-2),
attribution maps `SEMANTIC -> SEMANTIC_ERROR` (`correction.js:1305-1317`),
and the capability table carries ZERO `SEMANTIC_ERROR` recipes (A-9), so
capability resolution returns `NO_CAPABILITY` and the loop terminates
honestly `TERMINATED` / `UNFIXABLE` with the session at IDLE (the no-cycle
rule; FD-4/FD-5). No transaction is ever opened for a semantic deviation;
the ledger carries the honest NO_CAPABILITY record with the D-1 sidecar
verbatim as evidence (the R-9 channel). The golden scenario (Checkpoint G)
proves this end-to-end on the live substrate.

## 9. Satisfied/unsupported semantics

The phase's honesty core (the hard/soft analog): an unmeasurable semantic
expectation can NEVER become verified. `UNEVALUABLE` (no provider),
`UNSUPPORTED` (a role outside the seven-role emission set on either side),
and `INSUFFICIENT_EVIDENCE` (provider returns null) all produce NO
deviation and never flip a result to satisfied (P-4/P-5/P-8, S-C-3/S-C-6).
A VIOLATED verdict requires a REAL measured mismatch: expected role (an
accepted record) vs an actually re-derived role. The §31 posture is
asserted, not assumed: T20 infers roles from scenes that ALREADY satisfy
them, so a satisfied inference does not naturally produce a violation —
the Checkpoint G golden drift comes from a REAL T06 scale transaction
observed by the engine's own re-derivation (SG-2/SG-3). No confidence
thresholds are invented anywhere (BD-3, spec §36).

## 10. Transaction boundary

This module is transaction-free by construction: no imports (BD-7), no
builder, no executor, no store contact (S-D-4/S-D-6 scans; N-16). The ONLY
writer in the 3.17 pipeline remains the frozen transaction pipeline
(Plan -> DSL -> Tool Registry -> Transaction -> Commit, Invariant 8). In
the golden scenario the drift IS a real registry-dispatched transaction
(executeViaSubstrate -> TransactionBuilder -> TransactionExecutor ->
HistoryManager), and the correction leg opens ZERO transactions (S-A-5) —
no capability, no attempt, no transaction.

## 11. History linearity

The module cannot affect history: no HistoryManager reference anywhere in
the 3.17 surface (S-D-5), no history writes (the engine's frozen
rollback-pointer probe is read-only and was never reached on the semantic
path). The golden history is strictly append-only linear: creations + the
one drift transaction, unique ids, zero loop appends, the §3 state trail
stays `['IDLE']` (S-A-6/S-C-9, Invariant 13). No attempt transaction, no
rollback, no undo pointer movement (S-C-8).

## 12. Determinism

Normalization is a pure content function: record ids are `smr-` +
fnv1a32 over the key-sorted canonical content {objectId, role, confidence,
evidence} (BD-5, :191-194) — upstream entropy (proposalId uuid, createdAt
wall-clock) is stripped. Two sessions ingesting the same envelope produce
byte-identical registries (S-C-2); two independent golden runs normalize
identically modulo the declared substrate identity entropy (S-A-3, the
3.16 M-2 canonical-evidence projection). Downstream: identical agendas ->
identical deviation ids and semanticResults (P-9); identical engine runs ->
identical canonical outcomes (S-B-2, Invariants 17/19).

## 13. Failure behavior

The module NEVER throws (BD-6). Every failure normalizes to a frozen
refusal record `{status:'REJECTED', reason, upstream}` (:214-222) — the
3.16 refusalLedger precedent family. Refusal reasons: `MALFORMED`
(structurally invalid proposal or envelope), `UNSUPPORTED_TYPE` (role
outside the seven-role vocabulary). Envelope-level tool failures (T20
precondition failures) refuse with the upstream envelope embedded.
Cumulative state stays honest: refused inputs never appear in
`getRecords()`. Downstream, unsupported roles that are hand-carried into
an agenda are caught by the D-1 arm as `UNSUPPORTED` (never satisfied),
and malformed agendas are refused loudly by the host guards (CD-4, DD-8).

## 14. Known limitations

- The module is a NORMALIZATION boundary, not a second semantic engine
  (spec §67): all inference lives in the frozen T20/semantic.js pair.
- NO semantic correction capability exists (A-9/E-1/F-1): semantic drift
  terminates honestly NO_CAPABILITY/UNFIXABLE; restoration is future
  DATA + REGISTRY work (a registered role-restoration tool + one
  SEMANTIC_ERROR recipe) requiring NO loop change (F's S-F3).
- `satisfied` stays the unevaluated null marker: boolean production
  (ownership of a settled semantic verdict) is future work.
- The `SEMANTIC_BLOCKED` termination vocabulary slot exists
  (correction.js:666-670) but is NOT wired to this path — pinned as-is.
- Live-T20 round-trip beyond the repo's own harness (a production host
  invoking the tool outside the test context) remains unverified.
- Mixed multi-target agendas (SEMANTIC + non-semantic in one loop run) and
  GUIDED/SINGLE_STEP loop modes over a SEMANTIC agenda are untested.
- T20's role derivation is heuristic-grade (evidence weights, no learning);
  the module preserves its outputs verbatim and invents nothing.
