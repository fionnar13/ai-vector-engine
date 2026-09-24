# PHASE 3.17 — Semantic Inference Integration

## 00. STATUS / AUTHORITY

This document is the implementation specification for:

**PHASE 3.17 — Semantic Inference Integration**

Repository:

`https://github.com/fionnar13/ai-vector-engine`

Current baseline:

* PHASE 3.13 — AI Planner: COMPLETE / MERGED
* PHASE 3.14 — Critic + Evaluation: COMPLETE / MERGED
* PHASE 3.15 — Correction Loop: COMPLETE / MERGED
* PHASE 3.16 — Constraint Inference Integration: COMPLETE / MERGED
* Current main merge: `fee7f91`
* Current test baseline: **1050/1050**
* Runtime source of truth: `src-js/`
* Runtime language: JavaScript ESM
* `src/core/`: FROZEN
* Runtime npm dependencies: **0**

This phase is an integration phase.

It is **NOT** permission to redesign the semantic subsystem, reconstruct `semantic.js`, introduce an LLM, create a new architecture, or modify the frozen TypeScript tree.

The implementation agent MUST inspect the actual repository before making architectural assumptions.

---

# §01 — MISSION

Integrate semantic inference into the existing AI-native execution loop:

```text
T20 infer_semantic
        ↓
Semantic Proposal
        ↓
Normalization
        ↓
Provenance + Confidence
        ↓
Planner
        ↓
ExpectedState / Semantic Expectation
        ↓
Evaluation
        ↓
Critic
        ↓
Correction Diagnosis
        ↓
Correction Proposal
        ↓
Correction Loop
        ↓
Verification
```

The objective is to make semantic information a first-class reasoning signal without allowing semantic inference to directly mutate canonical document state.

The phase must preserve the architecture established by PHASE 3.13–3.16.

---

# §02 — PRIMARY OBJECTIVE

After PHASE 3.17, the system must be able to represent and carry a semantic inference through the complete AI pipeline.

At minimum:

```text
semantic inference
→ normalized semantic proposal
→ planner expectation
→ evaluatable semantic expectation
→ semantic deviation
→ critic signal
→ correction proposal or explicit refusal
→ correction-loop verification
```

The implementation must distinguish:

1. semantic inference,
2. semantic expectation,
3. semantic evaluation,
4. semantic deviation,
5. semantic correction.

These are not interchangeable concepts.

---

# §03 — AI-NATIVE PRINCIPLE

The semantic layer exists to answer questions such as:

```text
"What role does this object appear to play?"
"What semantic role is expected here?"
"Did a mutation preserve the intended semantic role?"
"Did a correction improve or damage semantic intent?"
```

Examples of semantic roles already identified by the architecture include:

* title
* subtitle
* body
* logo
* icon
* background
* decoration
* button
* illustration
* unknown

The implementation MUST NOT assume that these labels are necessarily the complete or authoritative runtime vocabulary.

Checkpoint A determines the actual repository contract.

---

# §04 — SCOPE

The phase includes:

1. T20 production integration
2. Semantic proposal normalization
3. Semantic confidence representation
4. Semantic provenance representation
5. Planner consumption
6. Semantic expectations
7. ExpectedState integration
8. Semantic-aware Evaluation
9. Semantic deviation representation
10. Critic integration
11. Semantic correction diagnosis
12. Correction proposal integration where capability exists
13. Correction Loop consumption
14. Semantic verification
15. Semantic regression detection
16. Semantic convergence tests
17. End-to-end tests
18. Property / invariant tests
19. Architecture scans
20. Documentation
21. Acceptance gates
22. Backward-compatibility verification

---

# §05 — NON-GOALS

This phase MUST NOT:

1. introduce an LLM,
2. introduce network access,
3. introduce filesystem access into Core AI,
4. introduce an external semantic AI service,
5. add npm runtime dependencies,
6. modify `src/core/`,
7. replace the existing Planner,
8. replace the existing Critic,
9. replace the existing Evaluation engine,
10. replace the Correction Loop,
11. create a second correction engine,
12. create a second history engine,
13. create a History DAG,
14. introduce nested transactions,
15. create an autonomous semantic mutation subsystem,
16. silently repair unrelated PHASE G backlog items,
17. redesign `semantic.js` merely because its architecture differs from the phase assumptions,
18. invent semantic capabilities unsupported by the repository,
19. fabricate semantic confidence values,
20. fabricate semantic labels,
21. claim semantic verification where no evaluator exists,
22. convert an unsupported semantic inference into a successful constraint,
23. turn a proposal into canonical document state without a transaction.

---

# §06 — CURRENT BASELINE

The implementation agent MUST first establish:

```text
main = fee7f91
tests = 1050/1050
```

The baseline must be recorded before modifications.

If the repository is not clean or the baseline does not match the reported state:

**STOP.**

Do not begin implementation.

---

# §07 — CHECKPOINT A — SEMANTIC RECONNAISSANCE

Checkpoint A is mandatory and READ-ONLY.

The agent MUST inspect:

```text
src-js/semantic.js
src-js/tools.js
src-js/ai.js
src-js/evaluation.js
src-js/critic.js
src-js/correction.js
src-js/dsl.js
src-js/transaction.js
src-js/stores.js
```

and the relevant existing tests.

The agent must determine:

1. What T20 actually accepts.
2. What T20 actually returns.
3. Whether T20 is production-imported.
4. Whether T20 mutates anything.
5. Existing semantic role vocabulary.
6. Existing semantic confidence representation.
7. Existing semantic provenance representation.
8. Existing semantic state ownership.
9. Whether semantic state has a canonical owner.
10. Whether semantic expectations already exist.
11. Whether Evaluation already has a semantic arm.
12. Whether Critic already understands semantic findings.
13. Whether Correction already contains semantic strategies.
14. Which semantic roles are actually evaluatable.
15. Which semantic roles are actually correctable.
16. Whether semantic.js contains test-only command factories.
17. Whether any semantic store is actually production-owned.
18. Whether existing aliases exist.
19. Whether existing normalization already exists.
20. Whether T20's live behavior differs from documentation.

### Checkpoint A output

The agent MUST produce:

```text
SEMANTIC RECONNAISSANCE REPORT

A1 — T20 input contract
A2 — T20 output contract
A3 — production status
A4 — semantic role vocabulary
A5 — confidence model
A6 — provenance model
A7 — state ownership
A8 — evaluation capability
A9 — correction capability
A10 — existing semantic expectations
A11 — existing semantic deviation representation
A12 — existing semantic tests
A13 — discovered gaps
A14 — proposed minimal integration surface
A15 — unsupported assumptions
A16 — GO / STOP recommendation
```

No implementation may begin before this checkpoint is reviewed.

---

# §08 — CHECKPOINT A DECISION RULE

The implementation agent MUST NOT assume that:

```text
semantic.js ≡ production semantic subsystem
```

simply because the file exists.

Likewise:

```text
SemanticStore exists
```

does not imply:

```text
SemanticStore owns production state
```

The actual importer graph is authoritative.

If the semantic subsystem is orphaned, the phase MUST use the same principle established by D-4 in PHASE 3.16:

> Do not invent a production owner merely because a richer dormant class exists.

If semantic state has no production owner, semantic inference may remain session-local for this phase.

---

# §09 — INTEGRATION PRINCIPLE

PHASE 3.17 must mirror the successful integration pattern of PHASE 3.16.

The semantic path is:

```text
T20
 ↓
normalize
 ↓
confidence
 ↓
provenance
 ↓
Planner
 ↓
ExpectedState semantic expectation
 ↓
Evaluation
 ↓
Critic
 ↓
Correction diagnosis
 ↓
Correction proposal
 ↓
Correction Loop
```

The implementation MUST reuse existing abstractions wherever possible.

Do not create parallel:

* Planner,
* Evaluator,
* Critic,
* CorrectionEngine,
* Transaction system,
* History manager.

---

# §10 — SEMANTIC PROPOSAL

The normalized proposal MUST be representable as a plain JavaScript record.

Illustrative JSDoc:

```js
/**
 * @typedef {Object} SemanticProposal
 * @property {string} objectId
 * @property {string} role
 * @property {number|null} confidence
 * @property {string} provenance
 * @property {string|null} sourceTool
 * @property {string|null} rationale
 */
```

This is a contract shape, not permission to duplicate existing repository types.

If the repository already has an equivalent representation, reuse it.

---

# §11 — SEMANTIC CONFIDENCE

Confidence MUST remain informational.

It MUST NOT automatically become:

* mutation permission,
* correction authorization,
* truth,
* canonical state,
* evaluation success.

Confidence must be represented only if the live T20 contract actually provides it or the repository already defines a valid derivation.

The agent MUST NOT invent numeric confidence values merely to satisfy the phase.

If no confidence exists, the normalized representation may use:

```js
confidence: null
```

or the repository's established equivalent.

---

# §12 — SEMANTIC PROVENANCE

Every semantic expectation used by downstream reasoning MUST be traceable to its source.

Possible provenance sources include:

```text
T20
user
existing-document
planner
derived
```

Only values actually supported by the repository should be used.

Provenance MUST NOT imply correctness.

---

# §13 — SEMANTIC ROLE VOCABULARY

The implementation MUST inspect the actual semantic vocabulary during Checkpoint A.

The known architectural vocabulary includes:

```text
title
subtitle
body
logo
icon
background
decoration
button
illustration
unknown
```

But the agent MUST NOT silently assume that all of these are:

* inferable,
* evaluatable,
* correctable,
* persisted,
* or aliases.

For every discovered role, classify it as:

```text
INFERABLE
EVALUATABLE
CORRECTABLE
UNSUPPORTED
```

A role may legitimately be:

```text
INFERABLE + NOT EVALUATABLE
```

or:

```text
EVALUATABLE + NOT CORRECTABLE
```

The system must not collapse those distinctions.

---

# §14 — SEMANTIC NORMALIZATION

Create a minimal normalization boundary if one does not already exist.

Preferred architecture:

```text
raw T20 output
      ↓
normalizeSemanticProposal(...)
      ↓
stable session-local representation
```

The normalizer MUST:

1. validate supported shape,
2. preserve object identity,
3. preserve role,
4. preserve confidence where available,
5. preserve provenance,
6. reject malformed proposals,
7. refuse unsupported roles where required,
8. avoid mutation of document state.

---

# §15 — UNSUPPORTED SEMANTIC TYPES

Unsupported semantic roles MUST NOT be silently accepted.

Preferred refusal representation:

```js
{
  accepted: false,
  reason: "UNSUPPORTED_TYPE"
}
```

or the repository's established refusal contract.

The exact shape must follow existing repository conventions.

An unsupported semantic role MUST NOT become:

```text
always satisfied
```

or:

```text
always corrected
```

or:

```text
verified
```

This follows the D-8 correctness principle established in PHASE 3.16.

---

# §16 — SEMANTIC EXPECTATION

Planner output must be able to carry semantic expectations.

Illustrative JSDoc:

```js
/**
 * @typedef {Object} SemanticExpectation
 * @property {string} objectId
 * @property {string} role
 * @property {number|null} confidence
 * @property {string} provenance
 * @property {string} status
 */
```

ExpectedState MUST remain non-canonical.

It is an expected/derived reasoning representation.

It MUST NOT become document state.

---

# §17 — EXPECTEDSTATE INTEGRATION

Checkpoint A determines the exact extension point.

If the existing ExpectedState supports additive extension, semantic expectations MUST be added there.

Preferred conceptual structure:

```js
expectedState.semantic = {
  expectations: [...]
}
```

or the exact existing repository equivalent.

Do NOT create:

```text
SecondExpectedState
SemanticExpectedState
ExpectedSemanticDocument
```

unless the repository proves the existing ExpectedState cannot safely carry the information.

Any such conflict is a checkpoint issue, not an excuse for speculative architecture.

---

# §18 — PLANNER RESPONSIBILITY

The Planner MUST NOT perform semantic mutation.

Minimum behavior:

```text
T20 semantic proposal
        ↓
semantic expectation
        ↓
Plan
```

Planner responsibilities:

1. consume normalized semantic proposals,
2. preserve provenance,
3. preserve confidence,
4. represent semantic intent,
5. expose semantic expectations to Evaluation,
6. remain deterministic,
7. avoid document mutation.

Planner MUST NOT:

```text
set semantic role directly in Stores
```

or bypass the Transaction layer.

---

# §19 — DETERMINISM

For identical:

```text
document state
+
T20 input
+
configuration
```

the semantic planning result MUST be deterministic.

No:

* randomness,
* network,
* filesystem,
* external model,
* time-dependent behavior.

---

# §20 — EVALUATION RESPONSIBILITY

Evaluation must answer:

```text
Does the current document satisfy the semantic expectation?
```

It must distinguish:

```text
SATISFIED
VIOLATED
UNEVALUABLE
UNSUPPORTED
INSUFFICIENT_EVIDENCE
```

Only statuses actually compatible with the existing evaluation contract should be used.

Do not create redundant status vocabularies.

---

# §21 — SEMANTIC DEVIATION

A semantic deviation must contain enough information for Critic and Correction to reason about it.

Illustrative shape:

```js
/**
 * @typedef {Object} SemanticDeviation
 * @property {string} objectId
 * @property {string} expectedRole
 * @property {string|null} actualRole
 * @property {number|null} confidence
 * @property {string} status
 * @property {string|null} reason
 */
```

The exact structure MUST follow repository conventions.

A deviation MUST NOT be reported when the evaluator cannot establish that a semantic expectation was violated.

---

# §22 — FALSE-VERIFICATION RULE

The following is forbidden:

```text
no semantic evaluator
→ assume satisfied
```

Likewise:

```text
no correction capability
→ pretend corrected
```

Likewise:

```text
unsupported role
→ mark verified
```

If semantic correctness cannot be established, the result must remain:

```text
UNEVALUABLE
```

or the repository's equivalent.

---

# §23 — CRITIC INTEGRATION

Critic must consume semantic evaluation findings using the existing Critic architecture.

The Critic may classify:

```text
semantic violation
semantic uncertainty
semantic refusal
semantic regression
```

but must not invent evidence.

Critic output must remain diagnostic.

Critic MUST NOT directly mutate document state.

---

# §24 — SEMANTIC CORRECTION

Correction proposals must be capability-driven.

The implementation MUST first determine:

```text
Can the existing tool substrate actually correct this semantic violation?
```

Examples:

```text
wrong semantic role
    ↓
possible structural / transform / appearance change
```

But semantic inference itself does not imply a valid correction.

If no safe correction path exists:

```text
NO_CORRECTION_CAPABILITY
```

must be represented explicitly.

---

# §25 — CORRECTION SAFETY

A semantic correction MUST satisfy all applicable existing safety rules.

In particular:

```text
semantic expectation
≠
permission to mutate
```

Correction requires:

1. supported tool,
2. valid target,
3. valid transaction,
4. existing capability,
5. evaluation after mutation.

No semantic correction may bypass:

```text
Transaction
```

or:

```text
HistoryManager
```

or:

```text
existing mutation substrate
```

---

# §26 — CORRECTION LOOP INTEGRATION

Correction Loop must consume semantic findings in the same architectural manner as constraint findings.

The loop remains responsible for:

```text
diagnose
→ plan
→ attempt
→ evaluate
→ accept / reject
→ rollback
→ iterate
```

The semantic subsystem MUST NOT create its own loop.

---

# §27 — TRANSACTION BOUNDARY

Each correction attempt remains independently transactional.

There must be:

```text
one correction attempt
→ one independent transaction
```

No nested transactions.

No semantic transaction layer.

No transaction inside Evaluation.

No transaction inside Critic.

No transaction inside Planner.

---

# §28 — HISTORY

Invariant 13 remains mandatory:

> History is LINEAR in MVP.

Semantic reasoning MUST NOT create a History DAG.

Correction retry behavior must preserve the existing linear-history semantics.

Do not use semantic provenance as a reason to alter HistoryManager architecture.

---

# §29 — SEMANTIC REGRESSION

A correction that improves one semantic expectation but violates another must be detectable.

Example:

```text
title expectation satisfied
+
logo expectation violated
```

The correction must not be accepted solely because one semantic metric improved.

The existing multi-signal evaluation architecture remains authoritative.

---

# §30 — SEMANTIC CONVERGENCE

The phase must test that semantic correction does not oscillate indefinitely.

At minimum test:

```text
initial violation
→ correction
→ re-evaluation
→ convergence
```

and:

```text
initial violation
→ attempted correction
→ no improvement
→ termination / rollback
```

The implementation MUST reuse the existing Correction Loop convergence model.

---

# §31 — POST-ACCEPTANCE DRIFT

A critical fixture posture is required.

T20 may infer a semantic role from a scene that already satisfies the inferred role.

Therefore:

```text
T20
→ satisfied semantic inference
```

does not naturally produce:

```text
VIOLATED
```

on its own.

The realistic regression scenario is:

```text
1. infer semantic role
2. accept expectation
3. mutate document
4. semantic evaluation detects drift
5. Critic diagnoses drift
6. Correction Loop attempts recovery
7. evaluation verifies result
```

Tests MUST explicitly model this.

---

# §32 — SEMANTIC STATE OWNERSHIP

If Checkpoint A finds a production semantic store:

```text
reuse it
```

If it finds a dormant/orphan store:

```text
do not automatically activate it as canonical state
```

If no production semantic state exists:

```text
session-local records are acceptable for 3.17
```

Do NOT modify `transaction.js` merely to create persistence.

Do NOT create a new persistent semantic store without explicit architectural evidence.

---

# §33 — SEMANTIC COMMANDS

If `semantic.js` contains command factories marked as:

```text
tests
test-only
fixtures
```

they MUST NOT be promoted to production mutation commands automatically.

Semantic inference is observational/proposal logic unless a separate production mutation capability already exists.

---

# §34 — CAPABILITY MATRIX

Before implementing correction, construct an evidence-backed capability matrix.

Example:

| Semantic outcome          | Evaluation | Correction capability | 3.17 behavior            |
| ------------------------- | ---------: | --------------------: | ------------------------ |
| Supported role, preserved |        YES |                   N/A | SATISFIED                |
| Supported role, drifted   |        YES |                   YES | CORRECTABLE              |
| Supported role, drifted   |        YES |                    NO | NO_CORRECTION_CAPABILITY |
| Unsupported role          |         NO |                    NO | UNSUPPORTED              |
| Insufficient evidence     |         NO |                    NO | INSUFFICIENT_EVIDENCE    |
| Malformed proposal        |         NO |                    NO | REFUSED                  |

The exact rows must be adapted to actual repository capabilities.

---

# §35 — SEMANTIC ALIASING

If Checkpoint A reveals aliases such as:

```text
heading → title
```

the agent MUST NOT invent mappings.

Existing aliases may be reused.

If no alias mapping exists, preserve the source role.

Do not silently broaden the semantic vocabulary.

---

# §36 — CONFIDENCE POLICY

Confidence MUST NOT be converted into a magic threshold unless the repository already has an established threshold.

Forbidden:

```js
if (confidence > 0.7) accept();
```

unless `0.7` is already a documented repository contract.

No arbitrary threshold fitting is allowed.

---

# §37 — PROVENANCE POLICY

Every semantic expectation propagated through Planner/Evaluation/Critic must retain provenance where the existing architecture supports it.

The following distinction must remain visible:

```text
T20 inferred
```

versus:

```text
user specified
```

versus:

```text
derived from existing state
```

The system must not rewrite inferred information as user intent.

---

# §38 — NO SEMANTIC SELF-MUTATION

The semantic subsystem MUST NOT directly mutate:

```text
Document
SceneGraph
GeometryStore
AppearanceStore
SemanticStore
History
```

unless the mutation passes through the existing transaction/mutation architecture.

Semantic inference is observation/proposal.

---

# §39 — PROPERTY TESTS

The phase MUST include property tests for:

### P1 — no direct mutation

Semantic inference does not mutate canonical state.

### P2 — deterministic inference normalization

Same input produces same normalized proposal.

### P3 — unsupported-role refusal

Unsupported semantic roles cannot become verified.

### P4 — provenance preservation

Normalization does not silently erase provenance.

### P5 — confidence preservation

Provided confidence is not silently replaced.

### P6 — evaluation honesty

Unevaluable semantic state cannot become satisfied.

### P7 — correction verification

A proposed correction is not accepted without post-mutation evaluation.

### P8 — rollback safety

Failed semantic correction restores the pre-attempt state according to existing transaction semantics.

### P9 — linear history

Semantic correction does not create a History DAG.

### P10 — Planner purity

Planner processing does not mutate canonical document state.

---

# §40 — ARCHITECTURE SCANS

Add architecture scans covering at minimum:

```text
semantic inference
Planner
Evaluation
Critic
Correction
```

The scans must reject:

* filesystem access,
* network access,
* LLM calls,
* direct Store mutation,
* direct History mutation,
* nested transactions,
* new runtime dependencies,
* `src/core` modifications.

The scans must be based on actual repository conventions.

Do not create a scan whose only purpose is to satisfy a gate while missing real architectural violations.

---

# §41 — TEST FILE POLICY

PHASE 3.17 MUST add exactly one primary new test file.

Preferred:

```text
tests/semantic-inference.test.mjs
```

The exact filename may change only if the repository already has a canonical naming convention discovered at Checkpoint A.

Do not create a scattered test suite unless the repository structure makes the single-file requirement technically impossible.

The test file must cover:

1. normalization,
2. confidence,
3. provenance,
4. Planner,
5. ExpectedState,
6. Evaluation,
7. Critic,
8. correction proposal,
9. Correction Loop,
10. rollback,
11. unsupported roles,
12. insufficient evidence,
13. post-acceptance drift,
14. convergence,
15. invariants,
16. end-to-end flow.

---

# §42 — TEST BASELINE

Required invariant:

```text
All 1050 baseline tests remain GREEN.
```

The phase's new tests are additive.

No existing test may be deleted, weakened, skipped, or rewritten merely to make the phase pass.

---

# §43 — TEST COUNT

The implementation must not hardcode an arbitrary expected final test count.

Target range:

```text
approximately 100–160 new tests
```

is a planning estimate only.

Definition of success:

```text
baseline 1050 tests
+
all PHASE 3.17 tests
=
100% GREEN
```

The final report must provide the actual count.

---

# §44 — FILE ARCHITECTURE

Preferred production change:

```text
src-js/semantic-inference.js
```

This module should contain the integration boundary.

It MUST remain a single-file JavaScript ESM module.

Expected responsibility:

```text
normalization
semantic expectation construction
semantic evaluation adapters
semantic deviation helpers
semantic correction planning adapters
semantic integration helpers
```

Do not split into:

```text
src-js/semantic-inference/
```

unless the repository proves that the single-file architecture is technically impossible.

---

# §45 — EXISTING MODULE MODIFICATIONS

Expected modifications may include:

```text
src-js/ai.js
src-js/evaluation.js
src-js/critic.js
src-js/correction.js
```

Only modify modules when the integration actually requires it.

Avoid broad refactors.

Every changed line must have a phase-level reason.

---

# §46 — NEW README

If the repository convention established by PHASE 3.16 requires a module README, add:

```text
src-js/semantic-inference.README.md
```

Otherwise documentation may be incorporated into the existing project documentation.

Do not create documentation solely to increase file count.

---

# §47 — NO DEPENDENCIES

`package.json` runtime dependency count MUST remain:

```text
0
```

Do not add:

* semantic AI packages,
* NLP packages,
* network clients,
* model SDKs,
* utility dependencies.

The phase must use the existing JavaScript runtime and repository substrate.

---

# §48 — JSDOC ONLY

Runtime implementation must remain JavaScript ESM.

Use:

```js
/**
 * @typedef {Object} ...
 */
```

and related JSDoc annotations.

Do NOT introduce TypeScript source into `src-js`.

Do NOT convert existing JavaScript modules to TypeScript.

---

# §49 — CORE FREEZE

`src/core/` is frozen.

Required:

```text
0 production changes
```

Any modification to `src/core/` is an automatic architecture violation and phase failure.

---

# §50 — INVARIANTS

All 20 established invariants remain mandatory.

### Invariant 1 — Canonical State has one owner

Semantic inference must not create a competing canonical state owner.

### Invariant 2 — SceneGraph owns hierarchy

Semantic reasoning cannot redefine hierarchy ownership.

### Invariant 3 — Geometry does not know UI

Semantic integration must not couple geometry to UI.

### Invariant 4 — Appearance separate from Geometry

Semantic logic must not collapse appearance into geometry.

### Invariant 5 — Semantic inference does not mutate Geometry

Semantic inference remains observational/proposal-oriented.

### Invariant 6 — Planner does not mutate Document State

Planner remains pure with respect to canonical state.

### Invariant 7 — AI never directly writes Stores

Semantic AI integration must preserve this.

### Invariant 8 — Mutation only through Transaction

All semantic corrections follow this rule.

### Invariant 9 — DSL never directly mutates Stores

No semantic shortcut through DSL.

### Invariant 10 — Renderer ReadOnly

Semantic integration must not make Renderer authoritative.

### Invariant 11 — SpatialIndex Derived/Cache

No semantic subsystem may turn it into canonical state.

### Invariant 12 — RenderTree Derived/Cache

Same rule.

### Invariant 13 — History Linear in MVP

No semantic History DAG.

### Invariant 14 — Plan DAG does not imply History DAG

Planning relationships remain separate from history.

### Invariant 15 — ExpectedState is not canonical document state

Semantic expectations remain expectations.

### Invariant 16 — Event publication after Commit

Semantic correction events must follow existing commit semantics.

### Invariant 17 — Deterministic planning mandatory

Same input must produce deterministic planning.

### Invariant 18 — No filesystem/network in Core AI layers

No exceptions for semantic inference.

### Invariant 19 — No external LLM dependency

T20 integration remains local/deterministic.

### Invariant 20 — Existing phases backward compatible

3.13, 3.14, 3.15 and 3.16 behavior must remain intact.

---

# §51 — PHASE G BOUNDARY

PHASE G currently contains 20 open items.

PHASE 3.17 MUST NOT silently become PHASE G cleanup.

If a PHASE G item is encountered:

```text
record evidence
continue only if the issue does not block 3.17
```

If it blocks correctness:

```text
STOP
report
do not patch opportunistically
```

No PHASE G item is considered resolved merely because it was encountered.

---

# §52 — KNOWN 3.16 DISCLOSURES

The following facts must remain preserved:

1. ConstraintStore is orphan.
2. Transform evaluation is conditionally active.
3. ExpectedState has an existing constraint skeleton.
4. `symmetry` is unsupported by persisted VALID_TYPES.
5. `strong` currently collapses to soft behavior.
6. equalWidth/equalHeight currently have no correction proposal.
7. Multi-object magnitude used first failing pairwise reference-relative error.
8. T19 can infer already-satisfied constraints.
9. Post-acceptance drift is therefore required for realistic violation scenarios.

PHASE 3.17 must not retroactively change these decisions.

---

# §53 — SEMANTIC GOLDEN SCENARIO

The primary golden scenario MUST model semantic drift.

Conceptually:

```text
STEP 1
Create or load a semantic scene.

STEP 2
Run T20.

STEP 3
Normalize semantic proposal.

STEP 4
Planner carries semantic expectation.

STEP 5
Expectation is accepted.

STEP 6
Execute a real document mutation.

STEP 7
Evaluate semantic expectation.

STEP 8
Detect semantic deviation.

STEP 9
Critic diagnoses semantic regression.

STEP 10
Correction subsystem evaluates available capability.

STEP 11
Execute correction only if capability exists.

STEP 12
Re-evaluate.

STEP 13
Accept only if verified.

STEP 14
Otherwise rollback / terminate according to existing policy.
```

The test MUST NOT manufacture a violation by directly changing the evaluator's expected result.

---

# §54 — SEMANTIC GOLDEN SCENARIO SAFETY

The golden scenario must never use an unsupported correction merely to demonstrate a successful loop.

If no safe semantic correction capability exists for the selected scenario:

```text
choose another evidence-backed scenario
```

If no correctable semantic scenario exists:

```text
STOP at Checkpoint A or B
```

Do not fabricate a correction capability.

---

# §55 — CHECKPOINT B — NORMALIZATION

After implementation of the normalization boundary, stop.

Report:

```text
B1 raw T20 examples
B2 normalized representation
B3 supported roles
B4 refused roles
B5 confidence behavior
B6 provenance behavior
B7 mutation proof
B8 deterministic proof
B9 tests
B10 GO / STOP
```

---

# §56 — CHECKPOINT C — PLANNER

Verify:

```text
T20
→ normalized semantic proposal
→ Planner
→ semantic expectation
```

Report:

```text
C1 planner input
C2 planner output
C3 ExpectedState integration
C4 canonical-state non-mutation proof
C5 deterministic planning proof
C6 tests
C7 GO / STOP
```

---

# §57 — CHECKPOINT D — EVALUATION

Verify:

```text
semantic expectation
→ current document
→ evaluation result
```

Test:

```text
SATISFIED
VIOLATED
UNEVALUABLE
UNSUPPORTED
INSUFFICIENT_EVIDENCE
```

only where actually supported.

Report:

```text
D1 supported roles
D2 unsupported roles
D3 satisfied case
D4 violated case
D5 unevaluable case
D6 false-verification prevention
D7 tests
D8 GO / STOP
```

---

# §58 — CHECKPOINT E — CRITIC

Verify:

```text
semantic deviation
→ Critic
```

The Critic must:

* preserve evidence,
* preserve provenance,
* avoid mutation,
* avoid invented confidence,
* avoid unsupported diagnosis.

Report:

```text
E1 deviation input
E2 critic output
E3 evidence preservation
E4 unsupported-case behavior
E5 tests
E6 GO / STOP
```

---

# §59 — CHECKPOINT F — CORRECTION

Verify only evidence-backed correction paths.

Report:

```text
F1 correctable semantic case
F2 correction proposal
F3 capability evidence
F4 transaction boundary
F5 mutation
F6 post-mutation evaluation
F7 rollback behavior
F8 history behavior
F9 tests
F10 GO / STOP
```

---

# §60 — CHECKPOINT G — CLOSED LOOP

Execute the complete scenario:

```text
infer
→ plan
→ accept
→ drift
→ evaluate
→ diagnose
→ correct
→ re-evaluate
→ verify
```

Also test:

```text
drift
→ attempted correction
→ no improvement
→ rollback/termination
```

Report:

```text
G1 end-to-end trace
G2 semantic expectation
G3 semantic deviation
G4 critic diagnosis
G5 correction
G6 verification
G7 rollback
G8 convergence
G9 history
G10 tests
G11 GO / STOP
```

---

# §61 — CHECKPOINT H — FINAL AUDIT

Before commit, perform:

```text
npm test
```

plus all repository-standard validation commands.

Required checks:

1. all baseline tests pass,
2. all new tests pass,
3. architecture scans pass,
4. build passes if applicable,
5. zero npm runtime dependency growth,
6. `src/core` unchanged,
7. no forbidden imports,
8. no filesystem/network/LLM use,
9. no direct Store mutation,
10. no nested transaction,
11. no History DAG,
12. all 20 invariants preserved.

---

# §62 — ACCEPTANCE GATES

PHASE 3.17 is complete only if all gates pass.

### GATE 01 — Baseline

All 1050 pre-phase tests pass.

### GATE 02 — New tests

All PHASE 3.17 tests pass.

### GATE 03 — T20

T20 is integrated through an evidence-backed production path.

### GATE 04 — Normalization

Semantic proposals have a deterministic normalization boundary.

### GATE 05 — Confidence

Confidence is preserved honestly or represented as unavailable.

### GATE 06 — Provenance

Semantic origin remains traceable.

### GATE 07 — Planner

Planner consumes semantic expectations without mutation.

### GATE 08 — Evaluation

Semantic satisfaction is evaluated honestly.

### GATE 09 — Critic

Semantic deviations reach Critic without direct mutation.

### GATE 10 — Correction

Only evidence-backed semantic corrections are proposed.

### GATE 11 — Closed loop

At least one realistic post-acceptance drift scenario passes end-to-end.

### GATE 12 — False verification

Unsupported / unevaluable cases cannot become falsely verified.

### GATE 13 — Rollback

Failed semantic corrections rollback correctly.

### GATE 14 — Convergence

Correction behavior terminates deterministically.

### GATE 15 — History

History remains linear.

### GATE 16 — Transactions

No nested transactions.

### GATE 17 — Architecture

All 20 invariants remain intact.

### GATE 18 — Core freeze

`src/core/` has zero modifications.

### GATE 19 — Dependencies

Runtime npm dependencies remain zero.

### GATE 20 — Isolation

No network, filesystem, or external LLM dependency exists in Core AI.

### GATE 21 — Determinism

Repeated identical runs produce equivalent semantic planning/evaluation results.

### GATE 22 — Backward compatibility

3.13–3.16 functionality remains green.

### GATE 23 — Documentation

The semantic integration contract is documented.

### GATE 24 — Evidence

Every claimed capability has executable evidence.

---

# §63 — DEFINITION OF DONE

The phase is DONE only when:

```text
T20
  ↓
Semantic Proposal
  ↓
Normalization
  ↓
Planner
  ↓
ExpectedState
  ↓
Evaluation
  ↓
Critic
  ↓
Correction
  ↓
Correction Loop
  ↓
Verification
```

is demonstrably connected wherever the actual repository capability permits it.

Unsupported paths must terminate honestly.

No false verification is permitted.

---

# §64 — REQUIRED STOP CONDITIONS

The agent MUST STOP and report instead of improvising if:

1. T20 contract conflicts materially with this architecture.
2. semantic state ownership cannot be established.
3. semantic roles cannot be evaluated.
4. a correction path would require a new mutation architecture.
5. a required capability does not exist.
6. `src/core` would need modification.
7. a nested transaction appears necessary.
8. a History DAG appears necessary.
9. an LLM appears necessary.
10. network/filesystem access appears necessary.
11. baseline tests fail before implementation.
12. an existing invariant must be weakened.
13. the agent would need to invent confidence thresholds.
14. an unsupported role would otherwise be marked verified.
15. the only way to pass a gate is to weaken a test.

---

# §65 — WORKING DISCIPLINE

The following 10 rules are mandatory.

### RULE 1 — READ-ONLY FIRST

Remain READ-ONLY until each reconnaissance checkpoint is understood and approved.

### RULE 2 — RED-FIRST

Every new architectural assertion must have a failing proof before implementation where practical.

### RULE 3 — NEW BRANCH

Create a dedicated branch:

```text
phase-3.17-semantic-inference
```

or repository-equivalent.

### RULE 4 — NO EARLY COMMIT

Do not commit or push before checkpoint approval.

### RULE 5 — STOP AT CHECKPOINTS

At every checkpoint produce the structured report and STOP.

### RULE 6 — DO NOT WEAKEN BOUNDARIES

Never bypass architecture merely to obtain green tests.

### RULE 7 — NO FABRICATION

Do not fabricate:

* repository facts,
* file locations,
* line numbers,
* semantic roles,
* capabilities,
* evaluator behavior,
* correction tools.

### RULE 8 — GREEN BEFORE SNAPSHOT

Create the final/pristine evidence snapshot only AFTER all tests are GREEN.

### RULE 9 — STUB-KILL

Critical paths must have evidence that they execute real logic.

### RULE 10 — PHASE G BLOCKERS

If a PHASE G backlog item blocks correctness, STOP and report it.

---

# §66 — IMPLEMENTATION ORDER

Recommended order:

```text
A — reconnaissance
↓
B — semantic normalization
↓
C — Planner integration
↓
D — Evaluation integration
↓
E — Critic integration
↓
F — Correction capability
↓
G — closed-loop integration
↓
H — final audit
```

Do not skip checkpoints.

---

# §67 — MODULE RESPONSIBILITY

### `src-js/semantic-inference.js`

Owns semantic integration helpers.

It must NOT become a second semantic engine.

### `src-js/ai.js`

Owns Planner integration.

### `src-js/evaluation.js`

Owns semantic evaluation.

### `src-js/critic.js`

Owns semantic diagnosis.

### `src-js/correction.js`

Owns correction-loop orchestration.

### Existing transaction substrate

Owns mutation atomicity.

### Existing HistoryManager

Owns linear history.

---

# §68 — ERROR / REFUSAL TAXONOMY

The implementation should reuse existing error/refusal conventions.

Where a semantic operation cannot safely proceed, distinguish conceptually between:

```text
INVALID_INPUT
UNSUPPORTED_TYPE
INSUFFICIENT_EVIDENCE
UNEVALUABLE
NO_CORRECTION_CAPABILITY
CORRECTION_REJECTED
REGRESSION
```

Do not create duplicate error systems if equivalent repository conventions already exist.

---

# §69 — SEMANTIC CORRECTION PRIORITY

No new numeric semantic priority system is required unless the repository already has one.

If multiple semantic deviations exist:

1. preserve existing Planner/Critic ordering,
2. use explicit deterministic ordering,
3. do not invent arbitrary semantic scores.

Ambiguous cases must remain explicit.

---

# §70 — MULTI-OBJECT SEMANTIC CASES

For multi-object semantic expectations, the implementation MUST define the aggregation rule based on the existing repository semantics.

It must not silently choose:

```text
first
worst
average
majority
```

without evidence.

If the repository does not define aggregation, the phase should use the smallest deterministic representation necessary and disclose it.

---

# §71 — EVIDENCE REQUIREMENT

Every new semantic capability must have at least one of:

```text
unit test
integration test
property test
end-to-end test
architecture scan
```

Prefer multiple forms for critical paths.

Documentation alone is not evidence.

---

# §72 — NO HIDDEN PATCHES

Do not use:

```text
special-case fixture detection
test-only branches
hardcoded object IDs
hardcoded semantic answers
environment-dependent success paths
```

to make the golden scenario pass.

---

# §73 — BACKWARD COMPATIBILITY

The following must remain valid:

```text
Planner without semantic proposal
Evaluation without semantic expectation
Critic without semantic finding
Correction Loop without semantic correction
```

Semantic integration must be additive.

Existing non-semantic workflows must not require semantic metadata.

---

# §74 — FINAL TEST MATRIX

The final test report must include:

| Category               | Required |
| ---------------------- | -------: |
| Baseline regression    |     PASS |
| Semantic normalization |     PASS |
| Confidence             |     PASS |
| Provenance             |     PASS |
| Planner                |     PASS |
| ExpectedState          |     PASS |
| Evaluation             |     PASS |
| Critic                 |     PASS |
| Correction             |     PASS |
| Rollback               |     PASS |
| Convergence            |     PASS |
| Unsupported roles      |     PASS |
| Insufficient evidence  |     PASS |
| Property tests         |     PASS |
| Architecture scans     |     PASS |
| End-to-end             |     PASS |
| Build                  |     PASS |

---

# §75 — FINAL GIT REQUIREMENTS

Before merge:

1. branch contains only PHASE 3.17 work,
2. no unrelated PHASE G patches,
3. `src/core/` unchanged,
4. all tests green,
5. final evidence generated,
6. documentation updated,
7. commit message identifies PHASE 3.17,
8. PR description includes checkpoint evidence.

---

# §76 — FINAL BUILD REPORT TEMPLATE

The implementation agent MUST finish with exactly this information structure:

```text
============================================================
PHASE 3.17 — FINAL BUILD REPORT
============================================================

STATUS:
COMPLETE / BLOCKED

BRANCH:
<name>

BASE:
<commit>

FINAL COMMIT:
<commit>

PR:
<number or N/A>

MERGE:
<status>

------------------------------------------------------------
1. EXECUTIVE RESULT
------------------------------------------------------------

T20 integration:
<status>

Planner:
<status>

Evaluation:
<status>

Critic:
<status>

Correction:
<status>

Correction Loop:
<status>

Semantic verification:
<status>

------------------------------------------------------------
2. CHECKPOINTS
------------------------------------------------------------

A — Reconnaissance:
PASS / BLOCKED

B — Normalization:
PASS / BLOCKED

C — Planner:
PASS / BLOCKED

D — Evaluation:
PASS / BLOCKED

E — Critic:
PASS / BLOCKED

F — Correction:
PASS / BLOCKED

G — Closed Loop:
PASS / BLOCKED

H — Final Audit:
PASS / BLOCKED

------------------------------------------------------------
3. TESTS
------------------------------------------------------------

Baseline before:
1050

New tests:
<N>

Final total:
<N>

Passed:
<N>

Failed:
<N>

Regression:
0 / <N>

------------------------------------------------------------
4. ACCEPTANCE GATES
------------------------------------------------------------

Passed:
<N>/24

Failed:
<N>

------------------------------------------------------------
5. FILES CHANGED
------------------------------------------------------------

Modified:
<list>

Added:
<list>

Deleted:
<list>

src/core modifications:
0 / <N>

------------------------------------------------------------
6. DEPENDENCIES
------------------------------------------------------------

Runtime npm dependencies:
0 / <N>

Network:
NONE / <details>

Filesystem:
NONE / <details>

LLM:
NONE / <details>

------------------------------------------------------------
7. SEMANTIC CAPABILITY MATRIX
------------------------------------------------------------

Role:
<role>
Inference:
YES/NO
Evaluation:
YES/NO
Correction:
YES/NO
Evidence:
<test/reference>

(repeat for every supported role)

------------------------------------------------------------
8. REFUSALS / UNSUPPORTED CASES
------------------------------------------------------------

<list>

------------------------------------------------------------
9. DESIGN DECISIONS
------------------------------------------------------------

<D-IDs and decisions>

------------------------------------------------------------
10. PHASE G ENCOUNTERS
------------------------------------------------------------

Encountered:
YES/NO

Resolved:
0 / <N>

Newly blocked:
0 / <N>

------------------------------------------------------------
11. INVARIANTS
------------------------------------------------------------

1 — PASS
2 — PASS
3 — PASS
4 — PASS
5 — PASS
6 — PASS
7 — PASS
8 — PASS
9 — PASS
10 — PASS
11 — PASS
12 — PASS
13 — PASS
14 — PASS
15 — PASS
16 — PASS
17 — PASS
18 — PASS
19 — PASS
20 — PASS

------------------------------------------------------------
12. FINAL VERDICT
------------------------------------------------------------

PHASE 3.17:
COMPLETE / BLOCKED

Reason:
<concise evidence-backed statement>
============================================================
```

---

# §77 — FINAL SUCCESS CONDITION

PHASE 3.17 succeeds when semantic inference becomes a genuine participant in the existing AI reasoning loop without becoming a new autonomous architecture.

The desired final architecture is:

```text
                    ┌─────────────────────┐
                    │        T20          │
                    │ infer_semantic      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Semantic Normalizer │
                    └──────────┬──────────┘
                               │
                 confidence + provenance
                               │
                               ▼
                    ┌─────────────────────┐
                    │      Planner        │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   ExpectedState     │
                    │ Semantic Expectation│
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Evaluation      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │       Critic        │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Correction Loop     │
                    └──────────┬──────────┘
                               │
                         Transaction
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Document State    │
                    └──────────┬──────────┘
                               │
                               ▼
                         Re-Evaluation
                               │
                  ┌────────────┴────────────┐
                  │                         │
               VERIFIED                 ROLLBACK
```

The critical architectural principle is:

```text
Semantic Intelligence
        ≠
Semantic Mutation
```

and:

```text
Inference
        ≠
Truth
```

and:

```text
Proposal
        ≠
Verification
```

and:

```text
Correction
        ≠
Success
```

Only the complete evidence-backed loop establishes success.

**PHASE 3.17 therefore extends the AI-native engine from geometric/constraint reasoning toward semantic reasoning while preserving the exact safety, transaction, history, determinism, and architectural boundaries established by PHASE 3.13–3.16.**

END OF SPECIFICATION
