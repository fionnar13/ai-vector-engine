# src-js/evaluation.js — MODULE DOCUMENTATION (PHASE 3.14)

Read-only evaluation layer: compares the Planner's desired state against the
committed document state and produces structured, deterministic evidence of
every difference. This file documents the module per spec §53. All line
references cite `src-js/evaluation.js` unless another file is named.

---

## 1. ExpectedState vs ActualState — two distinct types, not two modes

ExpectedState and ActualState share no type, no constructor, and no shape.
They are opposite ends of the pipeline (spec §02/§09/§10):

- **ExpectedState** = what the system INTENDED. Produced by the Planner
  (`ai.js:439+`), consumed here as plain data through a light local shape
  guard only — five sections (`geometry/spatial/appearance/constraint/
  structure`, `evaluation.js:512`) mirroring `ai.js:399-407`, plus the
  desired-state marker `status === 'requested'` enforced at the engine entry
  (`evaluation.js:982-985`). The Planner owns its own validation; evaluation
  never re-implements it (`evaluation.js:507-511`).
- **ActualState** = what the COMMITTED DOCUMENT CONTAINS. Built exclusively
  by `buildActualState(documentContext, evaluationContext)`
  (`evaluation.js:309-316`) from the authoritative stores through an injected
  read surface. Its shape is `{ objects: [...] }` (`evaluation.js:315`) where
  every entry carries exactly the 12 observed fields of
  `ACTUAL_ENTRY_KEYS` (`evaluation.js:318-321`): `objectId, targetRef, exists,
  geometryRef, appearanceRef, geometry, worldTransform, worldBBox,
  parentNodeId, parentIsGroup, childrenNodeIds, fill`.

The separation is enforced, not conventional: evaluation refuses to accept a
caller-assembled "actual state" — the snapshot must be constructed INSIDE the
pipeline by `buildActualState` (Checkpoint D decision, `critic.js:86-89`), and
`createEvaluationResult` re-validates the `actual` argument through
`validateActualState` (`evaluation.js:539-540`). The token `measured` never
appears in the module (test A-32, `tests/evaluation-critic.test.mjs:569`) —
the system never relabels desired state as observed state.

## 2. ActualState: exact shape and construction from authoritative stores

`buildActualState` (spec §11, `evaluation.js:309-316`) works on an injected,
duck-typed read surface (`evaluation.js:159-186`):

```text
objectStore.get(id)              -> {geometryRef, appearanceRef} | undefined
geometryStore.get(ref)           -> {type, params, ...}          | undefined
appearanceStore.get(ref)         -> {stack: [...]}               | undefined
sceneGraph.findNodeByObjectId()  -> {id, parent, children, ...}  | undefined
sceneGraph.findNode(id)          -> {objectRef, ...}             | undefined
sceneGraph.getWorldTransform(id) -> {a,b,c,d,tx,ty}
```

Per target (`observeObject`, `evaluation.js:249-301`): absence is observed as
`exists:false` with null observation fields — never guessed around
(`evaluation.js:265`, §21). Geometry params are deep-cloned
(`evaluation.js:272`); the observed fill is the FIRST fill item in stack order
(`observeFill`, `evaluation.js:237-247` — substrate order is authoritative,
T07 upserts the fill slot at `tools.js:364-373`). Parent facts come from the
SceneGraph: `parentIsGroup` is `!parent.objectRef` (`evaluation.js:284`,
group-node rule at `scenegraph.js:180`). The snapshot is deep-frozen on
return (`evaluation.js:104-110, :315`) — immutable once constructed (§10) —
and deterministic: identical stores + context yield byte-identical output
(§22, test A-9 at `tests/evaluation-critic.test.mjs:288`).

## 3. Fill normalization (§16/§50) — local normalizer, mirrored not imported

The substrate's color parser is internal to the dsl module and stays there;
evaluation implements a LOCAL `hexToRgba` (`evaluation.js:635-650`) that
mirrors the substrate semantics exactly: `#RRGGBB` and `#RGB` (duplicated
digits) resolve with alpha 1; a non-hex string resolves to black plus the
original string preserved (the same fallback the substrate applied when the
fill was written); an object passes through verbatim; anything else resolves
to black. Comparison happens in canonical RGBA space on BOTH sides
(`evaluation.js:766-778`). Mirroring — not diverging — is what prevents false
appearance deviations for fills the pipeline itself created. The dsl module
is not imported and remains untouched by 3.14.

## 4. WorldBBox composition (§51) — public pure pieces only

Evaluation derives WorldBBox WITHOUT touching `tools.js` (whose private
helper stays unexported). The composition is:

```text
local bbox  = LOCAL_BBOX_DISPATCH[type](params)     # evaluation.js:155, :225-231
              rect -> rectBBox (geometry.js)
              ellipse -> ellipseBBox (geometry.js)
world bbox  = bboxTransform(local, worldTransform)  # evaluation.js:291, bbox.js
```

The world transform itself is a READ from the injected sceneGraph surface
(`evaluation.js:289`). The dispatch covers exactly the types the Planner can
produce (`rect`, `ellipse` — `ai.js:680-682`); any other type is observed
verbatim with `worldBBox: null` — an unmeasurable geometry is never invented
(`evaluation.js:153-155, :227`, test A-7). The import contract is therefore
exactly `['./bbox.js', './geometry.js']` (`evaluation.js:48-49`, test G-1).

## 5. targetRef — derivation and grammar

`targetRef` names the plan-level reference that bound an object: `'$doc:<id>'`
for an existing object or `'$<stepId>'` for a plan-step output — the two §13
kinds of the plan reference grammar (`ai.js:900-976`); `null` is legal only
for a plan-level outcome with no resolvable object (§21,
`evaluation.js:134-141`). It flows: `evaluationContext.targets[i].targetRef`
(callers bind it from `intent.targets` / plan refs) -> ActualState entry
(`evaluation.js:252`) -> every Deviation the entry produces (each
`createDeviation` call passes `targetRef: entry.targetRef`, e.g.
`evaluation.js:689, :707, :726`) -> every CorrectionProposal copies its
deviation's targetRef verbatim (`critic.js:423`). targetRef is a MANDATORY
FIELD even when its value is null (`evaluation.js:492-496`, tests A-20/A-21,
D-3/D-4).

## 6. Evaluation lifecycle

```text
ExpectedState (Planner output, status 'requested')
  + documentContext   (injected read surface over the committed stores)
  + evaluationContext (targets[{objectId, targetRef}], artboard, ...)
    -> evaluate()  (evaluation.js:980-1009)
        1. expected shape guard + 'requested' marker (:981-987)
        2. placement prerequisites — artboard never guessed (:988-989, :807-815)
        3. buildActualState — read-only snapshot (:990)
        4. per-target category sweep (:994-1002);
           existence failure short-circuits that target (:996)
        5. evaluated[] = categories actually ran (:1003)
        6. metadata = {tolerances, unevaluatedExpectations} (:1004-1007)
        7. createEvaluationResult — frozen, contract-enforced (:1008)
    -> EvaluationResult (§12)
```

`EvaluationResult` = `{expected, actual, status, deviations, evaluated,
metadata}` (`evaluation.js:554-561`). `status` derives EXACTLY from
`deviations.length` — `'PASS'` iff zero, `'DEVIATION'` iff > 0
(`evaluation.js:553`) — and the equivalence is enforced in BOTH directions by
the validator (`evaluation.js:603-610`, tests A-22/A-23/A-26). Every output
is deep-frozen and plain data (no functions anywhere — `findFunctionPath`
rejects them at every constructor, `evaluation.js:86-102`).

## 7. Deviation categories and structure

Categories (§13, `evaluation.js:145-147`): `existence, geometry, appearance,
placement, structure, transform, semantic`. Every deviation carries ALL 11
fields (`DEVIATION_CONTENT_KEYS`, `evaluation.js:406-409`): `category,
property, expected, actual, delta, tolerance, severity, objectId, targetRef,
message` — absent optional content normalizes to null at creation
(`evaluation.js:459-470`), so records are total and comparable. Severities:
`error | warning` (`evaluation.js:149`). `delta` is populated only for scalar
numeric comparisons (`evaluation.js:725, :795, :860, :945`).

## 8. Tolerance handling (§14)

Tolerances are part of the contract, explicit for every numeric comparison:
`EVALUATION_TOLERANCES = {geometry: 1e-9, appearance: 1e-9, placement: 1e-9,
transform: 1e-9}` (`evaluation.js:620-625`) — the uniform geometry-kernel
default (`geometry.js:5/:338`); no per-site precision rules are invented.
`withinTolerance` is `|actual - expected| <= tolerance`
(`evaluation.js:652-654`). Existence/structure deviations carry
`tolerance: null` (they are not numeric comparisons). The applied tolerances
are self-reported in `metadata.tolerances` of every result
(`evaluation.js:1005`).

## 9. Deterministic IDs (§22)

No entropy sources exist in the module (test A-28). Deviation ids are
content-derived: `'dev-' + FNV-1a(stableStringify(content))`
(`evaluation.js:474-478`), where `stableStringify` key-sorts every object
(`evaluation.js:114-121`) and FNV-1a is pure 32-bit integer arithmetic
(`evaluation.js:125-132`, mirroring `ai.js:159-166`). Identical evidence
yields identical ids; any content change moves the id (test A-17). Proposal
ids follow the same discipline in `critic.js:262-265`.

## 10. Honesty mechanism — unevaluatedExpectations (§19/§20)

Expectations that cannot be verified from the injected read surface are
self-reported in `metadata.unevaluatedExpectations`
(`evaluation.js:960-967, :1006`) — `spatial.aligned`, `appearance.stroke`,
`constraint.satisfied`, `semantic` — never silently dropped and never
converted into invented deviations. Likewise: a null transform expectation
stays dormant (E7, `evaluation.js:892-925`), and an unobservable numeric
counterpart yields an explicit "no observed numeric counterpart" deviation
rather than a fabricated value (`evaluation.js:713-721`).

## 11. Read-only guarantees (§24/§42/§52)

The module imports no store, no Planner, no registry, no transaction
(`evaluation.js:48-49` — exactly two pure-piece imports; test A-33). All
document access is the injected read surface; there is no write path of any
form (static: tests G-2/G-3; runtime: tests A-10, B-26..B-30, D-6, F-3
Proxy mutation-spy). Enforced by the Checkpoint G architecture suite
(`tests/evaluation-critic.test.mjs:2152-2282`), comment/string-aware and
alias-form-capable.

## 12. Relationships to the rest of the engine

- **Phase 3.13 Planner (`ai.js`)**: upstream producer of ExpectedState; NOT
  imported (`evaluation.js:18-20`) — the desired state arrives as plain data.
  Downstream recipient of CorrectionProposals (via `critic.js`); the Planner
  owns intent validation at that handoff.
- **Tool Registry (`tools.js`)**: no relationship at runtime — evaluation
  never imports or touches it (`evaluation.js:16-17`); tools.js is untouched
  by 3.14. Tool metadata informed the rule design in `critic.js` only.
- **Transaction / History (`transaction.js`)**: never imported, never called
  (§52 matrix; test G-3). Mutation happens only through the pre-existing
  Plan -> DSL -> Registry -> Transaction -> Commit path.
- **SceneGraph (`scenegraph.js`)**: accessed only through the injected read
  surface (`findNodeByObjectId` / `findNode` / `getWorldTransform`,
  `evaluation.js:278-298`); never constructed or mutated.
- **Renderer (`renderer.js`)**: observes committed state independently
  (§43); evaluation does not import or notify it.
- **SpatialIndex (`spatial-index.js`)**: untouched; not part of the
  evaluation read surface.
- **Critic (`critic.js`)**: downstream consumer of EvaluationResult through
  `validateEvaluationResult` — the single §12 contract object
  (`critic.js:104`).
