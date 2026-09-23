# PHASE 3.16 — Constraint Inference Integration

## 0. PHASE IDENTITY

**Phase:** PHASE 3.16
**Title:** Constraint Inference Integration
**Status:** Implementation Specification
**Runtime:** Node.js v24.21.0
**Language:** JavaScript ESM
**Runtime Source of Truth:** `src-js/`
**Frozen Legacy Tree:** `src/core/`
**Runtime Dependencies:** ZERO npm runtime dependencies

### Predecessor Phases

| Phase    | Capability                           | Status         |
| -------- | ------------------------------------ | -------------- |
| 3.12     | Vector DSL                           | COMPLETE       |
| 3.13     | AI Planner + ExpectedState           | COMPLETE       |
| 3.14     | Critic + Evaluation                  | COMPLETE       |
| 3.15     | Correction Loop Execution            | COMPLETE       |
| **3.16** | **Constraint Inference Integration** | **THIS PHASE** |

### Baseline

The implementation begins from:

* `origin/main = f71da25c23bac0eb441900a38b82d94e005a404b`
* Local `main = 75e8630` (stale; to be resolved in Checkpoint B)
* Baseline test commit: `cd5494d` (tree-identical to origin/main)
* PHASE 3.15 merged
* `943/943` tests passing
* 17 PHASE G backlog items explicitly recorded
* `src/core/` frozen

The implementation agent MUST NOT assume that any unverified branch, local modification, or undocumented architectural change exists.

---

# §01 — Mission

PHASE 3.16 integrates the existing **T19 `infer_constraints` proposal capability** into the AI-native planning and correction pipeline.

The target capability is:

```text
Document / Scene
      ↓
Constraint Observation
      ↓
T19 infer_constraints
      ↓
Constraint Proposal
      ↓
Planner
      ↓
ExpectedState / Plan
      ↓
Transaction Execution
      ↓
Evaluation
      ↓
Critic
      ↓
Constraint-aware Correction Proposal
      ↓
Correction Loop
      ↓
Independent Transaction
      ↓
Re-Evaluation
      ↓
Verified / No Progress / Oscillation / Max Iterations
```

The objective is NOT to build a new constraint engine.

The objective is to make the existing constraint system **usable as an AI reasoning signal across the existing closed loop**.

---

# §02 — Core Principle

The phase MUST preserve this separation:

```text
T19:
  proposes constraints

Constraint System:
  represents / evaluates constraints

Planner:
  reasons about constraints while constructing a plan

Evaluation:
  measures whether expected constraint relationships hold

Critic:
  interprets constraint-related deviations

Correction Loop:
  orchestrates constraint-aware corrections

Transaction:
  remains the only mutation path
```

No component may silently absorb another component's responsibility.

---

# §03 — AI-Native Objective

The system is intended to reason about graphic structure rather than merely manipulate coordinates.

Therefore:

```text
x = 100
y = 200
width = 400
```

is not sufficient reasoning.

The system should also be able to represent:

```text
object A is centered relative to object B
object C has equal width to object D
objects E/F/G are equally spaced
object H is aligned to object I
```

The constraint becomes a semantic relationship over document state.

---

# §04 — Scope

PHASE 3.16 includes:

1. T19 integration
2. Constraint proposal normalization
3. Constraint confidence representation
4. Constraint provenance
5. Planner consumption
6. ExpectedState constraint expectations
7. Constraint-aware Evaluation
8. Constraint deviation representation
9. Critic integration
10. Constraint-aware correction proposals
11. Correction Loop consumption
12. Hard-constraint safety integration
13. Constraint regression detection
14. Constraint verification
15. Constraint convergence tests
16. End-to-end tests
17. Property tests
18. Architecture scans
19. Documentation
20. Acceptance gates

---

# §05 — Explicit Non-Goals

This phase MUST NOT implement:

* full autonomous constraint discovery beyond T19's existing proposal contract
* new LLM integration
* network access
* filesystem access from AI layers
* new npm dependencies
* autonomous mutation
* direct Store mutation
* Renderer mutation
* History DAG
* nested transactions
* transaction nesting
* replacement of `HistoryManager`
* new Renderer architecture
* new SceneGraph architecture
* new ConstraintStore architecture unless required strictly for an already-existing contract
* semantic inference integration
* memory architecture
* full PHASE G cleanup
* real font outlining
* gradient mesh
* 3D
* advanced typography inference
* Illustrator cloning

---

# §06 — Existing T19 Contract

The implementation agent MUST inspect the actual implementation of:

```text
T19 infer_constraints
```

before writing production code.

Do not infer its runtime contract from this specification.

The actual implementation is authoritative for:

* input shape
* output shape
* capability metadata
* proposal fields
* failure behavior
* confidence representation
* supported constraint types
* evidence requirements

If the implementation differs from an earlier specification, the live implementation wins unless this phase explicitly changes that contract.

---

# §07 — Mandatory Read-Only Discovery

Before modifying any file, inspect:

```text
src-js/tools.js
src-js/constraints.js
src-js/ai.js
src-js/evaluation.js
src-js/critic.js
src-js/correction.js
src-js/transaction.js
src-js/dsl.js
```

Also inspect:

```text
tests/
scripts/run-suite.sh
```

and all tests directly covering:

* T19
* constraints
* Planner
* Evaluation
* Critic
* Correction
* Transaction
* History

No production edit is permitted during this discovery stage.

---

# §08 — Baseline Proof

Run the complete existing test suite.

Record:

```text
Node version
test command
total tests
passed
failed
skipped
baseline commit
working-tree status
```

Expected baseline:

```text
943/943
```

If baseline differs:

**STOP.**

Do not reinterpret the difference as an opportunity to repair unrelated code.

---

# §09 — New Branch

Create a dedicated branch:

```text
phase-3.16-constraint-inference
```

No implementation work may occur directly on `main`.

---

# §10 — Source of Truth

The following hierarchy is mandatory:

```text
Live runtime implementation
        ↓
Existing tests
        ↓
Existing architecture contracts
        ↓
This specification
        ↓
Earlier historical documentation
```

Where a runtime implementation and historical documentation conflict, the implementation must be reported.

Do not fabricate line numbers.

---

# §11 — Constraint Vocabulary

The existing constraint vocabulary MUST be inspected rather than recreated.

Expected architectural categories include concepts such as:

```text
EqualSize
EqualSpacing
Aligned
Centered
Symmetric
SameColor
FixedDistance
```

The implementation MUST use the actual project vocabulary.

Do not introduce duplicate constraint names.

---

# §12 — Constraint Proposal

T19 produces a **proposal**, not authoritative document state.

Conceptually:

```text
Observation
    ↓
T19
    ↓
ConstraintProposal[]
```

A proposal is evidence-backed information that a relationship may exist.

It is not automatically committed.

---

# §13 — Constraint Proposal JSDoc

If a new normalized type is required, use JSDoc.

Example:

```js
/**
 * @typedef {Object} ConstraintProposal
 * @property {string} id
 * @property {string} type
 * @property {string[]} objectIds
 * @property {number} confidence
 * @property {string[]} evidence
 * @property {'T19'} source
 * @property {'PROPOSED'|'ACCEPTED'|'REJECTED'} status
 */
```

This is an architectural example only.

The actual fields MUST match the live project contract.

No TypeScript syntax is permitted.

---

# §14 — No TypeScript

Forbidden:

```ts
interface ConstraintProposal {}
```

Forbidden:

```ts
type ConstraintType = ...
```

Required style:

```js
/**
 * @typedef {'Aligned'|'Centered'|'EqualSize'} ConstraintType
 */
```

All new types in this phase MUST use JavaScript JSDoc.

---

# §15 — Proposal Provenance

Every integrated proposal must retain provenance.

At minimum the system must be able to answer:

```text
Where did this constraint come from?
Why was it proposed?
What objects does it concern?
What evidence supported it?
What confidence did the proposal have?
```

The source must be distinguishable from:

* user-authored constraints
* existing constraints
* inferred constraints

---

# §16 — Constraint Lifecycle

The lifecycle is:

```text
OBSERVED
    ↓
PROPOSED
    ↓
VALIDATED
    ↓
CONSUMED
    ↓
VERIFIED
```

Rejection/failure paths must remain explicit.

A proposal must never silently become canonical merely because T19 returned it.

---

# §17 — Constraint Authority

The phase MUST define the distinction between:

### Existing Constraint

Already authoritative within the document/constraint system.

### Inferred Constraint

Generated by T19 and accepted for reasoning.

### Candidate Constraint

Observed but not sufficiently supported.

### Expected Constraint

A relationship the Planner expects to hold after execution.

These concepts MUST NOT be conflated.

---

# §18 — Confidence

Constraint confidence MUST remain explicit.

The system must not transform:

```text
confidence = 0.61
```

into:

```text
hard constraint
```

without an explicit policy.

Inference confidence is evidence quality, not authority.

---

# §19 — Hard vs Soft Constraints

The phase must preserve the distinction:

```text
HARD
SOFT
```

Hard constraints MUST NOT be silently violated.

Soft constraints may be traded off if:

1. the policy permits it,
2. the trade-off is recorded,
3. Evaluation reflects the resulting deviation.

---

# §20 — Constraint Acceptance Policy

Constraint acceptance MUST be deterministic.

Given the same:

```text
document state
T19 proposal
policy
```

the decision must be reproducible.

No random acceptance.

No model-dependent hidden behavior.

---

# §21 — Planner Integration

The Planner must be able to consume accepted constraint information.

The flow becomes:

```text
Intent
  ↓
Scene observation
  ↓
Constraint proposals
  ↓
Constraint filtering / acceptance
  ↓
Planner
  ↓
ExpectedState
  ↓
Plan
```

The Planner remains non-mutating.

---

# §22 — Planner Boundary

The Planner MUST NOT:

* mutate SceneGraph
* mutate Geometry
* mutate Appearance
* mutate ConstraintStore directly
* bypass Transaction
* write to Stores
* execute commands

The Planner produces reasoning artifacts only.

---

# §23 — ExpectedState Extension

If the existing ExpectedState model supports extension, add constraint expectations through the existing representation.

Conceptually:

```js
/**
 * @typedef {Object} ConstraintExpectation
 * @property {string} constraintId
 * @property {string} type
 * @property {string[]} objectIds
 * @property {boolean} required
 */
```

The actual shape must conform to the existing `ai.js` model.

Do not create a parallel ExpectedState system.

---

# §24 — Plan Constraint Awareness

A Plan must be able to explain which constraints it is intended to satisfy.

Example conceptual metadata:

```text
Plan
 ├── commands
 ├── expectedState
 └── constraintExpectations[]
```

Constraint expectations are declarative.

They do not mutate state.

---

# §25 — Constraint-Preserving Planning

Planner decisions should prefer operations that preserve accepted constraints.

For example:

```text
Constraint:
A centered on B

Candidate operation 1:
move A independently

Candidate operation 2:
move A + B together
```

The Planner may use constraint information to distinguish these plans.

The phase does not require a general optimization solver.

---

# §26 — Constraint Conflict

The Planner must detect explicit conflicts.

Example:

```text
Constraint A:
A centered on B

Constraint B:
A fixed 20px right of B
```

If both cannot simultaneously hold, the system must not silently select one.

The conflict must become explicit evidence.

---

# §27 — Constraint Priority

Constraint priority must be represented deterministically.

Possible precedence sources:

```text
Hardness
Authority
User-authored status
Explicit project policy
Inference confidence
```

The actual priority model must follow existing project architecture.

Do not invent a numerical scoring system without repository evidence.

---

# §28 — Evaluation Integration

Evaluation becomes constraint-aware.

Conceptually:

```text
ExpectedState
+
ConstraintExpectation[]
        ↓
Evaluation
        ↓
Deviation[]
+
ConstraintDeviation[]
```

Constraint evaluation must remain measurement.

It must not perform correction.

---

# §29 — ConstraintDeviation

Use JSDoc.

Conceptually:

```js
/**
 * @typedef {Object} ConstraintDeviation
 * @property {string} constraintId
 * @property {string} type
 * @property {string[]} objectIds
 * @property {boolean} satisfied
 * @property {number|null} magnitude
 * @property {string} reason
 */
```

Actual fields must follow the live Evaluation architecture.

---

# §30 — Measurement Semantics

Different constraints require different measurements.

Examples:

```text
Aligned
→ alignment error

Centered
→ center displacement

EqualSize
→ size delta

EqualSpacing
→ spacing variance

Symmetric
→ symmetry deviation

FixedDistance
→ distance delta
```

The implementation must not use one generic metric when the existing architecture supports constraint-specific measurement.

---

# §31 — Tolerance

Constraint evaluation MUST use explicit tolerances where required.

Do not introduce unsupported universal numbers such as:

```text
0.01px
95%
70%
```

unless the repository already defines them.

Tolerance must come from:

* existing metric policy,
* existing constraint configuration,
* explicit phase configuration,
* or documented project constants.

---

# §32 — Constraint Satisfaction

A constraint may produce:

```text
SATISFIED
VIOLATED
UNKNOWN
UNFIXABLE
```

Only statuses actually compatible with the existing Evaluation contract should be added.

Do not create redundant state models.

---

# §33 — Critic Integration

Critic consumes constraint-related Evaluation results.

Flow:

```text
Evaluation
   ↓
ConstraintDeviation[]
   ↓
Critic
   ↓
CorrectionProposal[]
```

Critic remains a consumer.

---

# §34 — Critic Must Not Correct

Critic MUST NOT:

* mutate state
* execute commands
* open transactions
* rollback
* call CorrectionEngine to execute a correction

It may recommend.

Correction Loop executes.

---

# §35 — Constraint Correction Proposal

A constraint-aware correction proposal should identify:

```text
target constraint
affected objects
observed violation
candidate corrective action
expected effect
risk
```

Example:

```text
Constraint:
A centered on B

Observed:
center delta = positive

Candidate:
move A horizontally toward B center

Expected:
constraint satisfaction
```

The actual proposal format must integrate with the existing 3.14/3.15 contracts.

---

# §36 — Correction Loop Integration

The Correction Loop receives constraint-derived proposals through its existing input boundary.

It must not create a parallel correction pipeline.

Required conceptual flow:

```text
ConstraintDeviation
      ↓
Critic
      ↓
CorrectionProposal
      ↓
CorrectionLoop
      ↓
Diagnosis
      ↓
Strategy
      ↓
Plan
      ↓
Independent Transaction
```

---

# §37 — Correction Safety

Existing 3.15 safety gates remain authoritative.

Constraint-aware correction must pass:

```text
evaluateCorrectionSafety
verifyCorrectionScope
scanCorrectionDependencies
```

before execution.

---

# §38 — Hard Constraint Safety

For hard constraints:

```text
pre-state satisfies hard constraint
        ↓
candidate correction
        ↓
predicted post-state
```

The correction must not knowingly create a hard-constraint violation.

If safety cannot be established:

```text
DO NOT EXECUTE
```

The result must be represented explicitly.

---

# §39 — Soft Constraint Trade-offs

For soft constraints:

A correction may improve one constraint while worsening another.

Example:

```text
Constraint A improves
Constraint B worsens
```

This is not automatically a failure.

The system must:

1. record both,
2. evaluate both,
3. allow policy to determine acceptance,
4. preserve explainability.

---

# §40 — Constraint Dependency Graph

If existing dependency scanning can represent constraint relationships, integrate with it.

Otherwise introduce only the minimal metadata required.

Do NOT create a second graph system if `scanCorrectionDependencies` can be extended.

---

# §41 — Multi-Object Constraint

A constraint may reference multiple objects.

Examples:

```text
EqualSpacing(A, B, C)
EqualSize(A, B, C)
Symmetric(A, B, Axis)
```

The implementation must not assume every constraint is binary.

---

# §42 — Object Scope

Every constraint must have explicit object scope.

The system must distinguish:

```text
object IDs
group IDs
scene nodes
derived geometry
```

Do not repeat the T11 mistake from PHASE 3.15 where recipe object identity differed from the runtime requirement.

The actual runtime identifier contract must be verified before integration.

---

# §43 — Group Constraints

Where constraints concern groups, the implementation must use the actual group-node representation.

Do not silently convert:

```text
objectId
```

to:

```text
groupNodeId
```

unless the live architecture defines that conversion.

---

# §44 — ConstraintStore

The existing `ConstraintStore` remains authoritative for constraint state.

T19 must not bypass it.

If an inferred proposal needs persistence, the persistence operation must use the project's established mutation architecture.

---

# §45 — Mutation Rule

The following remains absolute:

```text
AI
Planner
T19
Evaluation
Critic
Correction
```

MUST NOT directly mutate canonical Stores.

Only Transaction-mediated mutation is permitted.

---

# §46 — Inferred Constraint Persistence

PHASE 3.16 must explicitly distinguish:

```text
proposal for reasoning
```

from:

```text
persisted constraint
```

The phase does not automatically require every T19 proposal to be persisted.

If persistence is already supported, use it.

If not, keep the proposal session-local unless the existing architecture provides an approved Transaction path.

---

# §47 — Transaction Integration

Any accepted inferred constraint that becomes document state MUST be applied through Transaction.

Conceptually:

```text
T19
 ↓
proposal
 ↓
accept
 ↓
command
 ↓
Transaction
 ↓
Commit
 ↓
ConstraintStore
```

No direct Store writes.

---

# §48 — History

History remains:

```text
LINEAR
```

PHASE 3.16 MUST NOT introduce:

* History DAG
* branches in HistoryManager
* nested transaction history
* transaction parent/child history
* automatic history merging

---

# §49 — Constraint Analysis Is Not Transaction Nesting

Constraint inference may produce multiple candidate corrections.

This does not create nested transactions.

If Correction Loop executes a correction:

```text
one correction attempt
→ one independent transaction
```

This remains the PHASE 3.15 contract.

---

# §50 — Undo Semantics

Constraint-related mutations must remain compatible with existing undo.

A constraint mutation is successful only if:

```text
command
→ transaction
→ commit
→ history
```

behaves according to the existing transaction contract.

---

# §51 — Regression Protection

Constraint-aware correction must be evaluated against:

1. target constraint
2. unrelated constraints
3. existing document expectations
4. existing Evaluation metrics
5. existing Critic output

A correction that satisfies the target while causing unacceptable regression must not automatically be accepted.

---

# §52 — Constraint Regression

Define regression using the existing Evaluation/Correction architecture.

Conceptually:

```text
Before:
constraint A = satisfied
constraint B = satisfied

After:
constraint A = satisfied
constraint B = violated
```

The system must detect the change.

---

# §53 — No False Verification

A constraint must not be marked satisfied because:

* the proposal existed,
* the Planner expected it,
* the Critic recommended it,
* the correction executed.

Only Evaluation evidence can establish satisfaction.

---

# §54 — Host Adapter Boundary

The implementation must preserve the existing distinction between:

```text
house metrics
```

and:

```text
live evaluator / host adapter
```

The PHASE 3.15 evaluator opacity gap must not be silently patched under 3.16.

If it affects a constraint scenario, report it.

---

# §55 — Determinism

For identical:

```text
DocumentState
Intent
Constraint proposals
Policy
```

the Planner must produce deterministic constraint reasoning.

No:

```text
Math.random()
Date.now()
network calls
LLM calls
filesystem reads
```

in decision logic.

---

# §56 — No LLM

PHASE 3.16 explicitly forbids:

* OpenAI API
* Gemini API
* Claude API
* local LLM dependency
* remote inference
* agent network calls
* model downloads

Constraint inference is based on the existing deterministic T19 architecture.

---

# §57 — No Network

Core AI layers must have zero network access.

No:

```js
fetch(...)
```

No HTTP clients.

No sockets.

No remote services.

---

# §58 — No Filesystem

Core AI layers must not perform filesystem I/O.

No:

```js
fs.readFile(...)
fs.writeFile(...)
```

No dynamic configuration loading from disk.

Test infrastructure may use filesystem facilities where existing test architecture permits it.

---

# §59 — No Autonomous Mutation

The following must never mutate canonical state directly:

```text
T19
Planner
Evaluation
Critic
Constraint reasoning
```

All mutation must pass through Transaction.

---

# §60 — File Structure

The implementation MUST follow the project's single-file runtime architecture.

Expected new files:

```text
src-js/
└── constraint-inference.js

tests/
└── constraint-inference.test.mjs
```

Documentation may be added according to the project's established documentation convention.

No directory architecture such as:

```text
src/constraint/
src/planner/
src/evaluation/
```

may be introduced.

---

# §61 — Single Runtime Module

All new PHASE 3.16 runtime concepts belong in:

```text
src-js/constraint-inference.js
```

unless the implementation proves that the capability belongs naturally inside an existing module such as:

```text
ai.js
evaluation.js
critic.js
constraints.js
```

The preferred architecture is:

```text
existing modules
        ↓
constraint-inference.js
```

with minimal integration changes.

Do not create duplicated implementations.

---

# §62 — Test Structure

All new PHASE 3.16 tests must be in:

```text
tests/constraint-inference.test.mjs
```

Do not create:

```text
tests/constraint/
tests/inference/
tests/planner-constraint/
```

unless the existing project test architecture explicitly requires otherwise.

---

# §63 — Test Categories

The new test file must cover:

### A — Data Contracts

* proposal normalization
* constraint identity
* provenance
* confidence
* scope

### B — T19 Integration

* valid proposal
* empty proposal
* unsupported proposal
* malformed proposal
* deterministic proposal handling

### C — Planner

* constraint consumption
* ExpectedState integration
* deterministic planning
* conflict handling

### D — Evaluation

* constraint satisfaction
* constraint violation
* magnitude
* tolerance
* multi-object constraints

### E — Critic

* constraint deviation
* correction proposal
* hard constraint handling
* soft constraint handling

### F — Correction Loop

* correction execution
* independent transaction
* re-evaluation
* regression
* convergence

### G — Safety

* no direct Store mutation
* no network
* no filesystem
* no LLM
* no History DAG
* no nested transaction

### H — Integration

* complete end-to-end scenario
* regression suite

---

# §64 — RED-FIRST Requirement

For every new behavior:

1. Write a failing test.
2. Prove the failure is meaningful.
3. Implement the smallest change.
4. Run the focused test.
5. Run the broader suite.

Do not write implementation first and retroactively claim RED evidence.

---

# §65 — Stub-Kill Requirement

Critical paths must not be satisfied by:

```js
return true;
return [];
return null;
```

or equivalent placeholder behavior.

Especially prohibited for:

```text
inferConstraints
evaluateConstraint
buildConstraintExpectation
critic constraint diagnosis
constraint correction planning
constraint verification
```

If a function is intentionally unsupported, it must fail explicitly according to the project's established contract.

---

# §66 — Property Tests

At minimum prove properties such as:

### Determinism

Same input → same normalized proposal.

### Identity

Same logical constraint → stable identity.

### Scope

Constraint evaluation only reads referenced objects.

### Non-Mutation

Inference does not mutate canonical state.

### Hard Constraint

Accepted hard constraints are never silently downgraded.

### Transaction

Constraint mutation never bypasses Transaction.

### History

Constraint correction does not create non-linear History.

---

# §67 — Golden Scenario

Create at least one end-to-end deterministic scenario.

Example conceptual document:

```text
Rectangle A
Rectangle B
Rectangle C
```

with a detectable relationship such as:

```text
EqualSize(A,B,C)
```

or:

```text
EqualSpacing(A,B,C)
```

The exact scenario must use capabilities that actually exist in the repository.

Required flow:

```text
document
 ↓
T19
 ↓
proposal
 ↓
Planner
 ↓
ExpectedState
 ↓
execution
 ↓
Evaluation
 ↓
Critic
 ↓
Correction Loop
 ↓
correction transaction
 ↓
re-evaluation
 ↓
verified result
```

The test must prove the loop, not merely the existence of functions.

---

# §68 — Checkpoint A — Repository Reconnaissance

Before implementation, report:

```text
A1 baseline test result
A2 git state
A3 T19 actual API
A4 ConstraintStore actual API
A5 constraints.js actual architecture
A6 Planner constraint integration points
A7 Evaluation integration points
A8 Critic integration points
A9 Correction Loop integration points
A10 transaction integration points
A11 existing constraint tests
A12 discovered PHASE G blockers
```

### STOP

Wait for approval.

No implementation begins before Checkpoint A approval.

---

# §69 — Checkpoint B — Constraint Contract

Produce:

```text
B1 actual T19 input
B2 actual T19 output
B3 proposal normalization
B4 provenance model
B5 confidence model
B6 authority model
B7 hard/soft model
B8 object scope
B9 group scope
B10 persistence decision
```

No code yet beyond tests required to prove contract assumptions.

### STOP

Wait for approval.

---

# §70 — Checkpoint C — Planner Integration

Prove:

```text
T19 proposal
      ↓
constraint acceptance
      ↓
Planner
      ↓
ExpectedState
      ↓
Plan
```

Required evidence:

* RED tests
* implementation
* GREEN tests
* no direct mutation
* deterministic behavior

### STOP

Wait for approval.

---

# §71 — Checkpoint D — Evaluation Integration

Prove:

```text
Expected Constraint
       ↓
Evaluation
       ↓
ConstraintDeviation
```

Required:

* satisfaction
* violation
* measurement
* tolerance
* multi-object handling
* regression

### STOP

Wait for approval.

---

# §72 — Checkpoint E — Critic Integration

Prove:

```text
ConstraintDeviation
       ↓
Critic
       ↓
CorrectionProposal
```

Verify that Critic remains consumer-only.

### STOP

Wait for approval.

---

# §73 — Checkpoint F — Correction Integration

Prove:

```text
CorrectionProposal
       ↓
CorrectionLoop
       ↓
Independent Transaction
       ↓
Re-Evaluation
```

Verify:

* hard constraint safety
* scope
* dependency scanning
* regression
* rollback
* convergence

### STOP

Wait for approval.

---

# §74 — Checkpoint G — End-to-End Proof

Run:

```text
T19
→ Planner
→ Transaction
→ Evaluation
→ Critic
→ Correction
→ Transaction
→ Evaluation
```

Required:

```text
RED
GREEN
full suite
property tests
golden scenario
architecture scans
```

### STOP

Wait for approval.

---

# §75 — Checkpoint H — Final Verification

Final verification must include:

```text
all tests
architecture scans
git diff
src/core integrity
dependency audit
network scan
filesystem scan
History linearity scan
transaction-boundary scan
stub scan
```

Only after GREEN may the pristine snapshot be captured.

### STOP

Wait for approval before commit/push.

---

# §76 — Acceptance Gate A: Data Model

PASS requires:

* JSDoc only
* no TypeScript
* stable proposal representation
* provenance
* confidence
* scope
* explicit authority
* no duplicated constraint vocabulary

---

# §77 — Acceptance Gate B: T19

PASS requires:

* actual T19 API verified
* no guessed contract
* deterministic normalization
* malformed input handled
* unsupported proposals handled
* no mutation

---

# §78 — Acceptance Gate C: Planner

PASS requires:

* Planner consumes accepted constraint information
* ExpectedState can represent constraint expectations
* Plan can preserve constraints
* Planner remains non-mutating
* deterministic output

---

# §79 — Acceptance Gate D: Evaluation

PASS requires:

* constraint deviations are measurable
* satisfaction is evidence-based
* violation is evidence-based
* no false verification
* tolerance is explicit
* multi-object constraints are supported where existing architecture allows them

---

# §80 — Acceptance Gate E: Critic

PASS requires:

* Critic consumes constraint deviations
* Critic generates correction proposals
* Critic does not mutate
* Critic does not execute
* Critic does not open transactions

---

# §81 — Acceptance Gate F: Correction Loop

PASS requires:

* existing 3.15 CorrectionEngine reused
* independent transaction per correction attempt
* hard constraint safety
* regression detection
* rollback
* convergence detection
* no nested transactions
* no History DAG

---

# §82 — Acceptance Gate G: Architecture

PASS requires preservation of all 20 invariants:

```text
1. Canonical State has one owner
2. SceneGraph owns hierarchy
3. Geometry does not know UI
4. Appearance remains separate from Geometry
5. Semantic inference does not mutate Geometry
6. Planner does not mutate Document State
7. AI never directly writes Stores
8. Mutation happens only through Transaction
9. DSL never directly mutates Stores
10. Renderer remains ReadOnly
11. SpatialIndex remains Derived/Cache
12. RenderTree remains Derived/Cache
13. History remains Linear in MVP
14. Plan DAG does not imply History DAG
15. ExpectedState is not canonical document state
16. Event publication occurs after Commit
17. Deterministic planning is mandatory
18. No filesystem/network access exists in Core AI layers
19. No external LLM dependency exists
20. Existing phases must remain backward compatible
```

---

# §83 — Acceptance Gate H: Dependencies

PASS requires:

```text
npm runtime dependencies added = 0
```

No external library may be introduced merely to implement constraint inference.

---

# §84 — Acceptance Gate I: Frozen Tree

Verify:

```text
src/core/
```

has no modifications.

Required proof:

```text
git diff
git status
```

and repository-specific integrity scan if available.

Expected:

```text
src/core modified = 0
```

---

# §85 — Acceptance Gate J: Security / Boundary

Prove absence of:

```text
fetch
HTTP
network
LLM API
fs access
direct Store writes
direct SceneGraph mutation
Transaction bypass
History DAG
nested transactions
```

within the affected Core AI path.

---

# §86 — Acceptance Gate K: Regression

The full historical suite must remain GREEN.

Minimum expected baseline:

```text
943/943
```

plus all new PHASE 3.16 tests.

The final result must be:

```text
943 + N / 943 + N
```

where `N` is the actual number of new passing tests.

Do not fabricate `N`.

---

# §87 — Acceptance Gate L: No PHASE G Scope Creep

The implementation must explicitly list every PHASE G item encountered.

For each:

```text
NOT TOUCHED
TOUCHED AS REQUIRED BLOCKER
RESOLVED
REMAINS OPEN
```

No unrelated backlog cleanup is permitted.

---

# §88 — Known PHASE G Risks

The implementation agent MUST specifically monitor:

1. T07 opacity/fill validator gap
2. T11 recipe object/group ID mismatch
3. live evaluator opacity mismatch
4. T08 capability boundary
5. History truncation signature
6. T10 group parent quirk
7. T13 orphan cleanup
8. transaction transform no-op
9. T14 font limitation
10. T17 kernel bypass
11. semantic heading/title alias
12. DSL fallback bypass
13. SpatialIndex invalidation
14. architecture scan gaps
15. remaining PHASE G items

None may be silently repaired.

---

# §89 — Constraint-Specific Blocker Rule

If any PHASE G issue prevents proving:

```text
T19
→ Planner
→ Evaluation
→ Critic
→ Correction
```

then:

```text
STOP
```

and report:

```text
BLOCKER ID
affected subsystem
exact observed behavior
why it blocks the phase
minimal evidence
whether workaround would violate an invariant
```

Do not patch the blocker without approval.

---

# §90 — Backward Compatibility

All existing APIs must remain compatible unless the phase explicitly extends them.

No breaking changes to:

```text
3.13 Planner
3.14 Evaluation
3.14 Critic
3.15 Correction Loop
Transaction
History
DSL
Tool Registry
```

without explicit approval.

---

# §91 — API Extension Rule

Prefer:

```text
additive extension
```

over:

```text
replacement
```

Existing callers must continue to work.

If an API extension is unavoidable, preserve old behavior for old inputs.

---

# §92 — Export Discipline

New exports must be intentional.

At final report provide:

```text
previous export count
new export count
new exports
reason for each
```

Do not export internal helpers unnecessarily.

---

# §93 — Documentation

Add documentation according to the existing repository convention.

The documentation must explain:

1. Mission
2. T19 role
3. Proposal lifecycle
4. Constraint vocabulary
5. Planner integration
6. Evaluation integration
7. Critic integration
8. Correction integration
9. Hard/soft semantics
10. Transaction boundary
11. History linearity
12. Determinism
13. Failure behavior
14. Known limitations

Do not document unsupported capabilities as implemented.

---

# §94 — Final Architecture

After PHASE 3.16, the intended architecture is:

```text
USER INTENT
    │
    ▼
AI PLANNER
    │
    ├───────────────┐
    │               │
    ▼               ▼
EXPECTED STATE   CONSTRAINT EXPECTATIONS
    │               │
    └───────┬───────┘
            ▼
           PLAN
            │
            ▼
           DSL
            │
            ▼
       TOOL REGISTRY
            │
            ▼
       TRANSACTION
            │
            ▼
          COMMIT
            │
            ▼
       ACTUAL STATE
            │
            ├──────────────┐
            ▼              ▼
       EVALUATION     CONSTRAINT EVALUATION
            │              │
            └──────┬───────┘
                   ▼
                 CRITIC
                   │
                   ▼
         CONSTRAINT-AWARE
        CORRECTION PROPOSAL
                   │
                   ▼
          CORRECTION LOOP
                   │
          ┌────────┴────────┐
          ▼                 ▼
      DIAGNOSIS          STRATEGY
          │                 │
          └────────┬────────┘
                   ▼
              CORRECTION
                  PLAN
                   │
                   ▼
        INDEPENDENT TRANSACTION
                   │
                   ▼
                 COMMIT
                   │
                   ▼
             RE-EVALUATION
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       VERIFIED  REGRESSION  NO-PROGRESS
                         │
                         ▼
                      ROLLBACK
```

---

# §95 — Architectural Principle

PHASE 3.16 must preserve:

```text
AI decides WHAT
Planner reasons WHY
T19 proposes RELATIONSHIPS
Evaluation measures WHETHER
Critic explains WHAT TO CHANGE
Correction Loop orchestrates RETRY
Transaction guarantees ATOMICITY
History records LINEARLY
```

No layer may absorb the responsibility of another.

---

# §96 — Definition of Done

PHASE 3.16 is COMPLETE only when all are true:

```text
[ ] T19 runtime contract verified
[ ] Constraint proposal model verified
[ ] Provenance implemented
[ ] Confidence implemented
[ ] Constraint authority explicit
[ ] Planner consumes constraints
[ ] ExpectedState represents constraint expectations
[ ] Evaluation measures constraints
[ ] ConstraintDeviation implemented
[ ] Critic consumes constraint deviations
[ ] Constraint correction proposals work
[ ] Correction Loop consumes them
[ ] Hard constraints protected
[ ] Soft constraints explicitly handled
[ ] Regression detection works
[ ] Independent transaction per correction
[ ] History remains linear
[ ] No nested transactions
[ ] No History DAG
[ ] No direct Store mutation
[ ] No LLM
[ ] No network
[ ] No filesystem in Core AI path
[ ] Zero npm runtime dependencies
[ ] src/core unchanged
[ ] Stub-kill proof complete
[ ] Property tests pass
[ ] Golden test passes
[ ] Full regression suite passes
[ ] Architecture scans pass
[ ] Documentation complete
[ ] All PHASE G encounters reported
[ ] Final pristine snapshot captured after GREEN
```

---

# §97 — Final Build Report Template

The implementation agent MUST finish with this exact report structure.

```text
PHASE 3.16 — CONSTRAINT INFERENCE INTEGRATION
FINAL BUILD REPORT

1. STATUS
   PASS / BLOCKED / PARTIAL

2. BASELINE
   Commit:
   Node:
   Tests before:

3. IMPLEMENTATION
   Files added:
   Files modified:
   Files deleted:

4. T19 CONTRACT
   Actual input:
   Actual output:
   Proposal behavior:

5. CONSTRAINT MODEL
   Types:
   Provenance:
   Confidence:
   Authority:
   Hard/Soft:

6. PLANNER
   Integration:
   ExpectedState:
   Determinism:

7. EVALUATION
   Constraint metrics:
   ConstraintDeviation:
   Tolerance:
   Regression:

8. CRITIC
   Inputs:
   Outputs:
   Mutation boundary:

9. CORRECTION LOOP
   Integration:
   Independent transactions:
   Rollback:
   Convergence:

10. HISTORY
    Linear invariant:
    History changes:

11. TESTS
    New tests:
    Full tests:
    Pass:
    Fail:
    Skipped:

12. PROPERTY TESTS
    Determinism:
    Non-mutation:
    Scope:
    Hard constraint:
    Transaction boundary:

13. GOLDEN TEST
    Scenario:
    Result:

14. ARCHITECTURE
    Invariants 1-20:
    Violations:

15. DEPENDENCIES
    npm runtime dependencies added:

16. SECURITY
    LLM:
    Network:
    Filesystem:
    Direct Store mutation:

17. SRC/CORE
    Modified files:

18. PHASE G
    Items encountered:
    Items changed:
    Items remaining:

19. GIT
    Branch:
    Commit:
    Working tree:
    Push:

20. ACCEPTANCE GATES
    Passed:
    Failed:

21. PREREQUISITE / BLOCKER REPORT
    Any blocker:
    Evidence:

22. FINAL VERDICT
    COMPLETE / BLOCKED / PARTIAL
```

---

# §98 — Git Discipline

The implementation agent MUST NOT commit or push before checkpoint approval.

Required sequence:

```text
branch
→ read-only discovery
→ Checkpoint A
→ approval
→ RED
→ implementation
→ GREEN
→ checkpoint
→ approval
→ next stage
```

No premature commit.

No automatic push.

---

# §99 — Pristine Snapshot Rule

The pristine snapshot MUST be captured:

```text
AFTER GREEN
```

not before.

The snapshot must represent the final verified implementation.

---

# §100 — Working Discipline

The following rules are mandatory and unchanged from PHASE 3.13–3.15:

1. **READ-ONLY until each checkpoint is approved**
2. **RED-first proofs for every new assertion**
3. **New branch per phase**
4. **No commits/pushes until checkpoint approval**
5. **STOP at each checkpoint with structured report**
6. **Do NOT weaken architectural boundaries**
7. **Do NOT fabricate spec text or file:line citations**
8. **Pristine snapshot AFTER GREEN, not before**
9. **Stub-kill proof for critical paths**
10. **If a PHASE G backlog item blocks, STOP and report**

---

# §101 — Absolute Architectural Prohibitions

The following are forbidden in PHASE 3.16:

```text
NO LLM
NO NETWORK
NO FILESYSTEM IN CORE AI
NO NEW NPM RUNTIME DEPENDENCIES
NO DIRECT STORE MUTATION
NO DIRECT SCENEGRAPH MUTATION
NO TRANSACTION BYPASS
NO NESTED TRANSACTIONS
NO HISTORY DAG
NO HISTORY MANAGER REWRITE
NO RENDERER MUTATION
NO SRC/ PARALLEL ARCHITECTURE
NO TYPESCRIPT TYPES
NO FABRICATED METRICS
NO FABRICATED API CONTRACTS
NO SILENT PHASE-G PATCHES
NO AUTONOMOUS MUTATION
```

---

# §102 — Final Phase Contract

PHASE 3.16 is not a rewrite of the system.

It is an integration phase.

The desired transformation is:

```text
BEFORE

Planner
  +
Evaluation
  +
Critic
  +
Correction
  +
T19 isolated proposal capability


AFTER

Planner
   ↕
Constraint Reasoning
   ↕
Evaluation
   ↕
Critic
   ↕
Correction Loop
   ↕
Transaction
```

The constraint layer must become a first-class **reasoning signal**, while preserving every existing architectural boundary.

---

# §103 — Final Success Criterion

The phase succeeds when the system can deterministically demonstrate:

```text
1. A constraint is inferred by T19.
2. The proposal retains provenance and confidence.
3. The proposal can be consumed by Planner reasoning.
4. Planner can express the intended relationship in ExpectedState.
5. Execution occurs through the existing Transaction architecture.
6. Evaluation measures whether the relationship holds.
7. Critic can diagnose a violated relationship.
8. Critic can produce a correction proposal.
9. Correction Loop can execute the correction.
10. The correction uses an independent transaction.
11. Re-evaluation verifies the resulting relationship.
12. Regression is detected when another constraint is harmed.
13. Hard constraints are never silently violated.
14. History remains linear.
15. No nested transaction architecture is introduced.
16. No LLM/network/filesystem dependency is introduced.
17. All previous phases remain GREEN.
```

That is the complete PHASE 3.16 contract.

# END OF PHASE 3.16
