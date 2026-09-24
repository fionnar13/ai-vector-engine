# src-js/constraint-inference.js — MODULE DOCUMENTATION (PHASE 3.16)

The T19 constraint-inference module: a deterministic, zero-import vocabulary
mapping that turns an utterance plus a participant list into evidence-backed
constraint PROPOSALS, and projects accepted proposals onto the plain house
records the live ConstraintStore consumes. This file documents the module per
spec §93 (the 14 mandated topics, in the mandated order) and is pinned by
counted test M-18 (`tests/constraint-inference.test.mjs:1825`). All line
references cite `src-js/constraint-inference.js` unless another file is named.

---

## 1. Mission

Pure constraint inference — nothing else. The module reads a request
(`{utterance, objects[], strength?}`), maps it deterministically onto the house
constraint vocabulary, and returns `{proposals, unmatched}`
(`inferConstraints`, :220-264). It never touches document state: it declares
NO imports, holds no state, and writes nothing anywhere (:4-7); every entry
point is read-only over its inputs and the acceptance store clones rather than
aliases (:36-37). A proposal is evidence-backed information that a
relationship MAY exist — it is never authoritative document state (spec §12,
`docs/spec-3.16.md:348-364`).

The module carries three faces: the inference face (`inferConstraints`,
:220-264), the acceptance projection (`toHouseConstraintRecord`, :316-331),
and the validators (`validateInferenceRequest` :186-212,
`validateInferredConstraint` :268-309, `validateHouseConstraintRecord`
:336-377). Downstream, the accepted regime is declared by the Planner in the
ExpectedState (`ai.js:488-498`), measured by the evaluation compliance arm
(`evaluation.js:1004-1018`), corrected by the critic constraint rule
(`critic.js:416`) through the frozen 3.15 engine, and re-verified — the
constraint route of the full pipeline.

## 2. T19 role

T19 is the engine's pre-existing `infer_constraints` PROPOSAL capability. The
frozen-tree definition (`src/core/tools/proposal/inferConstraints.ts:5-10`)
fixes its category contract: id `T19`, category `proposal`, "MUST NOT mutate
ConstraintStore governed by C03", `deterministic: true` (:23). Per spec §06
the live implementation is authoritative for input/output shape, proposal
fields, failure behavior, confidence, and supported types
(`docs/spec-3.16.md:197-220`); it was inspected read-only per §07 before any
production edit.

The JS substrate implements that contract as THIS module, under the A-2/D-8
intersection decision (Checkpoint A): the supported type set is the
intersection of what T19 can express and what the evaluation surface can
measure (:8-20). Two deliberate deltas from the frozen-tree MVP, both
disclosed: the type vocabulary is NARROWED to the four measurable types (:42;
the frozen MVP also emitted `symmetry`, `inferConstraints.ts:120` — see §14,
the B3 ruling), and proposal ids are content-derived and deterministic
(:172-180) where the MVP used `Date.now()` entropy
(`inferConstraints.ts:56`). The proposal-category discipline — produce
proposals, never direct writes (spec §44: "T19 must not bypass it") — is
preserved verbatim and counted (M-13/M-15,
`tests/constraint-inference.test.mjs`).

## 3. Proposal lifecycle

```text
request {utterance, objects[>=2], strength?}
  -> validateInferenceRequest (:186-212)
  -> inferConstraints (:220-264)          deterministic phrase mapping
  -> ConstraintProposal[] (+ unmatched)   deep-frozen plain data (:263)
  -> validateInferredConstraint (:268-309)
  -> toHouseConstraintRecord (:316-331)   the pass-through projection
  -> HOST acceptance into the LIVE ConstraintStore   (a host decision, §16/§20)
  -> declared as the desired regime: ExpectedState.constraint.satisfied
     = {records: [...], tolerance?}  (ai.js:488-498)
  -> evaluation compliance arm (evaluation.js:1004-1018)
  -> critic constraint rule (critic.js:416)
  -> frozen 3.15 CorrectionEngine -> correction Transaction -> re-evaluation
```

Lifecycle rules: the request must carry a non-empty utterance and at least two
object entries (constraints relate >=2 objects, :195-207); strength defaults
to `strong` (:227) and can never be `required` from inference (:208-210).
Each phrase-table row matches at most once, rows run in fixed order, and the
house-type set dedups first-wins (:65-67, :229-232, :249-253); the
unqualified `centered` phrase expands to both center axes in the fixed
x-then-y order (:254-261). An utterance that maps nothing is reported
honestly in `unmatched` — nothing is invented (:216-219, :262). Acceptance is
NEVER automatic: a proposal does not become canonical merely because T19
returned it (spec §16, `docs/spec-3.16.md:461`; acceptance policy §20). The
projection is pass-through by discipline — id, participant order, and
strength are preserved verbatim, with no re-id and no reshaping (:311-315) —
and the audit trail rides in the record's `provenance`
(`{t19Type, inferredBy: 'T19'}`, :329).

## 4. Constraint vocabulary

The implemented vocabulary is the A-2/D-8 intersection, counted by test A-1:

- `T19_SUPPORTED_TYPES` (:42) — exactly `{equalWidth, equalHeight, align,
  center}`.
- `T19_HOUSE_MAPPING` (:44-49) — `equalWidth`/`equalHeight` map verbatim;
  `align` maps to `alignLeft | alignRight | alignTop | alignBottom`; `center`
  maps to `alignCenterX | alignCenterY`. Eight house types are inferable.
- The FULL live house vocabulary is mirrored (zero-import discipline) for the
  pass-through validator: `ALL_HOUSE_TYPES` (:57-60) is exactly
  `constraints.js:6 VALID_TYPES` — eleven types including `horizontal`,
  `vertical`, and `fixedDistance`, none of which T19 infers.
- Strengths: house vocabulary `{required, strong, weak}` (:61, =
  `constraints.js:7`); the INFERRED vocabulary is `{strong, weak}` (:62) —
  T19 NEVER infers hard (`required`) constraints (:18-20, :208-210,
  :296-298); hard pinning is an explicit user act.
- Sources: `{user, ai}` (:63, = `constraints.js:8`); inference proposals are
  always `source: 'ai'` (:239, :299-301).
- `Symmetric` is NOT in the implemented vocabulary — spec §11 lists it as an
  expected architectural category (`docs/spec-3.16.md:330-340`) and the
  frozen-tree MVP emitted it, but the implemented intersection has no
  symmetry measurement route; see §14 (the B3 ruling).

## 5. Planner integration

Phase 3.16 adds the constraint-aware planning arms to `ai.js` (:1360-1549);
the planner's import contract stays exactly `./tools.js` — the axis and
quantity tables are MIRRORED, not imported (:1388-1390):

- `validateExpectedState` (:488-498) accepts the compliance-request form for
  `constraint.satisfied`: `null`, a bare boolean (the 3.14 unevaluated
  marker), or `{records: [...], tolerance?}` — the accepted constraint regime
  declared as the desired state.
- `EXPECTED_STATE_CONSTRAINT_QUANTITIES` (:1393-1404, exported) — the pinned
  quantity per type (width/height from geometry; minX/maxX/minY/maxY/centerX/
  centerY from the world bbox) for ten equality/alignment types.
- `verifyArrangementAgainstConstraints` (:1457-1512) — the DATA face. Pure
  and scene-less (:1363-1368): for each enabled constraint the pinned
  quantity is extracted per participant (`arrangementQuantityOf`,
  :1444-1455) and compared against the REFERENCE `objectIds[0]`; verdicts are
  `DISABLED` (:1475), `UNVERIFIABLE` with a reason (`UNSUPPORTED_TYPE`
  :1479, `OBJECT_MISSING` :1486, `QUANTITY_ABSENT` :1488 — the planner never
  invents a verdict), `VIOLATED` (:1504), or `SATISFIED` (:1506); the
  aggregate status (:1509-1511) is `VIOLATED > UNVERIFIABLE > PRESERVED`.
  Tolerance defaults to 1e-9 (:1467), the house kernel default
  (`constraints.js:9`).
- `verifyPlanStepsAgainstConstraints` (:1514-1549) — the STATIC MUTATION
  face. A step's mutated axes are classified from its tool and input
  (`stepMutationAxes`, :1423-1442: T05 by delta, T08/T09 by axis param,
  T07/T12 none, T06/T10/T11 and unknown tools conservatively everything);
  a HARD (`required`) constraint whose pinned axes (`PLANNER_PINNED_AXES`,
  :1406-1410) intersect the step's mutation axes AND whose participants the
  step touches CONFLICTS (:1530-1545). Soft constraints trade off at runtime
  and are deliberately not flagged here (:1386).

## 6. Evaluation integration

The compliance arm rides INSIDE the §55 `evaluate()` entry
(`evaluation.js:1004-1018`; no new exports — the 12-export surface is
pinned):

- A compliance request `{records: [...], tolerance?}` in
  `expected.constraint.satisfied` declares the accepted regime; a bare
  boolean stays the 3.14 unevaluated marker (:964, :1004-1007). When the arm
  runs, `evaluated` gains `'constraint'` (:1017).
- Tolerance: must be a finite number >= 0 (:1011-1013); default is
  `EVALUATION_TOLERANCES.geometry` (:1014).
- `CONSTRAINT_PINNED_PROPERTIES` (:1064-1076) — eleven house types map to a
  pinned PROPERTY class: `position.x` / `position.y` (align/center families),
  `size.width` / `size.height` (equalWidth/equalHeight),
  `position.distance` (fixedDistance) — the engine-correctability
  namespacing (:1040-1051).
- `constraintCompliance` (:1104-1174) is pure, read-only, deterministic
  (:1102-1103). Unobservable constraints are UNVERIFIABLE — nothing is
  invented (:1122-1128: `OBJECT_UNOBSERVED`, `GEOMETRY_UNMEASURABLE`;
  `MISSING_DISTANCE_PARAMETER` :1130-1133); disabled constraints are DISABLED
  and invisible (:1114-1116).
- LOCALIZATION (§30 honesty): ONE violation per constraint (:1053-1055).
  Expected is the REFERENCE participant's quantity (`objectIds[0]`,
  :1134-1137); a violation is the FIRST failing participant in objectIds
  order (:1139-1147; counted J-6, `tests/constraint-inference.test.mjs:995`).
  The deviation (:1152-1163) is category `geometry`, severity `error`, with
  the `$doc:` targetRef form (:1161) and a self-describing message (:1162).
- Provenance: `metadata.constraintDeviations` (:1168-1171 — deviationId,
  constraintId, referenceObjectId, violatedObjectId, property, expected,
  actual, error, tolerance) and `metadata.constraintResults` (:1165-1167)
  are attached to the result (:1023-1026) — exactly what the critic's
  constraint rule consumes.
- The model is POST-ACCEPTANCE DRIFT (:1033-1037): accepted constraints
  outlive their originating plan and are measured against the committed
  world boxes.

## 7. Critic integration

The constraint rule is the 3.16 arm of the §23 `proposeCorrections` rule
engine (`critic.js:448-509`; no new exports — the 6-export surface is
pinned):

- Dispatch (:416): `constraintProposalFor(d, evaluationResult) ||
  proposalFor(d, evaluationResult)` — a deviation with constraint provenance
  is owned EXCLUSIVELY by the constraint rule and is never re-interpreted as
  a desired-state geometry mismatch (:467-474).
- Routing: `constraintProvenanceFor` (:481-485) looks the deviation up by id
  in `metadata.constraintDeviations` — the evaluation arm's provenance record
  is the single source of constraint truth.
- Capability backing (§27/§28, :452-465): `CONSTRAINT_CORRECTABLE_PROPERTIES`
  (:477) is exactly `['position.x', 'position.y']`. A correctable violation
  yields a translate intent (:505-508) — `{type: 'transform',
  targets: [violated], operation: 'translate', params: {x, y}}` with
  `delta = expected - actual` on the pinned axis and 0 on the other
  (:497-498), T05 DELTA semantics with no side effects on any other axis.
- HONEST DECLINE: size-class (`size.width`/`size.height`) and distance-class
  (`position.distance`) violations produce NO proposal — the only size
  capability T06 is an origin-anchored scale that MOVES the object as a side
  effect, so no SAFE capability exists and the architecture is never
  bypassed (:460-465, :493; counted K-4 :1118 / K-5 :1126). Per §28 the gap
  is surfaced, never patched (:417).
- Everything else is the shared 3.14 discipline: dedup on canonical intent +
  targetRef + objectId (:418-420), priority = deviation index (:427),
  content-derived proposal ids, and the `evaluateAndCritique` composition
  (:442-446).

## 8. Correction integration

Constraint correction executes through the FROZEN 3.15 CorrectionEngine
(`src-js/correction.js`, byte-identical to the 3.15 G-pristine sha
`9e31da8d…`, pinned in-test at
`tests/constraint-inference.test.mjs:1805-1806`). Phase 3.16 adds nothing to
the engine; it feeds it:

- A position-class translate intent maps onto T05 (move_object) — the engine's
  derivation table carries rules ONLY for T05 (position metrics) and T07
  (opacity metrics) (`tests/constraint-inference.test.mjs:46-54`).
- Size-class agendas resolve the scale recipe but the plan refuses
  `INSUFFICIENT_EVIDENCE` (T06 is rule-less in the frozen derivation table)
  and the loop terminates `UNFIXABLE` — the disclosed boundary, never
  patched (L-4, :1304; L-5, :1331).
- HARD constraint safety (§38): a fix plan that must mutate a HARD
  constraint's pinned axis is refused (`HARD_CONSTRAINT_REJECTED`) and the
  loop terminates `CONSTRAINT_BLOCKED` with ZERO attempts — never silently
  degraded (L-3, :1293).
- One attempt is ONE independent substrate transaction with a content-derived
  `atx-` id (`correction.js:2530`; L-7, :1355) — no nesting (M-17), no
  engine-owned state leakage.
- The full arc is counted: rollback (L-9, :1373), history linearity (L-11,
  :1404), audit trail (L-14, :1474), and the §67 golden scenario (M-1) that
  closes T19 → acceptance → drift → violation → proposal → correction →
  re-evaluation → VERIFIED end-to-end.

## 9. Hard/soft semantics

The §19 distinction is preserved end to end
(`docs/spec-3.16.md:511-527`):

- T19 NEVER infers hard constraints: the inferred strength vocabulary is
  `{strong, weak}` (:62, :208-210, :296-298). `required` is an explicit user
  act (:18-20).
- HARD — "must not be silently violated": enforced statically at planning
  time (`verifyPlanStepsAgainstConstraints` flags HARD conflicts only,
  `ai.js:1530`) and dynamically in the engine's correction safety (the plan
  refuses a HARD constraint whose pinned axis the fix must mutate; L-3,
  :1293). A hard violation that IS observed is still surfaced honestly as a
  deviation — silence is never an option.
- SOFT — "may be traded off if the policy permits it, the trade-off is
  recorded, and Evaluation reflects the resulting deviation" (§19): the
  static planner gate deliberately skips soft constraints (`ai.js:1386`,
  :1530) so runtime policy can trade them off; compliance measurement is
  strength-blind — every enabled record is measured (:1108-1147 carries no
  strength filter) — and the resulting deviation IS the recorded reflection.
  The strength value itself rides in the provenance record
  (`evaluation.js:1169`) for downstream policy; a soft position-class
  violation still yields a critic proposal (the recorded remedy).

## 10. Transaction boundary

The absolute rule (§45/§47/§59): AI, Planner, T19, Evaluation, Critic, and
Correction MUST NOT directly mutate canonical stores — only
Transaction-mediated mutation is permitted. The 3.16 surface honors it
structurally and by counted scan:

- This module is zero-import, stateless, and read-only over its inputs
  (:4-7, :36-37). The ONLY mutation-form token in the entire 3.16 production
  surface is the function-local dedup `Set.add` (:229-232) — not a store.
- M-13: no store-mutation call form and no store/SceneGraph construction
  vocabulary in any of the four production files; M-14: no SceneGraph
  mutation vocabulary; M-15: no execute/commit/undo call form, no
  TransactionBuilder/TransactionExecutor/ToolRegistry references; M-17: no
  transaction-begin call — the arms never open a builder
  (`tests/constraint-inference.test.mjs`).
- The acceptance flow that DOES become document state goes proposal → accept
  → command → Transaction → Commit → ConstraintStore (§47,
  `docs/spec-3.16.md:1089-1111`). The golden scenario exercises exactly that
  path with real `TransactionBuilder`/`TransactionExecutor` commits (the
  drift transaction and the correction transaction; M-1) — the arms
  themselves remain pure data-in/data-out; the ONE writer is the transaction
  pipeline.

## 11. History linearity

History remains LINEAR (§48, `docs/spec-3.16.md:1115-1130`): no DAG, no
branches, no nested transaction history, no parent/child history, no
automatic merging.

- `transaction.js` is byte-identical to the 3.15 accepted state (sha
  `5ec1369b…`, pinned in-test at
  `tests/constraint-inference.test.mjs:1805`; M-16) — Phase 3.16 changed
  nothing in it.
- The linear discipline lives in `HistoryManager.push`
  (`transaction.js:163`): a push onto an undone tail TRUNCATES the redo tail
  (`slice(0, currentIndex + 1)`) before appending, keeping ONE linear array
  with `currentIndex` at the tail. Only committed transactions are accepted.
- Behavioral proofs: L-11 (:1404) — one linear array through a full
  constraint-correction loop, every transaction committed in sequence, the
  undone entry replaced by the post-undo re-drift (truncate-then-push,
  :1697-1702); L-9 (:1373) — the rollback arc restores the drifted state and
  leaves the accepted constraint records untouched.
- No `HistoryManager` reference and no DAG vocabulary exists anywhere in the
  3.16 production surface (M-16 scan).

## 12. Determinism

Spec §55-§58 ban `Math.random()`, `Date.now()`, network, LLM, and filesystem
sources from decision logic (`docs/spec-3.16.md:1234-1311`). The module
complies structurally and by counted scan (M-10/M-11/M-12 over the stripped
production bodies):

- Proposal ids are content-derived: four independent seeded FNV-1a passes
  over the key-sorted canonical content (:163-180) produce 32 hex digits in
  UUID-v4 FORMAT with the version and variant nibbles set (:176-177). The
  same logical constraint — same type, participants, and parameters — yields
  the same id across paraphrases and runs; any logical change moves the id
  (:22-27). `stableStringify` key-sorts every object first (:148-155).
- Phrase matching is a FIXED table in fixed order with first-match-per-row
  and first-wins dedup (:65-67, :229-232, :249-253) — no probabilities, no
  thresholds beyond the fixed table.
- Outputs are deep-frozen plain data (:140-146; :233, :263, :321-330) —
  byte-identical inputs give byte-identical outputs (:31-34), counted by the
  F-suite and the golden two-run proof (M-2), which normalizes only the
  declared substrate creation entropy (`tests/constraint-inference.test.mjs:56-62`).

## 13. Failure behavior

The module fails loudly and honestly, with structured errors — never
silently:

- Error model: `InferenceError` with codes `INVALID_REQUEST`,
  `INVALID_PROPOSAL`, `INVALID_RECORD` (:97-110).
- Request face: a non-object request, a function value anywhere inside it
  (rejected via `findFunctionPath`, :122-138, :191-194), a missing utterance,
  fewer than two participants, or a strength outside `{strong, weak}` each
  yield structured errors (:186-212); `inferConstraints` re-checks and
  throws before any mapping (:220-224).
- Inference face: no phrase match is NOT an error — it returns
  `{proposals: [], unmatched: [utterance]}` (:262), the honest empty result
  (:216-219).
- Projection/validator faces: missing mandatory keys, a malformed UUID,
  an unsupported type, fewer than two participants, a `required` strength,
  a source that is not `'ai'`, a confidence outside (0,1], or a non-plain
  provenance each yield structured errors (:268-309); house records are
  shape-validated against the full live vocabulary, with `fixedDistance`
  requiring a finite `parameters.distance` (:336-377, :371-375).
- Planner faces: malformed arguments throw `PlanningError`
  (`ai.js:1458-1466`, :1515-1520); unmeasurable situations return
  UNVERIFIABLE verdicts with reasons — never a guessed verdict
  (`ai.js:1479`, :1486-1493).
- Evaluation faces: a malformed record or tolerance throws
  `EvaluationError` (`evaluation.js:1011-1013`, :1110-1112); unobserved
  objects and unmeasurable geometries are UNVERIFIABLE (:1122-1128); a
  non-finite participant quantity is skipped, not fabricated (:1144).
- Critic/Correction faces: unsupported violation classes decline with NO
  proposal (§28/§34; `critic.js:493`); size-class agendas terminate
  `UNFIXABLE` (L-4/L-5); hard-constraint conflicts terminate
  `CONSTRAINT_BLOCKED` with zero attempts (L-3).

## 14. Known limitations

Disclosed honestly (spec §93: do not document unsupported capabilities as
implemented):

1. **Symmetry is UNSUPPORTED** (the acceptor's B3 ruling). The frozen-tree
   T19 MVP emits a `symmetry` proposal (`inferConstraints.ts:120`) and spec
   §11 lists `Symmetric` (`docs/spec-3.16.md:330-340`) with a §30
   symmetry-deviation example (:761-762), but the implemented intersection
   carries NO symmetry type, phrase, or measurement route
   (`T19_SUPPORTED_TYPES` :42; `CONSTRAINT_PINNED_PROPERTIES`
   `evaluation.js:1064-1076` has no symmetry row). A symmetry utterance
   lands in `unmatched` (:262).
2. **equalWidth / equalHeight corrections produce NO proposal** (the E-1
   ruling: translation cannot resize). The only size capability, T06, is an
   origin-anchored scale that mutates position as a side effect — no SAFE
   capability exists, so per §28 nothing is proposed
   (`critic.js:460-465`, :477, :493; counted K-4 :1118) and a size-class
   agenda honestly terminates `UNFIXABLE` (L-4 :1304, L-5 :1331). The
   distance class (`fixedDistance`) declines for the same reason
   (`critic.js:461`).
3. **Multi-object magnitude is a single pairwise quantity, not an
   aggregate** (the E-1 disclosure). ONE violation per constraint
   (`evaluation.js:1053-1055`): expected is the REFERENCE participant's
   quantity (`objectIds[0]`, :1134-1137) and the reported magnitude is the
   pairwise error to the FIRST failing participant in objectIds order
   (:1139-1147; J-6, `tests/constraint-inference.test.mjs:995`). No
   worst-case or aggregate across all pairs is computed.
4. **Session-local only; no persistence** (the B10 ruling under §46). The
   phase does not require every T19 proposal to be persisted; accepted
   inferred constraints live in the session's ConstraintStore and the
   accepted regime is re-declared per ExpectedState (`ai.js:488-498`). No
   persistence operation, no disk artifact, and no cross-session state is
   added by Phase 3.16.
5. **No fs / network / LLM** (§56-§58; M-10/M-11/M-12): inference is a fixed
   vocabulary mapping — the 23-row phrase table plus the unqualified
   `centered` expansion (:68-92, :254-261) is the entire semantic surface.
   Utterances outside it land in `unmatched` (:262); there is no
   statistical or semantic inference.
6. **Confidence is constant 1.** Confidence is a mandatory contract field
   validated in (0,1] (:302-304), but the deterministic mapping either fires
   or does not and always emits `confidence: 1` (:240) — evidence grading
   beyond match/no-match is not implemented.
7. **The planning DATA face covers the ten equality/alignment types only.**
   `fixedDistance` is UNVERIFIABLE there (`UNSUPPORTED_TYPE`,
   `ai.js:1478-1480` — no `EXPECTED_STATE_CONSTRAINT_QUANTITIES` row),
   while the evaluation arm verifies it against `parameters.distance`
   (`evaluation.js:1130-1147`).
8. **Verification is reference-relative, not pairwise-closed.** Both
   verification faces compare each participant to the REFERENCE
   (`objectIds[0]`) only (`ai.js:1495-1502`; `evaluation.js:1139-1147`).
   With a tolerance, two participants can each sit within tolerance of the
   reference while sitting up to 2x tolerance from each other — no
   participant-to-participant check exists.
