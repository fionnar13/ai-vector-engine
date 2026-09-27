// ============================================================================
// PHASE 3.17 — SEMANTIC NORMALIZATION + PLANNER + EVALUATION + CRITIC TESTS
// (tests/semantic-inference.test.mjs — the 3.17 Checkpoint B + C + D + E suite)
// ============================================================================
// Harness protocol: identical to tests/constraint-inference.test.mjs (house
// runner, final "Tests: N total, M passed, F failed" line, exit 1 on failure).
// This file is run SEPARATELY from the 943-test counted suite (scripts/
// run-suite.sh keeps its 3.15 file list; the 3.16 surface is the separate
// 107-test inference suite). Checkpoint B target: 943 counted + 5 gates
// + 107 inference + 17 Category N = 1050 + 17 GREEN.
//
// SCOPE (spec §55, Checkpoint B — NORMALIZATION): the session normalizes raw
// T20 tool results into stable, deep-frozen, entropy-free records. The T20
// runtime surface (src-js/tools.js:973-999, engine src-js/semantic.js:122-280)
// is FROZEN for this checkpoint — nothing but this pair (module + tests) is
// created or modified.
//
// CATEGORY N (17 tests):
//   N-1  module exists and exports createInferenceSession
//   N-2  session API shape (ingest/getRecords/getRefusals/getRegistry)
//   N-3  normalized record shape matches BD-1..BD-6
//   N-4  role vocabulary = T20's 7 emitted roles (BD-1, no VALID_ROLES mapping)
//   N-5  content-derived id determinism (BD-5)
//   N-6  confidence preserved verbatim, no threshold (BD-3, spec §36)
//   N-7  evidence preserved verbatim (BD-4)
//   N-8  source === 'T20' (BD-4, spec §37)
//   N-9  status === 'PROPOSED' on accepted records
//   N-10 no entropy: no wall-clock / no RNG in normalized output (BD-5, §19)
//   N-11 unsupported role -> refusal per BD-6 (+ T20 failure envelope)
//   N-12 malformed T20 result -> refusal, never throws
//   N-13 empty proposal set -> empty records (honest no-op)
//   N-14 unknown role -> accepted (BD-2a; engine no-evidence shape :239-249)
//   N-15 deep-frozen records (+ upstream stays caller-owned, unfrozen)
//   N-16 zero imports: static source scan (spec §44)
//   N-17 determinism: two sessions -> byte-identical registries (spec §19)
//
// CATEGORY O (12 tests, Checkpoint C — PLANNER INTEGRATION, spec §56):
//   O-1  PlanningContext accepts an optional `semantic` array; deep-frozen
//   O-2  existing PlanningContext callers unchanged (no semantic -> identical
//        behavior, byte-identical ExpectedState)
//   O-3  ExpectedState.semantic.satisfied admits null|boolean (the 3.16
//        constraint.satisfied mirror)
//   O-4  ExpectedState.semantic.expectations is an optional array
//   O-5  the Planner produces a deterministic Plan carrying the accepted
//        semantic expectations
//   O-6  the Planner does NOT mutate the SemanticStore / inference session
//   O-7  the Planner does NOT open transactions
//   O-8  the Planner does NOT touch geometry/appearance/object stores
//   O-9  round-trip T20 -> ingest -> accepted records ->
//        PlanningContext.semantic -> createPlan ->
//        plan.expectedState.semantic.expectations (deep-equals records)
//   O-10 two createPlan calls with identical inputs -> byte-identical plans
//        (Invariant 17)
//   O-11 refusal records do NOT enter expectedState.semantic.expectations
//   O-12 backward compat: the existing ai.test.mjs (131 tests) stays GREEN
//
// CATEGORY P (14 tests, Checkpoint D — EVALUATION INTEGRATION, spec §57):
//   P-1  metadata.semanticResults present when expected.semantic.expectations
//        exists (total shape, agenda order, 'semantic' in evaluated)
//   P-2  SATISFIED case: expected role === provided actual role
//   P-3  VIOLATED case: expected !== actual -> one category:'semantic'
//        deviation (the reserved DEVIATION_CATEGORIES member, dormant since
//        3.14) + result.status DEVIATION
//   P-4  UNEVALUABLE case: no role provider -> reason NO_ROLE_PROVIDER,
//        listed in unevaluatedExpectations as 'semantic.expectations[i]';
//        non-function provider -> INVALID_EVALUATION_CONTEXT
//   P-5  UNSUPPORTED case: role outside T20's 7-role emission set (expected
//        side or actual side) -> UNSUPPORTED, provider never trusted
//   P-6  INSUFFICIENT_EVIDENCE case: provider returns null ->
//        PROVIDER_RETURNED_NO_ROLE, no invented deviation
//   P-7  multi-expectation: 3 expectations -> 3 semanticResults, agenda order
//   P-8  no false verification: unmeasurable expectations can never become
//        SATISFIED (and never invent deviations)
//   P-9  determinism: identical inputs -> identical semanticResults +
//        deviation ids; provider invoked exactly once per expectation
//   P-10 backward compat: evaluation-critic 120/120 + constraint-inference
//        107/107 (the 14 J-tests inside) remain GREEN
//   P-11 no semantic.js / semantic-inference.js import in evaluation.js
//        (static scan); the 12-export surface gains nothing
//   P-12 evaluation.js does NOT mutate semantic state, the agenda, or any
//        store (frozen fixtures byte-identical; provider called with the
//        expectation's objectId only)
//   P-13 semanticResults deep-frozen, never aliased to the input agenda
//   P-14 role provider optional — omission (and provider-without-agenda)
//        preserves existing evaluate() behavior; the dormant blanket
//        'semantic' marker stays for the non-evaluable form
//
// CATEGORY Q (12 tests, Checkpoint E — CRITIC INTEGRATION, spec §58):
//   Q-1  proposeCorrections accepts an EvaluationResult carrying semantic
//        deviations; non-semantic rules keep working in the same pass
//   Q-2  a VIOLATED semantic deviation produces NO proposal (the §28 decline)
//        and the diagnostic signal rides the composed output
//        (evaluationResult.metadata.semanticResults); the decline is routed
//        EXPLICITLY (the category === 'semantic' discriminator exists)
//   Q-3  SATISFIED semantic results produce NO deviation and NO proposal
//   Q-4  UNEVALUABLE / UNSUPPORTED / INSUFFICIENT_EVIDENCE produce NO
//        deviation and NO proposal; the honest signal stays on the sidecar
//   Q-5  every emitted proposal uses the existing 7-key contract; none
//        references a semantic deviationId
//   Q-6  no new exports in critic.js (the 6-export C/D-era surface)
//   Q-7  critic.js does NOT mutate any store or the consumed result
//   Q-8  critic.js does NOT open transactions
//   Q-9  critic.js does NOT import correction.js or semantic.js (static scan)
//   Q-10 determinism: two proposeCorrections calls -> identical output
//   Q-11 backward compat: evaluation-critic 120 + constraint-inference 107
//        (the 14 J-tests + 14 K-tests inside) remain GREEN
//   Q-12 semantic diagnosis preserves evidence + provenance (source 'T20',
//        evidence, confidence) where available; no invented confidence
//
// CATEGORY R (12 tests, Checkpoint F — CORRECTION INTEGRATION, spec §59):
//   R-1  a semantic deviation reaches the Correction Loop through the existing
//        boundary (the §7 CorrectionTarget agenda; REAL B->D evaluation chain)
//   R-2  the loop's capability resolution sees the SEMANTIC_ERROR root cause
//        (CATEGORY_TO_ROOT_CAUSE.SEMANTIC; behavioral via the ledger)
//   R-3  capability resolution produces NO_CAPABILITY (per A-9: zero recipes
//        for SEMANTIC_ERROR); the frozen resolution record, pinned verbatim
//   R-4  the loop terminates honestly (TERMINATED / 'UNFIXABLE' per the
//        disclosure-39 mapping; the no-cycle rule keeps the session at IDLE)
//   R-5  no transaction is opened for a semantic deviation (no capability ->
//        no attempt): every substrate counter stays at zero
//   R-6  history remains linear (Invariant 13): zero corrections, zero
//        iterations, the state trail stays ['IDLE'], one fingerprint
//   R-7  no direct Store mutation (Invariant 8): the engine's ONLY document
//        contact is the single critic consultation (read-delta = one evaluate)
//   R-8  determinism: two full pipelines -> identical outcomes (Invariant 19)
//   R-9  the honest diagnostic reaches the loop via the correct channel (the
//        D-1 sidecar record rides target.evidence verbatim; session-local
//        frozen snapshot; ledger traceability)
//   R-10 existing correction.test.mjs (144 tests) remains GREEN (no regression)
//   R-11 backward compat: the 1105 baseline components hold (constraint 107,
//        ai 131, evaluation-critic 120; counted 943 + gates in the final run)
//   R-12 Correction Loop does NOT import semantic.js or semantic-inference.js
//        (static scan: correction.js has ZERO static imports at all)
//
// DESIGN DECISIONS PINNED HERE (mirrored in src-js/semantic-inference.js):
//   BD-1  the normalized role vocabulary IS T20's emission vocabulary
//         {text, heading, background, shape, icon, container, unknown} —
//         no mapping onto the 14-role VALID_ROLES set (semantic.js:6) and
//         no aliases exist anywhere in src-js (Checkpoint A-2/A-4).
//   BD-2  'unknown' is accepted as a real role — T20 already honest-labels it
//         (semantic.js:242/:255/:259, incl. the no-evidence branch :239-249).
//   BD-3  confidence is preserved verbatim; never rounded, never clamped,
//         never thresholded (spec §36 forbids magic thresholds).
//   BD-4  provenance = { source: 'T20', evidence: [...] }; T20's
//         source:'heuristic' names the ALGORITHM, the tool is the ORIGIN.
//   BD-5  entropy (proposalId/createdAt) is stripped; id = 'smr-' + fnv1a32
//         over the key-sorted canonical content {objectId, role, confidence,
//         evidence} (spec §19; the 3.16 T19 wall-clock finding).
//   BD-6  refusals are flat frozen ledger records {status:'REJECTED',
//         reason, upstream} — the 3.16 refusalLedger precedent family
//         (correction.js:1953/:3043), never throws.
//   BD-7  zero imports — fnv1a32/stableStringify are reimplemented locally
//         (the constraint-inference.js:140-180 pattern), spec §44.
//
// CATEGORY O DESIGN DECISIONS PINNED HERE (mirrored in src-js/ai.js):
//   CD-1  section shape { satisfied: null, expectations: [...] }: 'satisfied'
//         is the unevaluated marker (null; boolean admitted for the later
//         checkpoints — the constraint.satisfied mirror), 'expectations'
//         carries the accepted records VERBATIM, in order (O-9 deep-equals).
//   CD-2  ABSENT by default: no context.semantic -> NO semantic section — the
//         pre-3.17 ExpectedState is reproduced byte-identically (O-2).
//   CD-3  refusals are never promoted into desired state: only records with
//         status === 'PROPOSED' enter expectations[] (O-11) — the planner-side
//         filter is defense in depth on top of getRecords().
//   CD-4  loud refusal on a malformed agenda: context.semantic present but not
//         an array -> PlanningError INVALID_PARAMETER (the §13 house style).
//   CD-5  createPlanningContext needs NO code change: the generic plain-data +
//         no-functions + deep-freeze projection contract (ai.js:574-587)
//         already accepts and freezes the semantic array — the 3.16 mirror.
//   CD-6  the Planner stays read-only w.r.t. semantics: zero coupling to the
//         semantic-inference module, no transactions, no store writes — the
//         one-substrate import contract holds (ai.js:55).
//
// CATEGORY P DESIGN DECISIONS PINNED HERE (mirrored in src-js/evaluation.js):
//   DD-1  the ACTUAL role comes ONLY from the injected provider
//         evaluationContext.getActualRole(objectId) -> role string | null —
//         no T20 call (no evaluation->tools coupling), no store read; the
//         provider is validated (function) only when the arm runs, and is
//         invoked exactly once per measurable expectation, in agenda order.
//   DD-2  the five §57 statuses, only where actually supported: SATISFIED /
//         VIOLATED / UNSUPPORTED / UNEVALUABLE / INSUFFICIENT_EVIDENCE, with
//         deterministic machine reasons (NO_ROLE_PROVIDER,
//         PROVIDER_RETURNED_NO_ROLE, EXPECTED_ROLE_UNSUPPORTED,
//         ACTUAL_ROLE_UNSUPPORTED) and null reason on the measured pair.
//   DD-3  T20's 7-role emission vocabulary is pinned as a LOCAL frozen
//         constant (the BD-1 mirror; no import from semantic.js or
//         semantic-inference.js — the constraint arm's localization pattern).
//   DD-4  VIOLATED rides ONE category:'semantic' deviation per expectation —
//         the category RESERVED in DEVIATION_CATEGORIES (evaluation.js:146,
//         dormant per the header 'E6 semantic stays dormant'); property
//         'role'; targetRef '$doc:'+objectId (the constraint-arm convention).
//   DD-5  metadata.semanticResults = total null-normalized records
//         {objectId, role, status, confidence, reason} in agenda order — the
//         §13 total-shape discipline; NO semanticDeviations sidecar (semantic
//         deviations are category-self-identifying, unlike 3.16's
//         geometry-riding constraint deviations).
//   DD-6  evaluated gains 'semantic' whenever an evaluable agenda exists —
//         the mirror of the constraint arm pushing 'constraint' even for
//         UNVERIFIABLE records (the arm ran and returned honest verdicts).
//   DD-7  the blanket 'semantic' unevaluated marker (:965) stays for the
//         non-evaluable form (section without an expectations array); when
//         the arm runs, per-expectation 'semantic.expectations[i]' entries
//         replace it — the constraint.satisfied boolean-vs-compliance split,
//         mirrored.
//   DD-8  loud shape refusals: a non-plain-object expectation, a missing
//         objectId/role, or a non-finite confidence -> EvaluationError
//         INVALID_EXPECTED_STATE; a present-but-non-function provider ->
//         EvaluationError INVALID_EVALUATION_CONTEXT.
//
// CATEGORY Q DESIGN DECISIONS PINNED HERE (mirrored in src-js/critic.js):
//   EE-1  semantic deviations produce NO correction proposal — the §28
//         honest decline. Evidence: the proposal validator REJECTS any
//         intent.type outside the 5 planning capabilities (critic.js:212-214),
//         so a 'NO_CORRECTION_CAPABILITY intent.type' can never pass the
//         7-key contract; a capability-typed but broken intent would fake a
//         capability request (§28) and be an unsupported diagnosis (§58's
//         own ban); the 3.16 constraint rule's size/distance precedent is
//         NO proposal for diagnosed-but-uncorrectable deviations ("surfaced,
//         never patched", critic.js:460-465); the 3.14 module header already
//         declared semantic -> NO proposal (critic.js:53-58); correction.js
//         carries zero semantic recipes (A-9); spec §24/§58.
//   EE-2  the diagnostic signal = the EXISTING D-1 sidecar:
//         metadata.semanticResults (statuses, reasons, confidence) plus the
//         verbatim B-record agenda on result.expected.semantic.expectations
//         (source 'T20', evidence, confidence). The critic adds NO new
//         channel — the evaluateAndCritique pair is pinned to exactly
//         {evaluationResult, proposals} (evaluation-critic D-1) and the
//         proposals array to 7-key entries; preservation = read-only
//         pass-through.
//   EE-3  the additive change: the EXPLICIT semantic branch in proposalFor
//         (the shape-based discriminator on category === 'semantic') + the
//         named decline function + the appended section header. The generic
//         deviation loop already routes semantic entries through the
//         dispatch, so a separate filtering pass would be dead code — the
//         3.16-style pass is subsumed and the report discloses it.
//   EE-4  no invented confidence: no semantic proposal exists, so the
//         rule-derived constant-1 confidence is never applied to a
//         non-restorable deviation; non-semantic proposals keep the constant
//         1 for their OWN restorable deviations.
//   EE-5  evidence/provenance preservation is verified behaviorally: the
//         consumed EvaluationResult arrives at and leaves the critic
//         byte-identical (frozen fixtures), with source/evidence/confidence
//         intact on the agenda and the sidecar.
//   EE-6  raw-token hygiene (the D-1 lesson): the new comments avoid every
//         C-3/F-3 banned token (the 'measured' substring, word-boundary
//         document/process/window, the execution-surface substrings).
//   EE-7  no new exports (the 6-export surface, evaluation-critic:1644) and
//         no new imports (exactly ['./evaluation.js'], C-3/F-3).
//
// CATEGORY R DESIGN DECISIONS PINNED HERE (Checkpoint F, spec §59; TEST-ONLY):
//   FD-1  OUTCOME (1) DECLARED — NO_CORRECTION_CAPABILITY is the honest 3.17
//         state of semantic correction: correction.js carries ZERO recipes for
//         SEMANTIC_ERROR (A-9, :1319-1347 'the §28 honest gaps'), the critic
//         emits NO semantic proposal (E-1), spec §54 forbids fabricating a
//         capability, spec §63 requires honest termination of unsupported
//         paths. NO production change — this checkpoint is test-only (per
//         A-2 S-2 'correction.js: NO CHANGE expected').
//   FD-2  the boundary: deviations NEVER enter the loop raw — the §7
//         CorrectionTarget agenda is the loop's only input channel
//         (validateCorrectionLoopRequest :2778-2788). The deviation->target
//         projection is the CALLER's (orchestrator) duty and lives TEST-side:
//         deviation.category 'semantic' -> 'SEMANTIC' (the §7 vocabulary),
//         deviation.property 'role' -> metric, severity 'error' -> 'HIGH',
//         confidence verbatim (0.8), evidence = the D-1 sidecar record
//         VERBATIM (the R-9 channel).
//   FD-3  metric semantics: metric 'role' matches the D-1 deviation's
//         property 'role' (exact-or-dot-boundary, disclosure 14); COUNT mode
//         (no targetValue) -> gap = number of matching deviations — the
//         agenda is unsatisfied exactly while the violation exists.
//   FD-4  honest termination: blocker source NO_CAPABILITY ->
//         exhaustionReasonFor -> 'UNFIXABLE' (correction.js:2981-2987, the
//         deterministic disclosure-39 mapping); the §50 vocabulary's
//         'SEMANTIC_BLOCKED' slot EXISTS (:666-670) but is NOT wired to this
//         path — pinned as-is, never re-labeled (no fabrication).
//   FD-5  the no-cycle rule: from IDLE, engineGiveUp keeps the session at
//         IDLE — nothing was ever attempted, the ENGINE carries the verdict
//         (status/terminationReason/lastReport) (correction.js:3010-3013).
//   FD-6  injected authorities: the critic = the REAL D-1 evaluation surface
//         (duck-typed {evaluate(document, context) -> EvaluationResult}); the
//         role provider rides the critic authority's CLOSURE because
//         request.evaluationContext is plain-data-scanned (:2814-2820, a
//         deliberate engine discipline); the substrate = counting stubs whose
//         zero-call counts ARE the R-5 proof.
//   FD-7  session-local snapshot: the loop stores a deep-frozen PLAIN snapshot
//         of the critic's evaluation on session.currentEvaluation — content
//         identity (deep-equals), never reference identity; the engine owns
//         its world view (the honesty boundary this checkpoint pins).
//   FD-8  RED expectation: every R assertion models EXISTING engine behavior
//         (the honest path already exists), so GREEN-by-construction at RED
//         is the EXPECTED outcome for a test-only honest-path checkpoint (the
//         E-1 precedent, 11/12 at RED); a true RED would mean a test modeling
//         error or an engine gap — investigated and disclosed, never wired
//         around silently.
// ============================================================================

// --- the module under test (RED until src-js/semantic-inference.js exists) ---
import { createInferenceSession } from '../src-js/semantic-inference.js';

// --- static-scan support (N-10/N-16/O-6..O-8 read module sources directly) ---
import { readFileSync } from 'node:fs';

// --- Category O: the Planner integration surface (src-js/ai.js) --------------
import {
  createPlanningContext, createExpectedState, createPlan, validatePlanStructure, buildExpectedState, validateExpectedState,
  validatePlan, compilePlanToDSL
} from '../src-js/ai.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --- Category P: the Evaluation integration surface (src-js/evaluation.js) ---
import { evaluate, validateEvaluationResult } from '../src-js/evaluation.js';
import * as EvaluationNS from '../src-js/evaluation.js';

// --- Category Q: the Critic integration surface (src-js/critic.js) -----------
import { proposeCorrections, evaluateAndCritique, validateCorrectionProposal } from '../src-js/critic.js';
import * as CriticNS from '../src-js/critic.js';

// --- Category R: the Correction integration surface (src-js/correction.js) ---
import {
  CorrectionEngine, createCorrectionTarget, resolveCorrectionDiagnosis, createCorrectionLoopPolicy,
  CATEGORY_TO_ROOT_CAUSE, CORRECTION_CAPABILITY_RECIPES, CORRECTION_TERMINATION_REASONS,
  CORRECTION_DIAGNOSIS_ROOT_CAUSES
} from '../src-js/correction.js';
import * as CorrectionNS from '../src-js/correction.js';

// --- Category S: the LIVE document substrate (the §60 golden; all relative) ---
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { TransactionBuilder, TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';
import { ToolRegistry, registerCoreTools } from '../src-js/tools.js';
import { parseDSL, validateDSL, compileToIR, DSLExecutor } from '../src-js/dsl.js';

// --- house runner (verbatim 3.16 pattern) ------------------------------------
let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function deepEq(a,b,msg){ const x=JSON.stringify(a), y=JSON.stringify(b); if(x!==y) throw new Error(`${msg||'deepEq failed'}: ${x} !== ${y}`); }
function deepFrozen(value, path){
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `deep-frozen violated at ${path||'(root)'}`);
  for (const k of Object.keys(value)) deepFrozen(value[k], `${path||'(root)'}.${k}`);
}

// --- T20 fixture factory (engine record shape, semantic.js:269-279 verbatim;
//     entropy stand-ins stand in for the engine's RNG/wall-clock fields) ------
const T20_ROLES = Object.freeze(['text','heading','background','shape','icon','container','unknown']);
let seq = 0;
function makeProposal(overrides = {}){
  seq++;
  return {
    proposalId: `proposal-uuid-${seq}-RNG`,
    objectId: `obj-${seq}`,
    proposedRole: 'text',
    proposedTags: ['label'],
    proposedRelationships: [],
    confidence: 0.6,
    evidence: [{ signal: 'geometry_type', description: 'text geometry', weight: 0.1 }],
    source: 'heuristic',
    createdAt: 1727000000000 + seq,
    ...overrides,
  };
}
function makeEnvelope(proposals){
  // the T20 tool result envelope, tools.js:997 — {success, output:{proposals}}
  return { success: true, output: { proposals } };
}
function makeFailureEnvelope(){
  // the T20 precondition-failure envelope, tools.js:963/:980
  return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: 'Geometry not resolvable for object obj-x', toolId: 'T20', objectIds: ['obj-x'] }] };
}

// ---- N-1 --------------------------------------------------------------------
test('N-1: the module exists and exports createInferenceSession', ()=>{
  eq(typeof createInferenceSession, 'function', 'createInferenceSession is an exported function');
  const session = createInferenceSession();
  expect(session && typeof session === 'object', 'the factory returns a session object');
});

// ---- N-2 --------------------------------------------------------------------
test('N-2: session API shape — ingest/getRecords/getRefusals/getRegistry', ()=>{
  const session = createInferenceSession();
  for(const m of ['ingest','getRecords','getRefusals','getRegistry']){
    eq(typeof session[m], 'function', `session.${m} is a function`);
  }
  const out = session.ingest(makeEnvelope([makeProposal()]));
  expect(out && typeof out === 'object', 'ingest returns an outcome object');
  expect(Array.isArray(out.records), 'outcome.records is an array');
  expect(Array.isArray(out.refusals), 'outcome.refusals is an array');
  expect(Array.isArray(session.getRecords()), 'getRecords returns an array');
  expect(Array.isArray(session.getRefusals()), 'getRefusals returns an array');
  const reg = session.getRegistry();
  expect(reg && Array.isArray(reg.records) && Array.isArray(reg.refusals), 'the registry exposes records + refusals');
});

// ---- N-3 --------------------------------------------------------------------
test('N-3: normalized record shape matches BD-1..BD-6 (exact key set, field mapping)', ()=>{
  const p = makeProposal();
  const out = createInferenceSession().ingest(makeEnvelope([p]));
  eq(out.records.length, 1, 'one valid proposal -> one record');
  const rec = out.records[0];
  deepEq(Object.keys(rec).sort(), ['confidence','evidence','id','objectId','role','source','status'], 'the record carries EXACTLY the seven pinned fields');
  eq(rec.objectId, p.objectId, 'objectId preserved from input');
  eq(rec.role, p.proposedRole, 'role comes from proposedRole (BD-1)');
  eq(rec.confidence, p.confidence, 'confidence preserved (BD-3)');
  deepEq(rec.evidence, p.evidence, 'evidence preserved (BD-4)');
  eq(rec.source, 'T20', 'source is the T20 constant (BD-4)');
  eq(rec.status, 'PROPOSED', 'status PROPOSED');
  expect(/^smr-[0-9a-f]{8}$/.test(rec.id), `id is content-derived smr-<8-hex>, got ${rec.id}`);
  // refusal side of the shape union (BD-6): reason only on refusals
  const bad = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-bad', proposedRole: 'widget' })]));
  eq(bad.records.length, 0, 'unsupported role produces no record');
  deepEq(Object.keys(bad.refusals[0]).sort(), ['reason','status','upstream'], 'the refusal carries EXACTLY status/reason/upstream (BD-6)');
});

// ---- N-4 --------------------------------------------------------------------
test('N-4: role vocabulary = T20\'s 7 emitted roles — no VALID_ROLES mapping, no aliases (BD-1)', ()=>{
  const session = createInferenceSession();
  for(const role of T20_ROLES){
    const out = session.ingest(makeEnvelope([makeProposal({ objectId: `obj-${role}`, proposedRole: role })]));
    eq(out.records.length, 1, `role ${role} is accepted`);
    eq(out.records[0].role, role, `role ${role} passes through VERBATIM (no mapping)`);
    eq(out.records[0].status, 'PROPOSED', `role ${role} -> PROPOSED`);
  }
  eq(session.getRecords().length, 7, 'exactly the 7 T20-emitted roles accepted');
  // the other 7 VALID_ROLES members (semantic.js:6) are NOT T20-emittable —
  // the session does not widen the vocabulary to the full 14-role store set
  for(const notEmitted of ['foreground','group','button','logo','image','illustration','decorative']){
    const out = session.ingest(makeEnvelope([makeProposal({ objectId: `obj-${notEmitted}`, proposedRole: notEmitted })]));
    eq(out.records.length, 0, `VALID_ROLE ${notEmitted} is NOT T20-emittable -> refused`);
    eq(out.refusals[0].reason, 'UNSUPPORTED_TYPE', `VALID_ROLE ${notEmitted} refusal reason`);
  }
});

// ---- N-5 --------------------------------------------------------------------
test('N-5: content-derived id determinism — same content, same id; entropy and key order irrelevant; evidence moves the id (BD-5)', ()=>{
  // (a) same input, two sessions -> identical id
  const p1 = makeProposal({ objectId: 'obj-det' });
  const idA = createInferenceSession().ingest(makeEnvelope([p1])).records[0].id;
  const idB = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-det' })])).records[0].id;
  eq(idA, idB, 'same logical content -> identical id across sessions');
  // (b) key-order-shuffled proposal with DIFFERENT entropy stand-ins -> same id
  //     (content = {objectId, role, confidence, evidence}; proposalId/createdAt
  //     are stripped, their values can never move the id)
  const shuffled = {
    createdAt: 9999420420000,
    source: 'heuristic',
    evidence: [{ weight: 0.1, description: 'text geometry', signal: 'geometry_type' }],
    confidence: 0.6,
    proposedRelationships: [],
    proposedTags: ['label'],
    proposedRole: 'text',
    objectId: 'obj-det',
    proposalId: 'proposal-uuid-OTHER-RNG',
  };
  const idC = createInferenceSession().ingest(makeEnvelope([shuffled])).records[0].id;
  eq(idC, idA, 'shuffled key order + different upstream entropy -> identical id');
  // (c) different evidence -> different id
  const idD = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-det', evidence: [{ signal: 'geometry_type', description: 'text geometry', weight: 0.2 }] })])).records[0].id;
  expect(idD !== idA, 'different evidence -> different id');
  // (d) batch order does not matter: reordered proposals yield the same id SET
  const env1 = makeEnvelope([makeProposal({ objectId: 'obj-r1' }), makeProposal({ objectId: 'obj-r2' })]);
  const env2 = makeEnvelope([makeProposal({ objectId: 'obj-r2' }), makeProposal({ objectId: 'obj-r1' })]);
  const ids1 = createInferenceSession().ingest(env1).records.map(r=>r.id).sort();
  const ids2 = createInferenceSession().ingest(env2).records.map(r=>r.id).sort();
  deepEq(ids2, ids1, 'reordered proposal batch -> identical id set');
});

// ---- N-6 --------------------------------------------------------------------
test('N-6: confidence preserved verbatim — no rounding, no clamping, NO threshold (BD-3, spec §36)', ()=>{
  const session = createInferenceSession();
  const cases = [0, 1, 0.3, 0.6, 0.7 + 0.1 /* 0.7999999999999999 stays unrounded */];
  cases.forEach((c, i)=>{
    const out = session.ingest(makeEnvelope([makeProposal({ objectId: `obj-c${i}`, confidence: c })]));
    eq(out.records[0].confidence, c, `confidence ${c} preserved verbatim`);
    eq(out.records[0].status, 'PROPOSED', `confidence ${c} is never thresholded (spec §36)`);
  });
  const missing = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-cm', confidence: undefined })])).records[0];
  eq(missing.confidence, null, 'missing confidence -> null (the record-shape null arm)');
  const nonNumeric = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-cn', confidence: 'high' })])).records[0];
  eq(nonNumeric.confidence, null, 'non-numeric confidence -> null, never coerced');
});

// ---- N-7 --------------------------------------------------------------------
test('N-7: evidence preserved verbatim — multi-row, empty, and missing; copied, never aliased (BD-4)', ()=>{
  const rows = [
    { signal: 'text_content', description: 'non-empty text', weight: 0.3 },
    { signal: 'font_size', description: 'large font', weight: 0.15 },
    { signal: 'appearance', description: 'has fill', weight: 0.03 },
  ];
  const p = makeProposal({ objectId: 'obj-ev', evidence: rows });
  const rec = createInferenceSession().ingest(makeEnvelope([p])).records[0];
  deepEq(rec.evidence, rows, 'all three evidence rows preserved verbatim (content + order)');
  expect(rec.evidence !== p.evidence, 'evidence is a copy, not an alias (no caller-structure aliasing)');
  const empty = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-ev0', evidence: [] })])).records[0];
  deepEq(empty.evidence, [], 'empty evidence stays empty');
  const absent = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-ev1', evidence: undefined })])).records[0];
  deepEq(absent.evidence, [], 'absent evidence normalizes to []');
});

// ---- N-8 --------------------------------------------------------------------
test('N-8: source === \'T20\' — the tool is the origin, \'heuristic\' is the algorithm (BD-4, spec §37)', ()=>{
  const session = createInferenceSession();
  // upstream source variants never leak into the normalized record: every
  // accepted record came through T20, so the normalized source is the constant
  for(const upstreamSource of ['heuristic', 'ai', undefined]){
    const rec = session.ingest(makeEnvelope([makeProposal({ objectId: `obj-s-${String(upstreamSource)}`, source: upstreamSource })])).records[0];
    eq(rec.source, 'T20', `upstream source ${String(upstreamSource)} -> normalized source 'T20'`);
  }
});

// ---- N-9 --------------------------------------------------------------------
test('N-9: status === \'PROPOSED\' on every accepted record', ()=>{
  const session = createInferenceSession();
  const out = session.ingest(makeEnvelope(T20_ROLES.map(r=>makeProposal({ objectId: `obj-p-${r}`, proposedRole: r }))));
  eq(out.records.length, 7, 'all seven accepted');
  for(const rec of out.records) eq(rec.status, 'PROPOSED', `status PROPOSED for role ${rec.role}`);
  eq(session.getRecords().every(r=>r.status==='PROPOSED'), true, 'getRecords never carries non-PROPOSED entries');
});

// ---- N-10 -------------------------------------------------------------------
test('N-10: no entropy in normalized output — no RNG/wall-clock fields, no RNG/wall-clock in the module (BD-5, spec §19)', ()=>{
  const rec = createInferenceSession().ingest(makeEnvelope([makeProposal({ objectId: 'obj-ent' })])).records[0];
  eq('proposalId' in rec, false, 'no proposalId field');
  eq('createdAt' in rec, false, 'no createdAt field');
  const json = JSON.stringify(rec);
  expect(!json.includes('proposalId') && !json.includes('createdAt'), 'serialized record carries zero upstream entropy keys');
  // static scan: the module itself contains no RNG and no wall-clock access
  const src = readFileSync(new URL('../src-js/semantic-inference.js', import.meta.url), 'utf-8');
  expect(!src.includes('Math.random'), 'module source: no RNG access');
  expect(!src.includes('Date.now'), 'module source: no wall-clock access');
  expect(!src.includes('new Date'), 'module source: no date construction');
});

// ---- N-11 -------------------------------------------------------------------
test('N-11: unsupported role -> refusal per BD-6 (+ T20 failure envelope -> T20_FAILED)', ()=>{
  const session = createInferenceSession();
  const p = makeProposal({ objectId: 'obj-u1', proposedRole: 'widget' });
  const out = session.ingest(makeEnvelope([p]));
  eq(out.records.length, 0, 'no record for the unsupported role');
  eq(out.refusals.length, 1, 'exactly one refusal');
  const r = out.refusals[0];
  eq(r.status, 'REJECTED', 'refusal status');
  eq(r.reason, 'UNSUPPORTED_TYPE', 'refusal reason');
  deepEq(r.upstream, p, 'upstream preserved verbatim');
  // per-proposal isolation: the valid sibling is still normalized
  const mixed = session.ingest(makeEnvelope([makeProposal({ objectId: 'obj-u2' }), makeProposal({ objectId: 'obj-u3', proposedRole: 'widget' })]));
  eq(mixed.records.length, 1, 'the valid sibling is normalized');
  eq(mixed.records[0].objectId, 'obj-u2', 'the valid sibling keeps its identity');
  eq(mixed.refusals.length, 1, 'the unsupported sibling is refused');
  // "when T20 fails" (BD-6): a well-formed failure envelope is a refusal too
  const failed = session.ingest(makeFailureEnvelope());
  eq(failed.records.length, 0, 'a failed T20 result produces no records');
  eq(failed.refusals.length, 1, 'a failed T20 result produces one refusal');
  eq(failed.refusals[0].reason, 'T20_FAILED', 'the failure reason (tools.js:963/:980 envelope)');
  eq(failed.refusals[0].status, 'REJECTED', 'the failure status');
});

// ---- N-12 -------------------------------------------------------------------
test('N-12: malformed T20 result -> MALFORMED refusal — never throws', ()=>{
  const session = createInferenceSession();
  const malformedInputs = [
    null, undefined, 42, 'not-a-result', [], true,
    {},                                     // no success/output
    { success: true, output: {} },          // missing proposals
    { success: true, output: { proposals: 'no' } }, // proposals not an array
    { success: 'yes', output: { proposals: [] } },  // success not boolean true
  ];
  for(const input of malformedInputs){
    const out = session.ingest(input);
    eq(out.records.length, 0, `no records for malformed input ${JSON.stringify(input)}`);
    eq(out.refusals.length, 1, `exactly one refusal for malformed input ${JSON.stringify(input)}`);
    eq(out.refusals[0].reason, 'MALFORMED', `MALFORMED reason for input ${JSON.stringify(input)}`);
    eq(out.refusals[0].status, 'REJECTED', `REJECTED status for input ${JSON.stringify(input)}`);
  }
  // a malformed PROPOSAL inside a well-formed envelope is refused per-proposal
  const perProposal = session.ingest(makeEnvelope([{ objectId: 'obj-m1' }, { proposedRole: 'text' }, 7]));
  eq(perProposal.records.length, 0, 'no record survives when every proposal is malformed');
  eq(perProposal.refusals.length, 3, 'each malformed proposal gets its own refusal');
  for(const r of perProposal.refusals) eq(r.reason, 'MALFORMED', 'per-proposal MALFORMED reason');
});

// ---- N-13 -------------------------------------------------------------------
test('N-13: empty proposal set -> empty records, empty refusals (honest no-op)', ()=>{
  const session = createInferenceSession();
  const out = session.ingest(makeEnvelope([]));
  deepEq(out.records, [], 'no records');
  deepEq(out.refusals, [], 'no refusals');
  deepEq(session.getRecords(), [], 'session stays empty');
  deepEq(session.getRegistry(), { records: [], refusals: [] }, 'registry reflects the honest no-op');
});

// ---- N-14 -------------------------------------------------------------------
test('N-14: unknown role -> accepted as a real role (BD-2a), engine no-evidence shape verbatim', ()=>{
  // the engine's real no-evidence output (semantic.js:239-249, verbatim shape):
  const engineNoEvidence = {
    proposalId: 'proposal-uuid-RNG',
    objectId: 'obj-unk',
    proposedRole: 'unknown',
    proposedTags: [],
    proposedRelationships: [],
    confidence: 0.3,
    evidence: [{ signal: 'geometry_type', description: 'insufficient evidence', weight: 0 }],
    source: 'heuristic',
    createdAt: 1727000000000,
  };
  const out = createInferenceSession().ingest(makeEnvelope([engineNoEvidence]));
  eq(out.records.length, 1, 'the no-evidence proposal is normalized, not refused');
  eq(out.records[0].role, 'unknown', "'unknown' accepted as a real role (BD-2 option a)");
  eq(out.records[0].confidence, 0.3, 'the 0.3 no-evidence confidence preserved (BD-3)');
  eq(out.refusals.length, 0, 'no refusal, no flag, no side channel');
});

// ---- N-15 -------------------------------------------------------------------
test('N-15: deep-frozen records AND refusals; upstream is a session-owned frozen copy — the caller object is never frozen (BD-6, no aliasing)', ()=>{
  const session = createInferenceSession();
  const out = session.ingest(makeEnvelope([makeProposal({ objectId: 'obj-f1', evidence: [{ signal: 'geometry_type', description: 'text geometry', weight: 0.1 }] })]));
  deepFrozen(out.records[0], 'record');
  deepFrozen(session.getRecords(), 'getRecords() array');
  deepFrozen(session.getRefusals(), 'getRefusals() array');
  deepFrozen(session.getRegistry(), 'getRegistry() snapshot');
  const callerProposal = makeProposal({ objectId: 'obj-f2', proposedRole: 'widget' });
  const refusalOut = session.ingest(makeEnvelope([callerProposal]));
  const r = refusalOut.refusals[0];
  expect(Object.isFrozen(r), 'the refusal envelope is frozen');
  deepFrozen(r, 'refusal (including upstream)');
  deepEq(r.upstream, callerProposal, 'upstream content preserved verbatim');
  expect(!Object.isFrozen(callerProposal), 'the CALLER\'s own proposal was never frozen or mutated — the refusal holds a frozen session-owned copy (zero caller aliasing, the 3.16 no-mutation discipline)');
});

// ---- N-16 -------------------------------------------------------------------
test('N-16: zero imports — static source scan of src-js/semantic-inference.js (spec §44)', ()=>{
  const src = readFileSync(new URL('../src-js/semantic-inference.js', import.meta.url), 'utf-8');
  expect(!/(^|\n)\s*import[\s{*'"(]/.test(src), 'no static import declarations');
  expect(!/require\s*\(/.test(src), 'no require() calls');
  expect(!/import\s*\(/.test(src), 'no dynamic import() calls');
  expect(!/export\s+[^{]*from\s/.test(src), 'no re-export from other modules');
  expect(src.length > 1000, 'the module is a real implementation, not a stub');
});

// ---- N-17 -------------------------------------------------------------------
test('N-17: determinism — two sessions over the same ingest sequence produce byte-identical registries (spec §19)', ()=>{
  const sequence = [
    makeEnvelope([makeProposal({ objectId: 'obj-d1' }), makeProposal({ objectId: 'obj-d2', proposedRole: 'heading' })]),
    makeEnvelope([makeProposal({ objectId: 'obj-d3', proposedRole: 'widget' })]),
    makeFailureEnvelope(),
    makeEnvelope([]),
    { success: true, output: { proposals: [{ objectId: 'obj-d4', proposedRole: 'unknown', confidence: 0.3, evidence: [{ signal: 'geometry_type', description: 'insufficient evidence', weight: 0 }] }] } },
  ];
  const run = ()=>{
    const session = createInferenceSession();
    for(const env of sequence) session.ingest(env);
    return JSON.stringify(session.getRegistry());
  };
  const a = run(), b = run();
  eq(a, b, 'byte-identical registries across independent sessions');
  const reg = JSON.parse(a);
  eq(reg.records.length, 3, 'three accepted records (d1, d2, d4)');
  eq(reg.refusals.length, 2, 'two refusals (widget role, T20 failure; the empty set contributes none)');
});

// ============================================================================
// CATEGORY O — PLANNER INTEGRATION (PHASE 3.17, Checkpoint C; spec §56)
// ============================================================================
// The planner face of 3.17: the ACCEPTED normalized records (status
// 'PROPOSED', Checkpoint B) ride into the Planner as an optional
// PlanningContext.semantic array — the exact mirror of the 3.16 constraint
// pattern (the ai.js:488-498 compliance branch; the generic §13 projection,
// ai.js:574-587) — and surface as an ADDITIVE ExpectedState.semantic section
// that is NOT canonical document state (Invariant 15) and is ABSENT without
// a semantic agenda (byte-identical backward compat).
// ============================================================================

// --- Category O fixtures ------------------------------------------------------
function oIntent(){
  return { type: 'create', objectType: 'rect', x: 10, y: 20, width: 120, height: 80 };
}
function oSession(){
  const session = createInferenceSession();
  session.ingest(makeEnvelope([
    makeProposal({ objectId: 'obj-o1' }),
    makeProposal({ objectId: 'obj-o2', proposedRole: 'heading' }),
    makeProposal({ objectId: 'obj-o3', proposedRole: 'widget' }), // -> refusal
  ]));
  return session;
}
function oBaseExpected(){
  // the all-null 5-section ExpectedState (the ai.js:399-407 shape)
  return {
    intentId: 'semantic-agenda',
    status: 'requested',
    geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
    spatial: { aligned: null, centered: null, bbox: null },
    appearance: { fill: null, stroke: null, opacity: null },
    constraint: { satisfied: null },
    structure: { grouped: null }
  };
}
const O_AI_SRC = readFileSync(new URL('../src-js/ai.js', import.meta.url), 'utf-8');
const O_REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---- O-1 --------------------------------------------------------------------
test('O-1: PlanningContext accepts an optional `semantic` array; deep-frozen (CD-5, the 3.16 mirror)', ()=>{
  const records = oSession().getRecords();
  const ctx = createPlanningContext({ objects: {}, semantic: records });
  deepEq(ctx.semantic, records, 'the semantic array passes through the projection verbatim');
  deepFrozen(ctx, 'ctx');
  // a function value hiding inside a semantic entry is still rejected (§13)
  let threw = null;
  try { createPlanningContext({ semantic: [{ status: 'PROPOSED', bad: () => 1 }] }); }
  catch(e){ threw = e; }
  expect(threw && /function value found/.test(threw.message), 'function values inside semantic entries are rejected at construction (§13)');
});

// ---- O-2 --------------------------------------------------------------------
test('O-2: existing PlanningContext callers unchanged — no `semantic` field -> byte-identical behavior (CD-2)', ()=>{
  const ctx = createPlanningContext({ objects: { 'obj-1': { geometry: { width: 10 } } } });
  eq('semantic' in ctx, false, 'no semantic field appears on a semantic-free projection');
  const intent = oIntent();
  const es = createExpectedState(intent, ctx);
  eq(JSON.stringify(es), JSON.stringify(buildExpectedState(intent)),
    'createExpectedState reproduces the pre-3.17 ExpectedState BYTE-IDENTICALLY without a semantic agenda');
  deepEq(Object.keys(es).sort(), ['appearance','constraint','geometry','intentId','spatial','status','structure'],
    'the ExpectedState key set is unchanged (NO semantic section without a semantic agenda)');
});

// ---- O-3 --------------------------------------------------------------------
test('O-3: ExpectedState.semantic.satisfied admits null and boolean — the 3.16 constraint.satisfied mirror (CD-1)', ()=>{
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: null, expectations: [] } }).valid, true, 'satisfied null admitted');
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: true, expectations: [] } }).valid, true, 'satisfied boolean admitted');
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: false, expectations: [] } }).valid, true, 'satisfied false admitted');
  const bad = validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: 'yes', expectations: [] } });
  eq(bad.valid, false, 'a non-boolean satisfied is refused');
  eq(bad.errors.length, 1, 'exactly one shape error');
  eq(bad.errors[0].code, 'INVALID_PARAMETER', 'the shape-error code');
  expect(/semantic\.satisfied/.test(bad.errors[0].message), 'the error names the offending field');
});

// ---- O-4 --------------------------------------------------------------------
test('O-4: ExpectedState.semantic.expectations is an OPTIONAL array (absent -> valid; non-array -> refused)', ()=>{
  eq(validateExpectedState(oBaseExpected()).valid, true, 'the whole semantic section is optional (no semantic -> valid)');
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: null } }).valid, true, 'expectations absent -> valid');
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: null, expectations: [] } }).valid, true, 'expectations empty array -> valid');
  eq(validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: null, expectations: [{ id: 'smr-x', objectId: 'obj', role: 'text', confidence: null, evidence: [], source: 'T20', status: 'PROPOSED' }] } }).valid, true, 'expectations carrying a record -> valid');
  const bad = validateExpectedState({ ...oBaseExpected(), semantic: { satisfied: null, expectations: 'nope' } });
  eq(bad.valid, false, 'a non-array expectations is refused');
  expect(/semantic\.expectations/.test(bad.errors[0].message), 'the error names the offending field');
  const badSection = validateExpectedState({ ...oBaseExpected(), semantic: 'nope' });
  eq(badSection.valid, false, 'a non-object semantic section is refused');
});

// ---- O-5 --------------------------------------------------------------------
test('O-5: the Planner produces a deterministic Plan carrying the accepted semantic expectations (CD-1)', ()=>{
  const session = oSession();
  const ctx = createPlanningContext({ objects: {}, semantic: session.getRecords() });
  const plan = createPlan(oIntent(), ctx);
  eq(plan.deterministic, true, 'the plan is flagged deterministic');
  eq(validatePlanStructure(plan).valid, true, 'validatePlanStructure accepts the semantic-bearing plan');
  const sem = plan.expectedState.semantic;
  expect(sem && typeof sem === 'object' && !Array.isArray(sem), 'plan.expectedState.semantic is present and is a plain object');
  eq(sem.satisfied, null, 'satisfied stays the unevaluated null marker (the Planner never invents a verdict)');
  deepEq(sem.expectations, session.getRecords(), 'expectations deep-equal the accepted records (verbatim, in order)');
  eq(sem.expectations.length, 2, 'the two accepted records entered the desired state');
});

// ---- O-6 --------------------------------------------------------------------
test('O-6: the Planner does NOT mutate the SemanticStore / inference session (zero coupling, CD-6)', ()=>{
  const session = oSession();
  const before = JSON.stringify(session.getRegistry());
  const ctx = createPlanningContext({ objects: {}, semantic: session.getRecords() });
  createPlan(oIntent(), ctx);
  eq(JSON.stringify(session.getRegistry()), before, 'the session registry is byte-identical after planning');
  eq(JSON.stringify(session.getRecords()), JSON.stringify(ctx.semantic), 'the records survive planning unchanged');
  // zero source-level coupling: the Planner never IMPORTS the semantic module
  // (documentation naming the integrated module is not coupling — imports are;
  // the arm header at the end of ai.js documents the B-module by name)
  expect(!/from\s+'\.\/semantic-inference\.js'/.test(O_AI_SRC), 'ai.js has NO static import of semantic-inference.js');
  expect(!/import\s*\(\s*['"]\.\/semantic-inference\.js/.test(O_AI_SRC), 'ai.js has NO dynamic import of semantic-inference.js');
  expect(!/require\s*\(\s*['"]\.\/semantic-inference\.js/.test(O_AI_SRC), 'ai.js has NO require of semantic-inference.js');
});

// ---- O-7 --------------------------------------------------------------------
test('O-7: the Planner does NOT open transactions (CD-6)', ()=>{
  expect(!/from\s+'\.\/transaction\.js'/.test(O_AI_SRC), 'no transaction module import');
  expect(!/createTransaction\s*\(|TransactionExecutor\s*\(|TransactionBuilder\s*\(|new\s+Journal\b/.test(O_AI_SRC), 'no transaction construction of any kind');
  // behavioral: a semantic-bearing plan is pure Plan data — no transaction artifacts
  const ctx = createPlanningContext({ objects: {}, semantic: oSession().getRecords() });
  const plan = createPlan(oIntent(), ctx);
  deepEq(Object.keys(plan).sort(), ['deterministic','expectedState','id','intentId','parentPlanId','steps'],
    'the plan carries EXACTLY the §10 Plan keys — no transaction fields');
});

// ---- O-8 --------------------------------------------------------------------
test('O-8: the Planner does NOT touch geometry/appearance/object stores (the one-substrate contract, CD-6)', ()=>{
  const imports = [...O_AI_SRC.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  deepEq(imports, ['./tools.js'], 'ai.js imports EXACTLY one substrate module: tools.js (ai.js:55)');
  expect(!/from\s+'\.\/stores\.js'|from\s+'\.\/geometry\.js'|from\s+'\.\/appearance/.test(O_AI_SRC), 'no store imports of any kind');
  // behavioral: planning leaves the caller projection (the store stand-in) untouched
  const projection = { objects: { 'obj-o1': { geometry: { width: 5 } } }, semantic: oSession().getRecords() };
  const snapshot = JSON.stringify(projection);
  createPlan(oIntent(), createPlanningContext(projection));
  eq(JSON.stringify(projection), snapshot, 'the caller projection is byte-identical after planning (no store writes)');
});

// ---- O-9 --------------------------------------------------------------------
test('O-9: round-trip T20 -> ingest -> accepted records -> PlanningContext.semantic -> createPlan -> expectedState.semantic.expectations (CD-1/CD-3)', ()=>{
  const session = oSession();
  const accepted = session.getRecords();
  const ctx = createPlanningContext({ objects: {}, semantic: accepted });
  const plan = createPlan(oIntent(), ctx);
  const expectations = plan.expectedState.semantic.expectations;
  deepEq(expectations, accepted, 'expectations deep-equal the accepted records — the full pipeline preserves the contract');
  eq(expectations.length, 2, 'the widget refusal was left behind at the normalization boundary');
  eq(expectations[0].id, accepted[0].id, 'content-derived ids survive the round-trip');
  eq(expectations[1].role, 'heading', 'roles survive the round-trip');
  eq(expectations.every(r => r.source === 'T20' && r.status === 'PROPOSED'), true, 'provenance + status survive the round-trip');
});

// ---- O-10 -------------------------------------------------------------------
test('O-10: two createPlan calls with identical inputs produce byte-identical plans (Invariant 17); the agenda participates in plan identity', ()=>{
  const build = () => {
    const session = createInferenceSession();
    session.ingest(makeEnvelope([makeProposal({ objectId: 'obj-o1' }), makeProposal({ objectId: 'obj-o2', proposedRole: 'heading' })]));
    return createPlan(oIntent(), createPlanningContext({ objects: {}, semantic: session.getRecords() }));
  };
  const a = build(), b = build();
  eq(JSON.stringify(a), JSON.stringify(b), 'identical inputs -> byte-identical plans (semantic section included)');
  // the semantic agenda is part of plan identity: a different agenda moves the plan id
  const solo = createInferenceSession();
  solo.ingest(makeEnvelope([makeProposal({ objectId: 'obj-o1' })]));
  const other = createPlan(oIntent(), createPlanningContext({ objects: {}, semantic: solo.getRecords() }));
  expect(a.id !== other.id, 'a different semantic agenda -> a different plan id (content-derived identity)');
});

// ---- O-11 -------------------------------------------------------------------
test('O-11: refusal records do NOT enter expectedState.semantic.expectations — even when the caller hands over the whole registry (CD-3)', ()=>{
  const session = oSession();
  const everything = [...session.getRecords(), ...session.getRefusals()];
  eq(everything.some(r => r.status === 'REJECTED'), true, 'fixture sanity: the handed-over array contains refusals');
  const ctx = createPlanningContext({ objects: {}, semantic: everything });
  const plan = createPlan(oIntent(), ctx);
  const expectations = plan.expectedState.semantic.expectations;
  eq(expectations.some(r => r.status !== 'PROPOSED'), false, 'only PROPOSED records are promoted into desired state');
  eq(expectations.length, session.getRecords().length, 'every refusal was filtered out');
  eq(expectations.some(r => r.reason !== undefined), false, 'no refusal fields (reason) leak into expectations');
  // malformed entries cannot become expectations either
  const garbage = createPlanningContext({ objects: {}, semantic: [...session.getRecords(), 7, 'nope', null] });
  const gPlan = createPlan(oIntent(), garbage);
  eq(gPlan.expectedState.semantic.expectations.length, session.getRecords().length, 'non-record garbage never becomes an expectation');
});

// ---- O-12 -------------------------------------------------------------------
test('O-12: backward compat — the existing ai.test.mjs suite (131 tests) remains GREEN', ()=>{
  const out = execFileSync(process.execPath, ['tests/ai.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  const line = out.split('\n').filter(l => l.startsWith('Tests:')).pop();
  eq(line, 'Tests: 131 total, 131 passed, 0 failed', `ai.test.mjs stays GREEN: ${line}`);
});

// ============================================================================
// CATEGORY P — EVALUATION INTEGRATION (PHASE 3.17, Checkpoint D; spec §57)
// ============================================================================
// The evaluation face of 3.17: semantic expectation -> current document ->
// evaluation result. The arm mirrors the 3.16 constraint-compliance arm
// (evaluation.js:1004-1026/:1030-1174): it rides INSIDE evaluate(), is pure/
// read-only/deterministic, self-reports everything unmeasurable, and adds NO
// exports (the 12-export surface stays pinned, evaluation-critic:1643).
// The ACTUAL role comes ONLY from the injected provider (DD-1).
// ============================================================================

// --- Category P fixtures ------------------------------------------------------
function pExpected(expectations, withSemanticSection){
  const expected = {
    intentId: 'semantic-evaluation',
    status: 'requested',
    geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
    spatial: { aligned: null, centered: null, bbox: null },
    appearance: { fill: null, stroke: null, opacity: null },
    constraint: { satisfied: null },
    structure: { grouped: null }
  };
  if (withSemanticSection !== false) expected.semantic = { satisfied: null, expectations };
  return expected;
}
function pDocContext(){
  // minimal duck-typed read surface (evaluation.js:166-186): every object
  // "exists" with no geometry/appearance/hierarchy — the semantic arm never
  // touches these (the role provider is the only actual-role source, DD-1).
  return {
    objectStore: { get: () => ({ geometryRef: null, appearanceRef: null }) },
    geometryStore: { get: () => undefined },
    appearanceStore: { get: () => undefined },
    sceneGraph: { findNodeByObjectId: () => undefined, findNode: () => undefined, getWorldTransform: () => null }
  };
}
function pEvalContext(getActualRole){
  const ctx = { targets: [{ objectId: 'obj-p1', targetRef: '$doc:obj-p1' }] };
  if (getActualRole !== undefined) ctx.getActualRole = getActualRole;
  return ctx;
}
function pExpectation(objectId, role, confidence){
  const rec = { objectId, role };
  if (confidence !== undefined) rec.confidence = confidence;
  return rec;
}
const P_EVAL_SRC = readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8');
function pDeepFreeze(value){
  if (value !== null && typeof value === 'object'){
    for (const k of Object.keys(value)) pDeepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

// ---- P-1 --------------------------------------------------------------------
test('P-1: metadata.semanticResults present when expected.semantic.expectations exists (total shape, agenda order, DD-5/DD-6)', ()=>{
  const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
  const result = evaluate(expected, pDocContext(), pEvalContext(() => 'text'));
  const results = result.metadata.semanticResults;
  expect(Array.isArray(results), 'semanticResults is an array on the metadata sidecar');
  eq(results.length, 1, 'one expectation -> one result');
  deepEq(Object.keys(results[0]).sort(), ['confidence','objectId','reason','role','status'],
    'the result carries EXACTLY the five pinned fields (total null-normalized shape, DD-5)');
  eq(result.evaluated.includes('semantic'), true, "'semantic' enters the evaluated category list (DD-6)");
  eq(validateEvaluationResult(result).valid, true, 'the whole result stays a valid §12 EvaluationResult');
});

// ---- P-2 --------------------------------------------------------------------
test('P-2: SATISFIED case — expected role === provided actual role (DD-1/DD-2)', ()=>{
  const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
  const result = evaluate(expected, pDocContext(), pEvalContext(() => 'text'));
  const r = result.metadata.semanticResults[0];
  eq(r.status, 'SATISFIED', 'matching roles -> SATISFIED');
  eq(r.role, 'text', 'the expected role is carried');
  eq(r.confidence, 0.6, 'confidence carried verbatim (BD-3 continuity)');
  eq(r.reason, null, 'no reason on the measured pair');
  eq(result.status, 'PASS', 'a satisfied agenda produces no deviation -> PASS');
  eq(result.deviations.length, 0, 'zero deviations');
});

// ---- P-3 --------------------------------------------------------------------
test('P-3: VIOLATED case — expected !== actual -> one category:\'semantic\' deviation (DD-4) + result DEVIATION', ()=>{
  const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
  const result = evaluate(expected, pDocContext(), pEvalContext(() => 'heading'));
  const r = result.metadata.semanticResults[0];
  eq(r.status, 'VIOLATED', 'mismatched roles -> VIOLATED');
  eq(result.status, 'DEVIATION', 'the result status flips to DEVIATION (gate 5)');
  eq(result.deviations.length, 1, 'exactly one deviation');
  const d = result.deviations[0];
  eq(d.category, 'semantic', "the deviation rides the RESERVED 'semantic' category (evaluation.js:146, dormant since 3.14)");
  eq(d.property, 'role', "the property names the compared quantity: 'role'");
  eq(d.expected, 'text', 'expected side of the deviation');
  eq(d.actual, 'heading', 'actual side of the deviation');
  eq(d.delta, null, 'non-numeric comparison -> delta null (the structure-arm precedent)');
  eq(d.tolerance, null, 'no tolerance on a role comparison');
  eq(d.severity, 'error', 'severity error');
  eq(d.objectId, 'obj-p1', 'the expectation target');
  eq(d.targetRef, '$doc:obj-p1', "targetRef uses the '$doc:' convention (the constraint-arm mirror)");
  expect(/^dev-[0-9a-f]{8}$/.test(d.id), 'content-derived §13 deviation id');
});

// ---- P-4 --------------------------------------------------------------------
test('P-4: UNEVALUABLE case — no role provider -> NO_ROLE_PROVIDER, listed in unevaluatedExpectations (DD-7); non-function provider refused (DD-8)', ()=>{
  const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
  const result = evaluate(expected, pDocContext(), pEvalContext()); // no getActualRole
  const r = result.metadata.semanticResults[0];
  eq(r.status, 'UNEVALUABLE', 'no provider -> UNEVALUABLE (never guessed, §19)');
  eq(r.reason, 'NO_ROLE_PROVIDER', 'the deterministic reason');
  eq(result.status, 'PASS', 'an unmeasurable expectation invents no deviation');
  eq(result.deviations.length, 0, 'zero deviations');
  eq(result.metadata.unevaluatedExpectations.includes('semantic.expectations[0]'), true,
    "the per-expectation path entry replaces the blanket 'semantic' marker (DD-7)");
  eq(result.metadata.unevaluatedExpectations.includes('semantic'), false, 'the blanket marker is gone once the arm ran');
  // a present-but-non-function provider is a loud contract refusal (DD-8)
  let threw = null;
  try { evaluate(expected, pDocContext(), { ...pEvalContext(), getActualRole: 'text' }); }
  catch(e){ threw = e; }
  expect(threw && threw.code === 'INVALID_EVALUATION_CONTEXT', 'non-function getActualRole -> INVALID_EVALUATION_CONTEXT');
});

// ---- P-5 --------------------------------------------------------------------
test('P-5: UNSUPPORTED case — role outside T20\'s 7-role emission set, both sides (DD-2/DD-3); the provider is never trusted for it', ()=>{
  // expected side: 'widget' is not T20-emittable — the arm cannot even state
  // the expectation honestly, and the provider is never consulted
  let calls = 0;
  const expectedSide = evaluate(pExpected([pExpectation('obj-p1', 'widget', 0.6)]), pDocContext(), pEvalContext(() => { calls++; return 'text'; }));
  const r1 = expectedSide.metadata.semanticResults[0];
  eq(r1.status, 'UNSUPPORTED', 'out-of-vocabulary EXPECTED role -> UNSUPPORTED');
  eq(r1.reason, 'EXPECTED_ROLE_UNSUPPORTED', 'the expected-side reason');
  eq(calls, 0, 'the provider is never invoked for an unsupported expectation');
  eq(expectedSide.deviations.length, 0, 'no invented deviation');
  // actual side: the provider answers with an out-of-vocabulary role — the
  // arm refuses to treat it as an observation (never trusts, never guesses)
  const actualSide = evaluate(pExpected([pExpectation('obj-p1', 'text', 0.6)]), pDocContext(), pEvalContext(() => 'widget'));
  const r2 = actualSide.metadata.semanticResults[0];
  eq(r2.status, 'UNSUPPORTED', 'out-of-vocabulary ACTUAL role -> UNSUPPORTED');
  eq(r2.reason, 'ACTUAL_ROLE_UNSUPPORTED', 'the actual-side reason');
  eq(actualSide.deviations.length, 0, 'a mismatch against an unassertable observation is NOT a violation');
  eq(actualSide.metadata.unevaluatedExpectations.includes('semantic.expectations[0]'), true, 'self-reported as unevaluated');
});

// ---- P-6 --------------------------------------------------------------------
test('P-6: INSUFFICIENT_EVIDENCE case — provider returns null -> PROVIDER_RETURNED_NO_ROLE, no invented deviation (DD-2)', ()=>{
  for(const nothing of [null, undefined]){
    const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
    const result = evaluate(expected, pDocContext(), pEvalContext(() => nothing));
    const r = result.metadata.semanticResults[0];
    eq(r.status, 'INSUFFICIENT_EVIDENCE', `provider returning ${String(nothing)} -> INSUFFICIENT_EVIDENCE`);
    eq(r.reason, 'PROVIDER_RETURNED_NO_ROLE', 'the deterministic reason');
    eq(result.deviations.length, 0, 'no invented deviation');
    eq(result.metadata.unevaluatedExpectations.includes('semantic.expectations[0]'), true, 'self-reported as unevaluated');
  }
});

// ---- P-7 --------------------------------------------------------------------
test('P-7: multi-expectation — 3 expectations -> 3 semanticResults, agenda order preserved (DD-5)', ()=>{
  const expected = pExpected([
    pExpectation('obj-p1', 'text', 0.6),
    pExpectation('obj-p1', 'heading', 0.7),
    pExpectation('obj-p1', 'icon', 0.4),
  ]);
  // the provider keys on call order (the arm calls in agenda order, DD-1):
  // call 1 -> 'text' (satisfies), call 2 -> 'container' (violates), call 3 -> null (insufficient)
  const seen = [];
  const result = evaluate(expected, pDocContext(), pEvalContext(() => {
    seen.push(1);
    return ['text', 'container', null][seen.length - 1];
  }));
  const results = result.metadata.semanticResults;
  eq(results.length, 3, 'three expectations -> three results');
  deepEq(results.map(r => r.role), ['text', 'heading', 'icon'], 'agenda order preserved verbatim');
  deepEq(results.map(r => r.status), ['SATISFIED', 'VIOLATED', 'INSUFFICIENT_EVIDENCE'], 'mixed verdicts in order');
  eq(result.deviations.length, 1, 'exactly one VIOLATED deviation');
  eq(result.deviations[0].category, 'semantic', 'the violation is the semantic one');
  eq(result.status, 'DEVIATION', 'result status');
});

// ---- P-8 --------------------------------------------------------------------
test('P-8: no false verification — an unmeasurable expectation can never become SATISFIED (§53 honesty)', ()=>{
  const scenarios = [
    { name: 'no provider', ctx: pEvalContext(), expectedRole: 'text' },
    { name: 'provider answers null', ctx: pEvalContext(() => null), expectedRole: 'text' },
    { name: 'unsupported expected role', ctx: pEvalContext(() => 'text'), expectedRole: 'widget' },
    { name: 'unsupported actual role', ctx: pEvalContext(() => 'widget'), expectedRole: 'text' },
  ];
  for(const s of scenarios){
    const result = evaluate(pExpected([pExpectation('obj-p1', s.expectedRole, 0.6)]), pDocContext(), s.ctx);
    const r = result.metadata.semanticResults[0];
    expect(r.status !== 'SATISFIED' && r.status !== 'VIOLATED', `${s.name}: status is ${r.status}, not a measured verdict`);
    eq(result.deviations.length, 0, `${s.name}: no invented deviation`);
    eq(result.status, 'PASS', `${s.name}: no false PASS-flip — PASS means 'nothing measurable failed'`);
    eq(result.metadata.unevaluatedExpectations.includes('semantic.expectations[0]'), true, `${s.name}: honestly self-reported`);
  }
});

// ---- P-9 --------------------------------------------------------------------
test('P-9: determinism — identical inputs -> identical semanticResults + deviation ids; provider invoked exactly once per expectation (DD-1)', ()=>{
  const expected = pExpected([
    pExpectation('obj-p1', 'text', 0.6),
    pExpectation('obj-p1', 'heading', 0.7),
  ]);
  const run = () => {
    const calls = [];
    const result = evaluate(expected, pDocContext(), pEvalContext((objectId) => {
      calls.push(objectId);
      return calls.length === 1 ? 'text' : 'container';
    }));
    return { json: JSON.stringify({ results: result.metadata.semanticResults, deviations: result.deviations }), calls };
  };
  const a = run(), b = run();
  eq(a.json, b.json, 'byte-identical results + deviations across identical runs (§22)');
  deepEq(a.calls, ['obj-p1', 'obj-p1'], 'the provider is invoked exactly once per expectation, in agenda order');
  eq(a.calls.length, 2, 'two expectations -> exactly two provider calls');
});

// ---- P-10 -------------------------------------------------------------------
test('P-10: backward compat — evaluation-critic 120/120 + constraint-inference 107/107 (the 14 J-tests inside) remain GREEN', ()=>{
  const out1 = execFileSync(process.execPath, ['tests/evaluation-critic.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out1.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 120 total, 120 passed, 0 failed', 'evaluation-critic suite GREEN');
  const out2 = execFileSync(process.execPath, ['tests/constraint-inference.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out2.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 107 total, 107 passed, 0 failed', 'constraint-inference suite (incl. 14 J-tests) GREEN');
});

// ---- P-11 -------------------------------------------------------------------
test('P-11: no semantic.js / semantic-inference.js import in evaluation.js (static scan); the 12-export surface gains nothing', ()=>{
  expect(!/from\s+'\.\/semantic/.test(P_EVAL_SRC), "no import from any './semantic*' module");
  expect(!/import\s*\(\s*['"]\.\/semantic/.test(P_EVAL_SRC), 'no dynamic import of any semantic module');
  expect(!/require\s*\(\s*['"]\.\/semantic/.test(P_EVAL_SRC), 'no require of any semantic module');
  const imports = [...P_EVAL_SRC.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  deepEq(imports, ['./geometry.js', './bbox.js'], 'evaluation.js imports stay exactly the two public pure pieces (evaluation.js:48-49)');
  deepEq(Object.keys(EvaluationNS).sort(), ['DEVIATION_CATEGORIES','DEVIATION_SEVERITIES','EVALUATION_TOLERANCES','EvaluationError','EvaluationErrorCodes','buildActualState','createDeviation','createEvaluationResult','evaluate','validateActualState','validateDeviation','validateEvaluationResult'],
    'the 12-export A/B-era surface is unchanged — the arm is internal (evaluation-critic:1643 pin)');
});

// ---- P-12 -------------------------------------------------------------------
test('P-12: evaluation.js does NOT mutate semantic state, the agenda, or any store (frozen fixtures survive evaluate byte-identically)', ()=>{
  const expected = pExpected([pExpectation('obj-p1', 'text', 0.6)]);
  pDeepFreeze(expected);                      // frozen agenda + frozen section
  const docCtx = pDocContext();
  pDeepFreeze(docCtx);                        // frozen read surface (ESM strict mode: any write throws)
  const providerCalls = [];
  const evalCtx = pEvalContext((objectId) => { providerCalls.push(objectId); return 'text'; });
  pDeepFreeze(evalCtx);
  const before = JSON.stringify({ expected, docCtx, evalCtx });
  const result = evaluate(expected, docCtx, evalCtx);
  eq(JSON.stringify({ expected, docCtx, evalCtx }), before, 'all frozen fixtures byte-identical after evaluation');
  eq(validateEvaluationResult(result).valid, true, 'the result is a valid §12 record');
});

// ---- P-13 -------------------------------------------------------------------
test('P-13: semanticResults deep-frozen and never aliased to the input agenda (the §12 frozen-result contract)', ()=>{
  const agenda = [pExpectation('obj-p1', 'text', 0.6)];
  const result = evaluate(pExpected(agenda), pDocContext(), pEvalContext(() => 'text'));
  deepFrozen(result.metadata.semanticResults, 'semanticResults');
  expect(result.metadata.semanticResults[0] !== agenda[0], 'result records are arm-built copies, not aliases of the input expectations');
  expect(result.metadata.semanticResults !== agenda, 'the results array is not the agenda array');
});

// ---- P-14 -------------------------------------------------------------------
test('P-14: role provider optional — omission (and provider-without-agenda) preserves existing evaluate() behavior; the dormant blanket marker stays', ()=>{
  // (a) NO semantic section at all: zero semantic traces on the result
  const plain = evaluate(pExpected(undefined, false), pDocContext(), pEvalContext(() => 'text'));
  eq('semanticResults' in plain.metadata, false, 'no semanticResults key without a semantic section');
  eq(plain.evaluated.includes('semantic'), false, "no 'semantic' in evaluated");
  eq(plain.metadata.unevaluatedExpectations.includes('semantic'), false, "no 'semantic' unevaluated marker without a semantic section");
  eq(plain.status, 'PASS', 'the plain evaluation stays PASS');
  // (b) semantic section WITHOUT an evaluable expectations array: the blanket
  //     'semantic' marker is preserved (the non-evaluable form, DD-7) — and
  //     no arm runs
  let calls = 0;
  const dormant = evaluate(
    { ...pExpected(undefined, false), semantic: { satisfied: true } },
    pDocContext(),
    pEvalContext(() => { calls++; return 'text'; })
  );
  eq('semanticResults' in dormant.metadata, false, 'no arm without an expectations array');
  eq(dormant.metadata.unevaluatedExpectations.includes('semantic'), true, "the blanket 'semantic' marker stays for the non-evaluable form");
  eq(dormant.evaluated.includes('semantic'), false, "'semantic' not in evaluated for the non-evaluable form");
  eq(calls, 0, 'the provider is never invoked without an agenda');
});

// ============================================================================
// CATEGORY Q — CRITIC INTEGRATION (PHASE 3.17, Checkpoint E; spec §58)
// ============================================================================
// The critic face of 3.17: semantic deviation -> Critic -> (diagnostic output).
// The critic's five §58 duties are honored by the honest boundary pinned in
// EE-1..EE-7: semantic deviations are SURFACED (the D-1 sidecar + the verbatim
// agenda) and NEVER patched (no proposal, no invented confidence, no faked
// capability request). The fixtures reuse the Category P evaluation surface so
// the critic consumes REAL D-1 deviations and sidecars, not synthetic shapes.
// ============================================================================

// --- Category Q fixtures ------------------------------------------------------
const Q_CRITIC_SRC = readFileSync(new URL('../src-js/critic.js', import.meta.url), 'utf-8');
function qDocContext(width){
  // a one-object doc whose rect geometry carries the given width (the drift
  // source for a REAL geometry deviation beside the semantic one)
  return {
    objectStore: { get: () => ({ geometryRef: 'geom-1', appearanceRef: null }) },
    geometryStore: { get: (ref) => ref === 'geom-1' ? { type: 'rect', params: { x: 0, y: 0, width, height: 80 } } : undefined },
    appearanceStore: { get: () => undefined },
    sceneGraph: { findNodeByObjectId: () => undefined, findNode: () => undefined, getWorldTransform: () => null }
  };
}
function qExpected(geometryWidth, expectations){
  // the P expected-state builder + a concrete geometry desired state, so the
  // mixed scenario carries a restorable geometry deviation AND the semantic
  // agenda in one §12 record
  const expected = pExpected(expectations);
  expected.geometry.width = geometryWidth;
  expected.geometry.height = 80;
  expected.geometry.rx = 0;
  expected.geometry.ry = 0;
  expected.geometry.area = geometryWidth * 80;
  expected.geometry.symmetric = true;
  return expected;
}
function qRealRecord(objectId, role){
  // a REAL Checkpoint-B normalized record (source 'T20', evidence, confidence)
  // — the evidence/provenance the critic must preserve (Q-12). Only
  // in-vocabulary roles can come through the session (B refuses others by
  // design, BD-1) — out-of-vocabulary expectations are hand-built below.
  const session = createInferenceSession();
  session.ingest(makeEnvelope([makeProposal({ objectId, proposedRole: role, confidence: 0.6 })]));
  return session.getRecords()[0];
}
function qHandExpectation(objectId, role){
  // a hand-built expectation for roles the B session correctly refuses
  return { objectId, role, confidence: 0.6 };
}
// the mixed §12 record: geometry drift (190 vs 100) + one VIOLATED semantic role
function qMixedResult(){
  const agenda = [qRealRecord('obj-p1', 'text')];
  return evaluate(qExpected(100, agenda), qDocContext(190), pEvalContext(() => 'heading'));
}

// ---- Q-1 --------------------------------------------------------------------
test('Q-1: proposeCorrections accepts an EvaluationResult carrying semantic deviations; non-semantic rules keep working in the same pass (EE-1)', ()=>{
  const result = qMixedResult();
  eq(result.deviations.some(d => d.category === 'semantic'), true, 'fixture sanity: the record carries a semantic deviation');
  const proposals = proposeCorrections(result);
  expect(Array.isArray(proposals) && Object.isFrozen(proposals), 'a frozen proposals array comes back');
  eq(proposals.length, 1, 'the geometry deviation still yields its (deduped) proposal in the same pass');
  eq(proposals[0].intent.type, 'create', 'the geometry proposal is the create-rebuild capability');
});

// ---- Q-2 --------------------------------------------------------------------
test('Q-2: a VIOLATED semantic deviation produces NO proposal (the §28 decline, EE-1); the diagnostic signal rides the composed output (EE-2); the decline is routed EXPLICITLY (EE-3)', ()=>{
  const result = evaluate(pExpected([qRealRecord('obj-p1', 'text')]), pDocContext(), pEvalContext(() => 'heading'));
  const semantic = result.deviations.find(d => d.category === 'semantic');
  expect(semantic && semantic.status === undefined, 'fixture sanity: one category-semantic deviation record');
  const proposals = proposeCorrections(result);
  eq(proposals.length, 0, 'the semantic deviation yields NO proposal (surfaced, never patched — the 3.16 size/distance precedent)');
  // the diagnostic signal rides the COMPOSED output (the D-1 sidecar, unchanged)
  const composed = evaluateAndCritique(pExpected([qRealRecord('obj-p1', 'text')]), pDocContext(), pEvalContext(() => 'heading'));
  const signal = composed.evaluationResult.metadata.semanticResults[0];
  eq(signal.status, 'VIOLATED', 'the composed output carries the VIOLATED signal on metadata.semanticResults');
  eq(composed.evaluationResult.deviations.some(d => d.category === 'semantic'), true, 'the deviation itself stays on the result (evidence preserved)');
  eq(composed.proposals.length, 0, 'and the composed proposals stay empty for semantics');
  // the decline is routed EXPLICITLY at the dispatch (not an accidental fall-through)
  expect(Q_CRITIC_SRC.includes("category === 'semantic'"), "the category === 'semantic' discriminator exists in critic.js (the explicit routing, EE-3)");
});

// ---- Q-3 --------------------------------------------------------------------
test('Q-3: SATISFIED semantic results produce NO deviation and NO proposal', ()=>{
  const result = evaluate(pExpected([qRealRecord('obj-p1', 'text')]), pDocContext(), pEvalContext(() => 'text'));
  eq(result.status, 'PASS', 'a satisfied agenda is a PASS result');
  eq(result.deviations.length, 0, 'zero deviations');
  eq(result.metadata.semanticResults[0].status, 'SATISFIED', 'the signal says SATISFIED');
  eq(proposeCorrections(result).length, 0, 'and the critic proposes nothing');
});

// ---- Q-4 --------------------------------------------------------------------
test('Q-4: UNEVALUABLE / UNSUPPORTED / INSUFFICIENT_EVIDENCE produce NO deviation and NO proposal; the honest signal stays on the sidecar (EE-2)', ()=>{
  const scenarios = [
    { name: 'no provider', ctx: pEvalContext(), rec: qRealRecord('obj-p1', 'text'), status: 'UNEVALUABLE', reason: 'NO_ROLE_PROVIDER' },
    { name: 'unsupported expected role', ctx: pEvalContext(() => 'text'), rec: qHandExpectation('obj-p1', 'widget'), status: 'UNSUPPORTED', reason: 'EXPECTED_ROLE_UNSUPPORTED' },
    { name: 'unsupported actual role', ctx: pEvalContext(() => 'widget'), rec: qRealRecord('obj-p1', 'text'), status: 'UNSUPPORTED', reason: 'ACTUAL_ROLE_UNSUPPORTED' },
    { name: 'provider answers null', ctx: pEvalContext(() => null), rec: qRealRecord('obj-p1', 'text'), status: 'INSUFFICIENT_EVIDENCE', reason: 'PROVIDER_RETURNED_NO_ROLE' },
  ];
  for(const s of scenarios){
    const result = evaluate(pExpected([s.rec]), pDocContext(), s.ctx);
    eq(result.deviations.length, 0, `${s.name}: no deviation exists (D-1: unmeasurable is never invented)`);
    eq(proposeCorrections(result).length, 0, `${s.name}: the critic proposes nothing`);
    const signal = result.metadata.semanticResults[0];
    eq(signal.status, s.status, `${s.name}: the sidecar signal carries the honest status`);
    eq(signal.reason, s.reason, `${s.name}: the sidecar signal carries the deterministic reason`);
  }
});

// ---- Q-5 --------------------------------------------------------------------
test('Q-5: every emitted proposal uses the existing 7-key contract; none references a semantic deviationId (EE-1)', ()=>{
  const result = qMixedResult();
  const semanticId = result.deviations.find(d => d.category === 'semantic').id;
  const proposals = proposeCorrections(result);
  for(const p of proposals){
    eq(validateCorrectionProposal(p).valid, true, 'the proposal satisfies the §25 validator (7 keys + content-derived id)');
    eq(p.deviationId === semanticId, false, 'no proposal references the semantic deviation');
  }
  deepEq(Object.keys(proposals[0]).sort(), ['confidence','deviationId','id','intent','priority','reason','targetRef'],
    'the 7-key CorrectionProposal contract is untouched');
});

// ---- Q-6 --------------------------------------------------------------------
test('Q-6: no new exports in critic.js — the 6-export C/D-era surface gains nothing (EE-7)', ()=>{
  deepEq(Object.keys(CriticNS).sort(),
    ['CriticError','CriticErrorCodes','createCorrectionProposal','evaluateAndCritique','proposeCorrections','validateCorrectionProposal'],
    'exactly the 6 C/D-era exports, nothing new (the evaluation-critic:1644 pin, re-asserted here)');
});

// ---- Q-7 --------------------------------------------------------------------
test('Q-7: critic.js does NOT mutate any store or the consumed result (frozen fixtures survive byte-identically, EE-5)', ()=>{
  const result = qMixedResult();
  pDeepFreeze(result);                       // frozen §12 record (any write throws in ESM strict mode)
  const before = JSON.stringify(result);
  proposeCorrections(result);
  eq(JSON.stringify(result), before, 'the consumed EvaluationResult is byte-identical after the critique');
  // composed flow over frozen fixtures: the doc context and evaluation context survive too
  const expected = qExpected(100, [qRealRecord('obj-p1', 'text')]);
  const docCtx = pDeepFreeze(qDocContext(190));
  const evalCtx = pDeepFreeze(pEvalContext(() => 'heading'));
  const snap = JSON.stringify({ expected, docCtx, evalCtx });
  evaluateAndCritique(expected, docCtx, evalCtx);
  eq(JSON.stringify({ expected, docCtx, evalCtx }), snap, 'the composed flow leaves every fixture byte-identical');
});

// ---- Q-8 --------------------------------------------------------------------
test('Q-8: critic.js does NOT open transactions (static scan + behavioral, EE-6)', ()=>{
  expect(!Q_CRITIC_SRC.includes('TransactionExecutor'), 'no TransactionExecutor reference');
  expect(!Q_CRITIC_SRC.includes('transactionManager'), 'no transaction manager reference');
  expect(!Q_CRITIC_SRC.includes('.commit(') && !Q_CRITIC_SRC.includes('.execute('), 'no commit/execute call surface');
  // behavioral: proposals are inert plan-referencing data — no transaction fields anywhere
  const proposals = proposeCorrections(qMixedResult());
  for(const p of proposals){
    expect(!('transactionId' in p) && !('commands' in p), 'the proposal carries no transaction artifact');
  }
});

// ---- Q-9 --------------------------------------------------------------------
test('Q-9: critic.js does NOT import correction.js or semantic.js (static scan, EE-7)', ()=>{
  const imports = [...Q_CRITIC_SRC.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  deepEq(imports, ['./evaluation.js'], 'exactly one import: the evaluation contract validator (the C-3/F-3 pin)');
  expect(!Q_CRITIC_SRC.includes("from './correction"), 'no correction.js import');
  expect(!Q_CRITIC_SRC.includes("from './semantic"), 'no semantic.js / semantic-inference.js import');
  expect(!/require\s*\(/.test(Q_CRITIC_SRC) && !/import\s*\(/.test(Q_CRITIC_SRC), 'no dynamic module-escape call');
});

// ---- Q-10 -------------------------------------------------------------------
test('Q-10: determinism — two proposeCorrections calls with identical inputs produce identical output (§29/§30)', ()=>{
  const run = () => JSON.stringify(proposeCorrections(qMixedResult()));
  eq(run(), run(), 'byte-identical proposals across identical runs');
});

// ---- Q-11 -------------------------------------------------------------------
test('Q-11: backward compat — evaluation-critic 120/120 + constraint-inference 107/107 (the 14 J-tests + 14 K-tests inside) remain GREEN', ()=>{
  const out1 = execFileSync(process.execPath, ['tests/evaluation-critic.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out1.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 120 total, 120 passed, 0 failed', 'evaluation-critic suite GREEN');
  const out2 = execFileSync(process.execPath, ['tests/constraint-inference.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out2.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 107 total, 107 passed, 0 failed', 'constraint-inference suite (incl. 14 J-tests + 14 K-tests) GREEN');
});

// ---- Q-12 -------------------------------------------------------------------
test('Q-12: semantic diagnosis preserves evidence + provenance (source T20, evidence, confidence) where available; no invented confidence (EE-4/EE-5)', ()=>{
  const result = qMixedResult();
  const agenda = result.expected.semantic.expectations;
  const signal = result.metadata.semanticResults[0];
  const semantic = result.deviations.find(d => d.category === 'semantic');
  // the verbatim B-record evidence on the agenda survives the critique untouched
  proposeCorrections(result);
  eq(agenda[0].source, 'T20', "provenance preserved: the agenda record still carries source 'T20'");
  deepEq(agenda[0].evidence, [{ signal: 'geometry_type', description: 'text geometry', weight: 0.1 }], 'evidence rows preserved verbatim');
  eq(agenda[0].confidence, 0.6, 'the recorded confidence preserved verbatim');
  eq(agenda[0].status, 'PROPOSED', 'the record status untouched');
  // the sidecar confidence is the record's verbatim confidence (never invented)
  eq(signal.confidence, 0.6, 'the sidecar carries the verbatim confidence');
  // the deviation's own evidence fields are intact
  eq(semantic.expected, 'text', 'the deviation expected side intact');
  eq(semantic.actual, 'heading', 'the deviation actual side intact');
  expect(/expected role 'text', observed role 'heading'/.test(semantic.message), 'the deterministic deviation message intact');
  // no invented confidence: no proposal exists for the semantic deviation, and
  // the geometry proposal keeps the rule-derived constant 1 for ITS OWN
  // restorable deviation (the confidence policy is unchanged, not extended)
  const proposals = proposeCorrections(result);
  eq(proposals.length, 1, 'only the restorable geometry deviation is proposed');
  eq(proposals[0].confidence, 1, 'the rule-derived constant applies only to the restorable deviation (never to semantics)');
});

// ============================================================================
// CATEGORY R — CORRECTION INTEGRATION (PHASE 3.17, Checkpoint F; spec §59)
// ============================================================================
// The correction face of 3.17: semantic deviation -> Correction Loop ->
// honest NO_CAPABILITY termination. OUTCOME (1) is declared (FD-1): the
// SEMANTIC_ERROR root cause carries ZERO capability recipes (A-9), so the
// spec-predicted end is NO_CAPABILITY — proven through the EXISTING loop,
// with NO production change. The fixtures reuse the Category P evaluation
// surface so the loop consumes a REAL B->D diagnostic (the violated deviation
// + the D-1 sidecar), not synthetic shapes; the deviation->target projection
// is the caller's orchestrator duty and lives TEST-side (FD-2).
// ============================================================================

// --- Category R fixtures ------------------------------------------------------
const R_CORRECTION_SRC = readFileSync(new URL('../src-js/correction.js', import.meta.url), 'utf-8');

function rRecord(objectId, role, confidence){
  // a REAL Checkpoint-B normalized record — the provenance origin of the agenda
  const session = createInferenceSession();
  session.ingest(makeEnvelope([makeProposal({ objectId, proposedRole: role, confidence })]));
  return session.getRecords()[0];
}
function rExpected(expectations){
  // the P expected-state builder + the semantic agenda (all other sections null)
  const expected = pExpected(expectations);
  expected.semantic = { satisfied: null, expectations };
  return expected;
}
function rDocContext(){
  // the P read-surface, instrumented: the read counters ARE the R-7 proof
  const reads = { objectStore: 0, geometryStore: 0, appearanceStore: 0, sceneGraph: 0 };
  const doc = {
    objectStore: { get: () => { reads.objectStore++; return { geometryRef: null, appearanceRef: null }; } },
    geometryStore: { get: () => { reads.geometryStore++; return undefined; } },
    appearanceStore: { get: () => { reads.appearanceStore++; return undefined; } },
    sceneGraph: { findNodeByObjectId: () => { reads.sceneGraph++; return undefined; }, findNode: () => { reads.sceneGraph++; return undefined; }, getWorldTransform: () => { reads.sceneGraph++; return null; } }
  };
  return { doc, reads };
}
function rEvalContext(getActualRole){
  const ctx = { targets: [{ objectId: 'obj-p1', targetRef: '$doc:obj-p1' }] };
  if (getActualRole !== undefined) ctx.getActualRole = getActualRole;
  return ctx;
}
function rViolatedEvaluation(){
  // the REAL B->D chain: T20 proposal -> normalized record -> agenda -> evaluate
  // -> one category:'semantic' deviation (VIOLATED) + the D-1 sidecar
  const record = rRecord('obj-p1', 'text', 0.8);
  const { doc, reads } = rDocContext();
  const result = evaluate(rExpected([record]), doc, rEvalContext(() => 'heading'));
  return { record, result, reads };
}
function rSemanticTarget(result){
  // the FD-2 caller projection: the §7 CorrectionTarget from the D-1 deviation,
  // evidence = the D-1 sidecar record verbatim (the R-9 channel)
  const deviation = result.deviations.find(d => d.category === 'semantic');
  const signal = result.metadata.semanticResults.find(s => s.status === 'VIOLATED');
  return createCorrectionTarget({
    category: 'SEMANTIC',
    objectIds: [deviation.objectId],
    metric: deviation.property,
    observedValue: result.deviations.filter(d => d.category === 'semantic').length,
    severity: 'HIGH',
    confidence: signal.confidence,
    evidence: [signal]
  });
}
function rCountingSubstrate(){
  // FD-6: counting stubs — the honest path must never touch them
  const calls = { registryHas: 0, registryGet: 0, registryValidate: 0, txExecute: 0, txBegin: 0, txAddCommand: 0, txBuild: 0 };
  const substrate = {
    registry: {
      has: () => { calls.registryHas++; return false; },
      get: () => { calls.registryGet++; return undefined; },
      validate: () => { calls.registryValidate++; return { valid: true }; }
    },
    transactionManager: { execute: () => { calls.txExecute++; return { status: 'FAILED' }; } },
    transactionBuilder: { begin: () => { calls.txBegin++; return {}; }, addCommand: () => { calls.txAddCommand++; }, build: () => { calls.txBuild++; return {}; } }
  };
  return { substrate, calls };
}
function rPipeline(){
  // one full engine pipeline over the real diagnostic: counting doc + counting
  // substrate + the REAL evaluation surface as the critic authority (the role
  // provider rides the critic closure — request.evaluationContext is
  // plain-data-scanned, FD-6)
  const probe = rViolatedEvaluation();
  const target = rSemanticTarget(probe.result);
  const { doc, reads } = rDocContext();
  const { substrate, calls } = rCountingSubstrate();
  let criticCalls = 0;
  let lastEvaluation = null;
  const critic = {
    evaluate: (document) => {
      criticCalls++;
      lastEvaluation = evaluate(rExpected([rRecord('obj-p1', 'text', 0.8)]), document, rEvalContext(() => 'heading'));
      return lastEvaluation;
    }
  };
  const request = {
    rootIntentId: 'intent-semantic-loop',
    rootTransactionId: 'tx-root-semantic-loop',
    targets: [target],
    policy: createCorrectionLoopPolicy(),
    mode: 'AUTO',
    critic,
    document: doc,
    substrate
  };
  const started = CorrectionEngine.start(request);
  const finished = CorrectionEngine.run(started);
  return { probe, target, reads, calls, getCriticCalls: () => criticCalls, getLastEvaluation: () => lastEvaluation, started, finished };
}
function rOutcome(state){
  // the JSON-comparable engine outcome (strips the injected authorities)
  return {
    status: state.status,
    terminationReason: state.terminationReason,
    sessionState: state.session.state,
    visitedStates: state.session.visitedStates,
    corrections: state.session.corrections,
    iteration: state.session.iteration,
    iterationLedger: state.iterationLedger,
    refusalLedger: state.refusalLedger,
    executedAttempts: state.executedAttempts,
    noProgressStreak: state.noProgressStreak,
    focusTargetId: state.focusTargetId,
    lastReport: state.lastReport,
    fingerprintTrailLength: state.fingerprintTrail.length
  };
}

// ---- R-1 --------------------------------------------------------------------
test('R-1: a semantic deviation reaches the Correction Loop through the existing boundary (the §7 CorrectionTarget agenda over the REAL B->D chain)', ()=>{
  const pipe = rPipeline();
  // fixture sanity: the diagnostic is REAL — a VIOLATED semantic deviation
  eq(pipe.probe.result.status, 'DEVIATION', 'the B->D evaluation reports DEVIATION');
  const dev = pipe.probe.result.deviations.find(d => d.category === 'semantic');
  expect(dev && dev.property === 'role', "the diagnostic deviation rides category 'semantic' on property 'role'");
  // the §7 boundary accepted the projected target and the engine consumed it
  eq(pipe.started.status, 'RUNNING', 'start -> RUNNING (the agenda is unsatisfied while the violation exists)');
  eq(pipe.started.session.state, 'IDLE', 'the session starts at IDLE (§4)');
  eq(pipe.finished.status, 'TERMINATED', 'run -> TERMINATED (the loop consumed the semantic target and gave an honest verdict)');
  eq(pipe.finished.focusTargetId, pipe.target.id, 'the loop focused the SEMANTIC agenda target (identity fields stay agenda-pinned)');
});

// ---- R-2 --------------------------------------------------------------------
test('R-2: the loop\'s capability resolution sees the SEMANTIC_ERROR root cause (CATEGORY_TO_ROOT_CAUSE; behavioral via the ledger)', ()=>{
  eq(CATEGORY_TO_ROOT_CAUSE.SEMANTIC, 'SEMANTIC_ERROR', "the §8 attribution maps SEMANTIC -> SEMANTIC_ERROR (correction.js:1313)");
  expect(CORRECTION_DIAGNOSIS_ROOT_CAUSES.includes('SEMANTIC_ERROR'), 'SEMANTIC_ERROR is a KNOWN §8 root cause (the honest gap is declared, not unknown)');
  const pipe = rPipeline();
  const resolution = resolveCorrectionDiagnosis(pipe.target);
  eq(resolution.rootCause, 'SEMANTIC_ERROR', 'the resolution attributes the SEMANTIC target to SEMANTIC_ERROR');
  // behavioral: the LOOP resolved through the same attribution — the ledger
  // entry names the target's category (the loop's own resolution output)
  eq(pipe.finished.refusalLedger.length, 1, 'exactly one ledger entry on the honest path');
  eq(pipe.finished.refusalLedger[0].details.category, 'SEMANTIC', 'the ledger entry carries the SEMANTIC category (the loop saw it)');
  eq(pipe.finished.refusalLedger[0].details.metric, 'role', "the ledger entry carries the metric 'role'");
});

// ---- R-3 --------------------------------------------------------------------
test('R-3: capability resolution produces NO_CAPABILITY (per A-9: zero recipes for SEMANTIC_ERROR); the frozen resolution record, pinned verbatim', ()=>{
  const semanticRecipes = CORRECTION_CAPABILITY_RECIPES.filter(r => r.rootCause === 'SEMANTIC_ERROR');
  eq(semanticRecipes.length, 0, 'A-9 pinned: the capability table carries ZERO SEMANTIC_ERROR recipes (the §28 honest gap)');
  const pipe = rPipeline();
  const resolution = resolveCorrectionDiagnosis(pipe.target);
  deepEq(Object.keys(resolution).sort(), ['category','metric','objectIds','rootCause','status','targetId'], 'the resolution carries EXACTLY the six NO_CAPABILITY fields');
  eq(resolution.status, 'NO_CAPABILITY', 'status NO_CAPABILITY');
  eq(resolution.targetId, pipe.target.id, 'the resolution names the agenda target');
  eq(resolution.category, 'SEMANTIC', 'the target category rides the resolution');
  eq(resolution.rootCause, 'SEMANTIC_ERROR', 'the attributed root cause rides the resolution');
  eq(resolution.metric, 'role', "the target metric rides the resolution");
  deepEq(resolution.objectIds, ['obj-p1'], 'the affected objectIds ride the resolution');
  deepFrozen(resolution, 'resolution');
  // behavioral: the LOOP's ledger entry IS the NO_CAPABILITY record
  eq(pipe.finished.refusalLedger[0].source, 'NO_CAPABILITY', "the loop's ledger entry sources NO_CAPABILITY");
  eq(pipe.finished.refusalLedger[0].reason, 'NO_CAPABILITY', "the loop's ledger entry reasons NO_CAPABILITY");
});

// ---- R-4 --------------------------------------------------------------------
test('R-4: the loop terminates honestly — TERMINATED / UNFIXABLE per the disclosure-39 mapping; the no-cycle rule keeps the session at IDLE (FD-4/FD-5)', ()=>{
  const pipe = rPipeline();
  eq(CORRECTION_TERMINATION_REASONS.includes('UNFIXABLE'), true, "'UNFIXABLE' is a §50 termination reason");
  eq(pipe.finished.status, 'TERMINATED', 'the engine status is TERMINATED');
  eq(pipe.finished.terminationReason, 'UNFIXABLE', "a NO_CAPABILITY blocker maps to 'UNFIXABLE' (the deterministic mapping — pinned as-is)");
  expect(CORRECTION_TERMINATION_REASONS.includes('SEMANTIC_BLOCKED'), "the vocabulary RESERVES 'SEMANTIC_BLOCKED' but the mapping does not wire it to this path (FD-4, honest observation)");
  deepEq(pipe.finished.lastReport, { action: 'TERMINATED', terminationReason: 'UNFIXABLE', convergenceKind: 'CONTINUE' }, 'the last report is the honest termination report');
  eq(pipe.finished.session.state, 'IDLE', 'the session stays IDLE — nothing was ever attempted (the no-cycle rule, FD-5)');
  eq(pipe.finished.session.terminationReason, undefined, 'the SESSION carries no fake termination (the ENGINE carries the verdict, FD-5)');
});

// ---- R-5 --------------------------------------------------------------------
test('R-5: no transaction is opened for a semantic deviation (no capability -> no attempt); every substrate counter stays at zero (FD-6)', ()=>{
  const pipe = rPipeline();
  eq(pipe.calls.txExecute, 0, 'transactionManager.execute NEVER called');
  eq(pipe.calls.txBegin, 0, 'transactionBuilder.begin NEVER called');
  eq(pipe.calls.txAddCommand, 0, 'transactionBuilder.addCommand NEVER called');
  eq(pipe.calls.txBuild, 0, 'transactionBuilder.build NEVER called');
  eq(pipe.calls.registryHas, 0, 'registry.has NEVER called (formation returned before any preflight)');
  eq(pipe.calls.registryGet, 0, 'registry.get NEVER called');
  eq(pipe.calls.registryValidate, 0, 'registry.validate NEVER called');
  eq(pipe.finished.executedAttempts, 0, 'zero executed attempts');
  eq(pipe.finished.iterationLedger.length, 0, 'zero iteration-ledger entries');
});

// ---- R-6 --------------------------------------------------------------------
test('R-6: history remains linear (Invariant 13) — zero corrections, zero iterations, the state trail stays [\'IDLE\'], one fingerprint', ()=>{
  const pipe = rPipeline();
  eq(pipe.finished.session.corrections.length, 0, 'zero correction attempts appended to the session history');
  eq(pipe.finished.session.iteration, 0, 'zero iterations consumed');
  deepEq(pipe.finished.session.visitedStates, ['IDLE'], 'the §3 state trail is the initial linear trail — no transitions were fabricated');
  eq(pipe.finished.fingerprintTrail.length, 1, 'exactly one fingerprint (the initial evaluation) — no attempt fingerprints');
  eq(pipe.finished.iterationLedger.length, 0, 'zero iteration-ledger entries (the ledger stays append-only-honest)');
  eq(pipe.finished.refusalLedger.length, 1, 'exactly one honest ledger entry (the NO_CAPABILITY record)');
  eq(pipe.finished.noProgressStreak, 0, 'no no-progress streak (no attempt was ever made)');
});

// ---- R-7 --------------------------------------------------------------------
test('R-7: no direct Store mutation (Invariant 8) — the engine\'s ONLY document contact is the single critic consultation (read-delta = exactly one evaluate)', ()=>{
  // the critic's unit cost: one bare evaluation against a FRESH counting doc
  const unit = rDocContext();
  evaluate(rExpected([rRecord('obj-p1', 'text', 0.8)]), unit.doc, rEvalContext(() => 'heading'));
  const unitCost = JSON.parse(JSON.stringify(unit.reads));
  // the pipeline: t0 before start, t1 after start, t2 after run
  const pipe = rPipeline();
  const t2 = JSON.parse(JSON.stringify(pipe.reads));
  eq(pipe.getCriticCalls(), 1, 'exactly ONE critic consultation (engineStart; the honest path never re-evaluates)');
  // the engine's total document contact (start + run) equals ONE critic call's
  // worth of reads — the loop itself never reached into any store
  deepEq(t2, unitCost, 'the whole engine lifetime added exactly one evaluate() of document reads — all contact flowed through the critic channel');
  // and the read surface saw no WRITES because there are none to call: the
  // counting doc exposes read-only methods, and nothing attempted otherwise
  // (a mutation attempt would surface as an engine throw, not a silent pass)
  eq(Object.isFrozen(pipe.target), true, 'the agenda target stays frozen through the run');
});

// ---- R-8 --------------------------------------------------------------------
test('R-8: determinism — two full pipelines produce identical outcomes (Invariant 19)', ()=>{
  const a = rPipeline();
  const b = rPipeline();
  // the diagnostic itself is deterministic (P-9): identical results + ids
  deepEq(a.probe.result, b.probe.result, 'two B->D evaluations -> deep-identical results (incl. content-derived deviation ids)');
  eq(a.target.id, b.target.id, 'content-derived target identity is deterministic');
  deepEq(rOutcome(a.finished), rOutcome(b.finished), 'two engine runs over identical inputs -> identical outcomes (status, ledgers, reports, trails)');
});

// ---- R-9 --------------------------------------------------------------------
test('R-9: the honest diagnostic reaches the loop via the correct channel — the D-1 sidecar record rides target.evidence verbatim; session-local frozen snapshot; ledger traceability (FD-2/FD-7)', ()=>{
  const pipe = rPipeline();
  // the agenda target EMBEDS the D-1 sidecar record verbatim (the channel)
  const violated = pipe.probe.result.metadata.semanticResults.find(s => s.status === 'VIOLATED');
  deepEq(pipe.target.evidence, [violated], 'target.evidence carries the D-1 sidecar record verbatim (the diagnostic entered the loop unaltered)');
  // the projection is faithful: category/metric/objectId all trace to the deviation
  const dev = pipe.probe.result.deviations.find(d => d.category === 'semantic');
  eq(pipe.target.category, 'SEMANTIC', "the §7 projection of the deviation's 'semantic' category");
  eq(pipe.target.metric, dev.property, "the metric is the deviation's compared quantity ('role')");
  eq(pipe.target.objectIds[0], dev.objectId, 'the target names the deviation\'s object');
  eq(pipe.target.confidence, 0.8, 'the T20 confidence rides verbatim (no invention, §36)');
  // the loop's world view is the critic's verbatim output as a session-local
  // frozen PLAIN snapshot (content identity — FD-7)
  deepEq(pipe.finished.session.currentEvaluation, pipe.getLastEvaluation(), 'session.currentEvaluation deep-equals the critic\'s evaluation (the verbatim world view)');
  deepFrozen(pipe.finished.session.currentEvaluation, 'session.currentEvaluation');
  // ledger traceability: the NO_CAPABILITY entry names the refreshed working
  // target (disclosure 39: observedValue + evidence refresh from the CURRENT
  // evaluation; identity fields stay agenda-pinned on focusTargetId)
  const details = pipe.finished.refusalLedger[0].details;
  expect(/^ctarget-[0-9a-f]{8}$/.test(details.targetId), 'the ledger names a content-derived working target');
  expect(details.targetId !== pipe.target.id, 'the working target is the REFRESHED target (its evidence was re-derived from the current evaluation, disclosure 39)');
  eq(pipe.finished.focusTargetId, pipe.target.id, 'the focus stays the agenda-pinned target');
});

// ---- R-10 -------------------------------------------------------------------
test('R-10: the existing correction.test.mjs (144 tests) remains GREEN — no regression from the 3.17 surface', ()=>{
  const out = execFileSync(process.execPath, ['tests/correction.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 144 total, 144 passed, 0 failed', 'correction suite GREEN (the Correction Loop is untouched by 3.17)');
});

// ---- R-11 -------------------------------------------------------------------
test('R-11: backward compat — the 1105 baseline components hold (constraint-inference 107, ai 131, evaluation-critic 120; counted 943 + gates in the final regression run)', ()=>{
  const out1 = execFileSync(process.execPath, ['tests/constraint-inference.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out1.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 107 total, 107 passed, 0 failed', 'constraint-inference suite (incl. 14 J-tests + 14 K-tests) GREEN');
  const out2 = execFileSync(process.execPath, ['tests/ai.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out2.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 131 total, 131 passed, 0 failed', 'ai suite GREEN (the C-era planner surface)');
  const out3 = execFileSync(process.execPath, ['tests/evaluation-critic.test.mjs'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(out3.split('\n').filter(l => l.startsWith('Tests:')).pop(), 'Tests: 120 total, 120 passed, 0 failed', 'evaluation-critic suite GREEN (the D/E-era surfaces)');
});

// ---- R-12 -------------------------------------------------------------------
test('R-12: the Correction Loop does NOT import semantic.js or semantic-inference.js (static scan: correction.js has ZERO static imports at all)', ()=>{
  expect(!/^import\b/m.test(R_CORRECTION_SRC), 'correction.js carries ZERO static imports (the zero-import pin — strictly stronger than the required scan)');
  expect(!R_CORRECTION_SRC.includes('semantic-inference'), 'no reference to the semantic-inference module anywhere in correction.js');
  expect(!/from\s+'\.\/semantic/.test(R_CORRECTION_SRC), "no import from any './semantic*' module");
  expect(!/import\s*\(\s*['"]\.\/semantic/.test(R_CORRECTION_SRC), 'no dynamic import of any semantic module');
  expect(!/require\s*\(\s*['"]\.\/semantic/.test(R_CORRECTION_SRC), 'no require of any semantic module');
  // the §24 engine surface is exactly the five operations, deep-frozen
  deepFrozen(CorrectionNS.CorrectionEngine, 'CorrectionEngine');
  deepEq(Object.keys(CorrectionNS.CorrectionEngine).sort(), ['iterate','rollback','run','start','terminate'], 'the engine exposes EXACTLY the five §24 operations');
});

// ============================================================================
// CATEGORY S — CLOSED LOOP (PHASE 3.17, Checkpoint G; spec §60)
// ============================================================================
// The closed-loop face of 3.17: the COMPLETE golden scenario over the LIVE
// document substrate — real T01 creation through the DSL pipeline, REAL T20
// through the frozen tool registry, REAL normalization, REAL planner
// carriage, REAL acceptance, a REAL post-acceptance mutation (drift), REAL
// evaluation, the REAL critic decline, the FROZEN 3.15 Correction Loop, and
// the honest NO_CAPABILITY termination (spec §53 steps 1-14, §60).
//
// CATEGORY S DESIGN DECISIONS PINNED HERE (Checkpoint G; TEST-ONLY):
//   SG-1  GOLDEN OUTCOME = HONEST TERMINATION. No semantic correction
//         capability exists (A-9: zero SEMANTIC_ERROR recipes; E-1: the
//         critic emits NO semantic proposal; F-1: NO_CAPABILITY/UNFIXABLE),
//         so per spec §54 ("do not fabricate a correction capability")
//         VERIFIED is UNREACHABLE for a semantic drift. The honest
//         termination IS the 3.17 golden scenario; the 3.16 VERIFIED golden
//         (M-1) remains the precedent for CAPABLE loops. H is the final
//         audit; the §54 STOP-branch declaration is here PROVEN, not merely
//         declared.
//   SG-2  THE DRIFT IS REAL — a real T06 scale transaction. Disclosed
//         refinement of the prompt's "T05 precedent": the 3.16 golden's T05
//         precedent names the MECHANISM (a real tool-shaped mutation
//         transaction executed by the substrate after acceptance), but the
//         T05 move writes ONLY x/y (tools.js:67-95,
//         createMoveObjectCommand transaction.js:502-520) and the frozen T20
//         engine derives roles from geometry type, world-bbox AREA, and
//         childCount ONLY (semantic.js:132-229) — position is evidence
//         weight 0.02 (semantic.js:189) and drives NO role, so a T05 move
//         can flip NO T20 role and would manufacture NO drift (contradicting
//         §53 steps 6-8). The minimal real mutation that moves a T20-derived
//         role is a T06 scale: the frozen thresholds (:165-171: world-bbox
//         area >100000 -> 'background', <5000 -> small 'shape') turn a
//         60x40 'shape' into a 600x400 'background' through the engine's OWN
//         derivation — nothing is injected, §53's "MUST NOT manufacture" is
//         satisfied, and the mutation is a REAL registry-dispatched
//         transaction (executeViaSubstrate -> TransactionBuilder ->
//         TransactionExecutor -> HistoryManager).
//   SG-3  THE §31 POSTURE IS ASSERTED, NOT ASSUMED: pre-drift, the accepted
//         expectation evaluates SATISFIED against the live scene (T20 infers
//         roles from scenes that ALREADY satisfy them); the drift alone
//         moves the verdict to VIOLATED. Both faces are pinned in S-A-2.
//   SG-4  THE ACTUAL ROLE IS DERIVED, NOT MANUFACTURED: the D-1 role
//         provider re-runs the REAL T20 tool against the CURRENT document it
//         is handed (registry.execute('T20', ...) — category 'proposal',
//         permissions.write=[], reads only). The provider is the §31 bridge
//         between the frozen derivation and the D-1 arm; the drift is
//         OBSERVED, never staged.
//   SG-5  ACCEPTANCE = the planner's ExpectedState carrying the accepted
//         records, validated by validateExpectedState (spec §32's
//         session-local branch: records live in the inference session, the
//         ACCEPTED DESIRED STATE lives on the ExpectedState — the 3.16
//         ConstraintStore.create analog, CD-1/CD-3; Invariant 15: the
//         semantic section is NOT canonical document state). The accepted
//         monitoring desired state is the 3.16 g3NullExpected posture: the
//         all-null 5-section form + the PLANNER'S semantic section verbatim
//         (the accepted agenda IS the expectation). The probe proved why:
//         reusing the creation intent's full ExpectedState would pin
//         width/height/area as GEOMETRY expectations, so the real T06 drift
//         would emit three unrelated geometry deviations and the critic
//         would propose a geometry correction — polluting the SEMANTIC
//         golden scenario with the 3.16 loop's business. The creation
//         numbers belong to the CREATION plan; post-acceptance monitoring
//         carries the accepted semantic agenda only.
//   SG-6  DETERMINISM over the live pipeline is proven through the 3.16 M-2
//         canonical-evidence projection: the substrate's creation uuids and
//         the content-derived digests that embed them are identity entropy
//         of the SUBSTRATE (declared, normalized), every other byte must
//         match. Raw T20 entropy (proposalId uuid, createdAt wall-clock) is
//         stripped by Checkpoint-B normalization (BD-5) — the normalized
//         chain is content-derived end to end.
//   SG-7  SCAN SCOPE (§40 "actual repository conventions"): static scans run
//         over STRIPPED code bodies (comments/strings removed — the 3.16
//         M-10..M-17 mechanics; the D-1 lesson applied in reverse: scans
//         judge CODE, not comment prose) of the 3.17 surface:
//         semantic-inference.js + the three 3.17 hosts (ai.js, evaluation.js,
//         critic.js) + the FROZEN correction.js for the filesystem/network/
//         LLM-word scans (recon: its 'completion'/'embedding' tokens are
//         comment prose only — stripped to zero; it carries ZERO static
//         imports, R-12). For Store/History/Transaction scans correction.js
//         is covered BEHAVIORALLY instead: it IS the frozen engine that
//         legitimately owns execution (the one-attempt-one-transaction
//         owner), so its §40 guarantees on the semantic path are pinned by
//         the live zero-delta proofs (S-A-5/S-A-6/S-A-7) plus the frozen
//         byte-identity (S-D-8) — a word list over the engine body would
//         false-positive on the engine's own legitimate executor role
//         (§40: "do not create a scan whose only purpose is to satisfy a
//         gate while missing real architectural violations").
//   SG-8  RED EXPECTATION: GREEN-by-construction is the EXPECTED RED-run
//         outcome for a test-only closed-loop checkpoint (the E-1/F-1
//         precedent, FD-8): every S assertion models EXISTING behavior of
//         frozen/accepted surfaces; a failure means a fixture-modeling
//         error, fixed in the TESTS only, disclosed — never wired around.
// ============================================================================

// --- Category S helpers: stripped-body scanning (the 3.16 M-10..M-17 form) ---
function sStripCommentsAndStrings(src){
  let out=''; let mode='code'; const n=src.length; let i=0;
  while(i<n){
    const c=src[i], d=i+1<n?src[i+1]:'';
    if(mode==='code'){
      if(c==='/'&&d==='/'){mode='line';out+='  ';i+=2;continue;}
      if(c==='/'&&d==='*'){mode='block';out+='  ';i+=2;continue;}
      if(c==="'"){mode='squote';out+=' ';i+=1;continue;}
      if(c==='"'){mode='dquote';out+=' ';i+=1;continue;}
      out+=c; i+=1; continue;
    }
    if(mode==='line'){ if(c==='\n'){mode='code';out+=c;} else out+=' '; i+=1; continue; }
    if(mode==='block'){ if(c==='*'&&d==='/'){mode='code';out+='  ';i+=2;continue;} if(c==='\n')out+=c; else out+=' '; i+=1; continue; }
    // inside quotes: keep the newline bookkeeping simple, blank everything else
    if((mode==='squote'&&c==="'")||(mode==='dquote'&&c==='"')){mode='code';out+=' ';i+=1;continue;}
    if(c==='\n')out+=c; else out+=' '; i+=1;
  }
  return out;
}
function sWordHits(stripped, w){ return stripped.match(new RegExp('\\b'+w+'\\b','g'))||[]; }
function sImportSpecifiers(src){
  const specs=[];
  for(const line of src.split('\n')){
    const m=line.match(/from\s*['"]([^'"]+)['"]/)||line.match(/^\s*import\s+['"]([^'"]+)['"]/)||line.match(/import\s*\(\s*['"]([^'"]+)['"]/);
    if(m) specs.push(m[1]);
  }
  return specs;
}
// the STRICT production-form collector: only real import STATEMENT lines (the
// repo's production imports are all single-line import statements). The loose
// from-clause sweep false-positives on comment prose — e.g. correction.js:175
// cites the T05 axis-delta vocabulary inside a COMMENT, which is not an import.
function sProductionImportSpecifiers(src){
  const specs=[];
  for(const line of src.split('\n')){
    if(!/^\s*import\b/.test(line)) continue;
    const m=line.match(/from\s*['"]([^'"]+)['"]/)||line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if(m) specs.push(m[1]);
  }
  return specs;
}
const S_SURFACE=['semantic-inference.js','ai.js','evaluation.js','critic.js','correction.js'];
const S_SRC=Object.fromEntries(S_SURFACE.map(f=>[f, readFileSync(new URL('../src-js/'+f, import.meta.url), 'utf-8')]));
const S_STRIPPED=Object.fromEntries(S_SURFACE.map(f=>[f, sStripCommentsAndStrings(S_SRC[f])]));
const S_TEST_SRC=readFileSync(new URL(import.meta.url), 'utf-8');
// the canonical identity-entropy projection (the 3.16 M-2 canonicalizeTrace)
function sCanonicalize(json){
  return json
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '«uuid»')
    .replace(/\b[a-z][a-z0-9]*-[0-9a-f]{8}\b/g, '«digest»');
}

// --- Category S fixtures: the live golden substrate (the 3.16 g3Column form) --
const S_ARTBOARD = { width: 800, height: 600, centerX: 400, centerY: 300 };

async function sScene(){
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const transactionBuilder=new TransactionBuilder();
  const docContext={ objectStore, geometryStore, appearanceStore, sceneGraph };
  const planCtx=createPlanningContext({ artboard: S_ARTBOARD, objects: {} });
  // one SMALL rectangle: world-bbox area 60x40=2400 < 5000 -> the frozen T20
  // derivation (semantic.js:172-176) yields role 'shape'
  const intent={ type:'create', objectType:'rectangle', width:60, height:40, x:100, y:100 };
  const expectedState=createExpectedState(intent, planCtx);
  const plan=createPlan(intent, planCtx);
  const verdict=validatePlan(plan, planCtx);
  eq(verdict.valid, true, 's-scene: the creation plan validates against the planning context');
  const dslProgram=compilePlanToDSL(plan);
  const parsed=parseDSL(JSON.stringify(dslProgram));
  const dslVerdict=validateDSL(parsed.program, planCtx);
  eq(dslVerdict.valid, true, 's-scene: the DSL program validates');
  const ir=compileToIR(parsed.program, planCtx);
  const execution=await new DSLExecutor().execute(ir.ir, { toolRegistry: registry, documentContext: { ...docContext, transactionManager } });
  const out=execution.outputs.find(o=>o.output && o.output.objectId);
  if(!out) throw new Error('s-scene: T01 produced no objectId — '+JSON.stringify(execution.errors));
  const objectId=out.output.objectId;
  const geomParamsOf=(id)=>geometryStore.get(objectStore.get(id).geometryRef).params;
  const snapshot=()=>JSON.stringify({
    object: objectStore.get(objectId),
    geom: geometryStore.get(objectStore.get(objectId).geometryRef),
    app: appearanceStore.get(objectStore.get(objectId).appearanceRef)
  });
  return { objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager,
    transactionManager, registry, transactionBuilder, docContext, planCtx, intent, expectedState, plan,
    objectId, geomParamsOf, snapshot, historyAfterCreation: historyManager.size(), creationSnapshot: snapshot() };
}

// the §31/SG-4 bridge: the ACTUAL role is re-derived from the CURRENT document
// by the REAL frozen T20 tool (reads only; the provider returns null on an
// honest precondition failure — never a guess)
function sRoleReader(registry){
  return (document) => (objectId) => {
    const out=registry.execute('T20', { objectIds:[objectId] }, document);
    if(!out || out.success!==true || !out.output || !Array.isArray(out.output.proposals) || out.output.proposals.length===0) return null;
    return out.output.proposals[0].proposedRole;
  };
}
function sEvalContext(g, document, providerOverride){
  const ctx={ targets:[{ objectId:g.objectId, targetRef:'$doc:'+g.objectId }] };
  if(providerOverride!==undefined){ if(providerOverride!==null) ctx.getActualRole=providerOverride; }
  else ctx.getActualRole=sRoleReader(g.registry)(document);
  return ctx;
}
function sEvaluate(g, es, document, providerOverride){
  return evaluate(es, document, sEvalContext(g, document, providerOverride));
}
// the FD-2 caller projection of the D-1 deviation into the §7 agenda
function sSemanticTarget(result){
  const deviation=result.deviations.find(d=>d.category==='semantic');
  const signal=result.metadata.semanticResults.find(s=>s.status==='VIOLATED');
  return createCorrectionTarget({
    category:'SEMANTIC', objectIds:[deviation.objectId], metric:deviation.property,
    observedValue:result.deviations.filter(d=>d.category==='semantic').length,
    severity:'HIGH', confidence:signal.confidence, evidence:[signal]
  });
}

// THE GOLDEN SCENARIO (§53 steps 1-14; §60): every leg is the REAL surface.
async function sGolden(){
  const g=await sScene();
  const creationSnapshot=g.snapshot();

  // STEP 2: real T20 through the frozen registry (proposal -> direct execute)
  const t20=g.registry.execute('T20', { objectIds:[g.objectId] }, g.docContext);
  expect(t20 && t20.success===true, 's-golden: the real T20 run succeeded');
  const raw=t20.output.proposals[0];

  // STEP 3: real Checkpoint-B normalization (the tool output IS the envelope)
  const session=createInferenceSession();
  const outcome=session.ingest(t20);
  const records=outcome.records;

  // STEP 4: the Planner carries the semantic expectation (the same logical
  // intent, planned with the accepted records on the context)
  const planCtx=createPlanningContext({ artboard:S_ARTBOARD, objects:{}, semantic:records });
  const planned=createExpectedState(g.intent, planCtx);
  // STEP 5: acceptance — the 3.16 g3NullExpected posture (SG-5): the accepted
  // monitoring desired state = all-null sections + the PLANNER'S semantic
  // section verbatim; validateExpectedState accepts; the host adopts it
  const es=pExpected(records);
  deepEq(es.semantic, planned.semantic, 's-golden: the accepted semantic section IS the planner\'s section (verbatim)');
  const acceptance=validateExpectedState(es);
  // §31 posture (SG-3): the scene ALREADY satisfies the inferred role
  const preDrift=sEvaluate(g, es, g.docContext);
  const preDriftSnapshot=g.snapshot();

  // STEP 6: the drift — REAL T06 scale x10 through the substrate
  const historyBeforeDrift=g.historyManager.size();
  const drift=g.registry.execute('T06', { objectIds:[g.objectId], transform:{a:10,b:0,c:0,d:10,tx:0,ty:0} }, { ...g.docContext, transactionManager:g.transactionManager });
  const historyAfterDrift=g.historyManager.size();
  const postDriftSnapshot=g.snapshot();

  // STEPS 7+8: semantic evaluation detects the drift
  const postDrift=sEvaluate(g, es, g.docContext);

  // STEP 9: the Critic diagnoses — NO proposal, the pass-through diagnostic
  const proposals=proposeCorrections(postDrift);

  // STEPS 10..14: the FROZEN loop resolves capability -> NONE -> honest end
  const target=sSemanticTarget(postDrift);
  let criticCalls=0; let lastEvaluation=null;
  const critic={ evaluate(document, context){ criticCalls++; lastEvaluation=sEvaluate(g, es, document); return lastEvaluation; } };
  const request={ rootIntentId:'intent-semantic-golden', rootTransactionId:'tx-root-semantic-golden',
    targets:[target], policy:createCorrectionLoopPolicy(), mode:'AUTO', critic, document:g.docContext,
    substrate:{ registry:g.registry, transactionManager:g.transactionManager, transactionBuilder:g.transactionBuilder, sceneGraph:g.sceneGraph } };
  const historyBeforeLoop=g.historyManager.size();
  const started=CorrectionEngine.start(request);
  const finished=CorrectionEngine.run(started);
  const historyAfterLoop=g.historyManager.size();

  // STEP 12: the explicit re-evaluation (beyond the loop's own consultation)
  const reEval=sEvaluate(g, es, g.docContext);

  return { g, creationSnapshot, t20, raw, session, outcome, records, es, acceptance, preDrift, preDriftSnapshot,
    drift, historyBeforeDrift, historyAfterDrift, postDriftSnapshot, postDrift, proposals, target, started, finished,
    reEval, getCriticCalls:()=>criticCalls, getLastEvaluation:()=>lastEvaluation, historyBeforeLoop, historyAfterLoop };
}

function sOutcome(state){
  return { status:state.status, terminationReason:state.terminationReason, sessionState:state.session.state,
    visitedStates:state.session.visitedStates, corrections:state.session.corrections, iteration:state.session.iteration,
    iterationLedger:state.iterationLedger, refusalLedger:state.refusalLedger, executedAttempts:state.executedAttempts,
    noProgressStreak:state.noProgressStreak, focusTargetId:state.focusTargetId, lastReport:state.lastReport,
    fingerprintTrailLength:state.fingerprintTrail.length };
}
// the compact deterministic evidence projection of one golden run (SG-6)
async function sGoldenEvidence(){
  const s=await sGolden();
  const dev=s.postDrift.deviations.find(d=>d.category==='semantic');
  return {
    scene:{ geom:{ ...s.g.geomParamsOf(s.g.objectId) } },
    raw:{ proposedRole:s.raw.proposedRole, confidence:s.raw.confidence, source:s.raw.source, tagCount:s.raw.proposedTags.length },
    record:{ id:s.records[0].id, objectId:s.records[0].objectId, role:s.records[0].role, confidence:s.records[0].confidence, source:s.records[0].source, status:s.records[0].status },
    accepted:{ valid:s.acceptance.valid, expectationCount:s.es.semantic.expectations.length, satisfied:s.es.semantic.satisfied },
    preDrift:{ status:s.preDrift.status, semantic:s.preDrift.metadata.semanticResults[0].status, deviations:s.preDrift.deviations.length },
    drift:{ success:s.drift.success, transactionId:s.drift.transactionId, historyDelta:s.historyAfterDrift-s.historyBeforeDrift },
    postDrift:{ status:s.postDrift.status, deviations:s.postDrift.deviations.length,
      deviation:{ category:dev.category, property:dev.property, expected:dev.expected, actual:dev.actual, severity:dev.severity, objectId:dev.objectId, id:dev.id },
      semanticResults:s.postDrift.metadata.semanticResults.map(r=>({objectId:r.objectId, role:r.role, status:r.status, confidence:r.confidence, reason:r.reason})) },
    critique:{ length:s.proposals.length },
    agenda:{ id:s.target.id, category:s.target.category, metric:s.target.metric, severity:s.target.severity, confidence:s.target.confidence },
    loop:sOutcome(s.finished),
    criticCalls:s.getCriticCalls(),
    reEval:{ status:s.reEval.status, semantic:s.reEval.metadata.semanticResults[0].status, deviations:s.reEval.deviations.length },
    history:{ beforeLoop:s.historyBeforeLoop, afterLoop:s.historyAfterLoop, delta:s.historyAfterLoop-s.historyBeforeLoop },
    storesUnchangedByLoop: s.postDriftSnapshot===s.g.snapshot()
  };
}

// ---- S-A-1 --------------------------------------------------------------------
test('S-A-1: the golden pipeline executes END-TO-END — real T01 creation, real T20, real normalization, real planner carriage, real acceptance, real drift transaction, real evaluation, real critic, real frozen loop (§60)', async ()=>{
  const s=await sGolden();
  const g=s.g;
  // the substrate is real: a uuid-format creation id, plan + DSL verdicts already asserted in sScene
  expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(g.objectId), 'the scene object is a real T01 creation (uuid-format id)');
  // STEP 2: the real T20 derives 'shape' from the live 60x40 scene
  eq(s.raw.proposedRole, 'shape', 'STEP 2: the real T20 derivation yields shape on the small rect');
  // STEP 3: normalization accepted exactly the derived proposal
  eq(s.records.length, 1, 'STEP 3: one normalized record');
  // STEPS 4+5: the planner carried it and the desired state validates
  deepEq(s.es.semantic.expectations, s.records, 'STEP 4: the accepted records ride the desired state verbatim');
  eq(s.acceptance.valid, true, 'STEP 5: validateExpectedState accepts the semantic desired state');
  // STEP 6: the drift is a REAL committed transaction
  eq(s.drift.success, true, 'STEP 6: the real T06 scale succeeded');
  eq(s.historyAfterDrift, s.historyBeforeDrift+1, 'STEP 6: the drift committed as its own transaction');
  eq(s.g.geomParamsOf(g.objectId).width, 600, 'STEP 6: the mutation is observable (60 -> 600)');
  eq(s.g.geomParamsOf(g.objectId).height, 400, 'STEP 6: the mutation is observable (40 -> 400)');
  // STEPS 7+8: evaluation detects the semantic drift
  eq(s.postDrift.status, 'DEVIATION', 'STEPS 7+8: the semantic expectation is VIOLATED after the drift');
  // STEP 9+10: the critic declines; the loop consumed the SEMANTIC agenda
  eq(s.proposals.length, 0, 'STEP 9: no capability proposal exists');
  eq(s.started.status, 'RUNNING', 'STEP 10: the loop accepted the SEMANTIC target');
  // STEPS 13+14: the honest end
  eq(s.finished.status, 'TERMINATED', 'STEP 13: the loop terminated');
  eq(s.reEval.metadata.semanticResults[0].status, 'VIOLATED', 'STEP 12/14: the drift persists — the honest non-success');
});

// ---- S-A-2 --------------------------------------------------------------------
test('S-A-2: each step produces the expected artifact — proposal, record, expectation, satisfaction, deviation, no-proposal diagnosis, NO_CAPABILITY refusal, honest termination', async ()=>{
  const s=await sGolden();
  // STEP 2 artifact: the raw T20 proposal (engine record shape)
  eq(s.raw.source, 'heuristic', 'the raw proposal names the ALGORITHM (the tool is the origin, BD-4)');
  expect(Array.isArray(s.raw.evidence) && s.raw.evidence.length>0, 'the raw proposal carries real derivation evidence');
  expect(typeof s.raw.confidence==='number' && s.raw.confidence>0.5 && s.raw.confidence<=1, 'the raw confidence is the graded engine value');
  // STEP 3 artifact: the normalized record (BD-1..BD-6)
  deepEq(Object.keys(s.records[0]).sort(), ['confidence','evidence','id','objectId','role','source','status'], 'the record carries EXACTLY the seven pinned fields');
  eq(s.records[0].role, 'shape', 'the record role is the derived role');
  eq(s.records[0].source, 'T20', 'provenance: the TOOL is the origin');
  eq(s.records[0].status, 'PROPOSED', 'status PROPOSED');
  expect(/^smr-[0-9a-f]{8}$/.test(s.records[0].id), 'content-derived record id');
  // STEPS 4+5 artifacts: carriage + acceptance
  deepEq(s.es.semantic.expectations, s.records, 'the expectations ARE the records (verbatim, in order)');
  eq(s.es.semantic.satisfied, null, 'satisfied stays the unevaluated marker (the Planner invents no verdict)');
  eq(s.acceptance.valid, true, 'the accepted desired state validates');
  // §31 artifact (SG-3): the scene ALREADY satisfies the inferred role pre-drift
  eq(s.preDrift.status, 'PASS', '§31: the pre-drift scene satisfies the inferred role (no VIOLATED by itself)');
  eq(s.preDrift.metadata.semanticResults[0].status, 'SATISFIED', '§31: the derived role equals the re-derived actual role');
  eq(s.preDrift.deviations.length, 0, '§31: zero deviations before the drift');
  // STEP 6 artifact: the drift transaction + the real geometry change
  expect(typeof s.drift.transactionId==='string' && s.drift.transactionId.length>0, 'the drift names its transaction');
  // STEPS 7+8 artifacts: one category:'semantic' deviation + the D-1 sidecar
  eq(s.postDrift.deviations.length, 1, 'exactly one deviation');
  const dev=s.postDrift.deviations[0];
  eq(dev.category, 'semantic', "the deviation rides the RESERVED 'semantic' category");
  eq(dev.property, 'role', "the compared quantity is 'role'");
  eq(dev.expected, 'shape', 'the expected side is the accepted record role');
  eq(dev.actual, 'background', 'the actual side is the RE-DERIVED post-drift role (observed, not staged — SG-2/SG-4)');
  eq(dev.severity, 'error', 'severity error');
  eq(dev.targetRef, '$doc:'+s.g.objectId, "targetRef uses the '$doc:' convention");
  expect(/^dev-[0-9a-f]{8}$/.test(dev.id), 'content-derived deviation id');
  deepEq(s.postDrift.metadata.semanticResults.map(r=>r.status), ['VIOLATED'], 'the D-1 sidecar carries the honest verdict');
  // STEP 9 artifact: NO proposal; the diagnostic signal is the pass-through
  eq(s.proposals.length, 0, 'the critic emits NO semantic proposal (EE-1)');
  eq(s.postDrift.metadata.semanticResults[0].role, 'shape', 'the sidecar preserves the agenda role (the diagnosis channel)');
  // STEP 10 artifact: the NO_CAPABILITY resolution record
  eq(s.finished.refusalLedger.length, 1, 'exactly one honest ledger entry');
  eq(s.finished.refusalLedger[0].source, 'NO_CAPABILITY', 'the loop resolved NO capability (A-9)');
  eq(s.finished.refusalLedger[0].details.category, 'SEMANTIC', 'the ledger entry names the SEMANTIC category');
  eq(s.finished.refusalLedger[0].details.metric, 'role', "the ledger entry names the metric 'role'");
  // STEPS 13+14 artifacts: the honest termination
  eq(s.finished.status, 'TERMINATED', 'TERMINATED');
  eq(s.finished.terminationReason, 'UNFIXABLE', 'UNFIXABLE (the deterministic disclosure-39 mapping)');
});

// ---- S-A-3 --------------------------------------------------------------------
test('S-A-3: determinism — two full golden runs produce byte-identical canonical outcome projections (the SG-6 identity-entropy projection, the 3.16 M-2 form)', async ()=>{
  const a=sCanonicalize(JSON.stringify(await sGoldenEvidence()));
  const b=sCanonicalize(JSON.stringify(await sGoldenEvidence()));
  eq(a, b, 'the canonical outcome projections are byte-identical');
  expect(a.includes('«uuid»'), 'the projection is real: substrate uuid entropy was present and normalized');
  expect(a.includes('«digest»'), 'the projection is real: content-derived digests (embedding the uuids) were present and normalized');
});

// ---- S-A-4 --------------------------------------------------------------------
test('S-A-4: honest termination — NO_CAPABILITY resolved, TERMINATED/UNFIXABLE, the session stays IDLE, the verdict rides the ENGINE (SG-1)', async ()=>{
  const s=await sGolden();
  eq(CORRECTION_CAPABILITY_RECIPES.filter(r=>r.rootCause==='SEMANTIC_ERROR').length, 0, 'A-9: zero semantic recipes — the honest gap is structural');
  eq(s.finished.status, 'TERMINATED', 'the engine status is TERMINATED');
  eq(s.finished.terminationReason, 'UNFIXABLE', 'the NO_CAPABILITY blocker maps deterministically to UNFIXABLE');
  deepEq(s.finished.lastReport, { action:'TERMINATED', terminationReason:'UNFIXABLE', convergenceKind:'CONTINUE' }, 'the last report is the honest termination report');
  eq(s.finished.session.state, 'IDLE', 'the session stays IDLE — nothing was ever attempted (the no-cycle rule, FD-5)');
  eq(s.finished.session.terminationReason, undefined, 'the SESSION carries no fake termination (the ENGINE carries the verdict)');
  eq(s.finished.executedAttempts, 0, 'zero executed attempts — the golden outcome is honest non-success, NOT VERIFIED (SG-1)');
});

// ---- S-A-5 --------------------------------------------------------------------
test('S-A-5: zero transactions opened for the semantic deviation — the correction leg never reaches the substrate (the live proof of the §24 boundary)', async ()=>{
  const s=await sGolden();
  const g=s.g;
  eq(s.historyBeforeLoop, s.historyAfterLoop, 'the correction leg opened ZERO transactions (history size unchanged by the loop)');
  eq(s.historyAfterLoop, g.historyAfterCreation+1, 'the ONLY post-acceptance transaction is the drift (creations + drift, nothing else)');
  eq(s.finished.executedAttempts, 0, 'zero executed attempts');
  eq(s.finished.iterationLedger.length, 0, 'zero iteration-ledger entries');
  // the drift transaction is real and is the T06 scale (the only writer)
  const entries=g.historyManager.getAll();
  eq(entries.length, g.historyAfterCreation+1, 'the history carries creations + the drift, exactly');
});

// ---- S-A-6 --------------------------------------------------------------------
test('S-A-6: history remains linear — strictly appended, no loop entries, no session transitions (Invariant 13 over the golden)', async ()=>{
  const s=await sGolden();
  const g=s.g;
  const entries=g.historyManager.getAll();
  eq(entries.length, g.historyAfterCreation+1, 'creations + drift only');
  eq(new Set(entries.map(t=>t.id)).size, entries.length, 'every transaction id is unique (a strictly append-only trail)');
  eq(s.finished.session.corrections.length, 0, 'zero correction attempts in the session history');
  eq(s.finished.session.iteration, 0, 'zero iterations consumed');
  deepEq(s.finished.session.visitedStates, ['IDLE'], 'the §3 state trail is the initial linear trail — no fabricated transitions');
  eq(s.finished.fingerprintTrail.length, 1, 'exactly one fingerprint (the initial evaluation)');
  eq(s.finished.noProgressStreak, 0, 'no no-progress streak (no attempt was ever made)');
});

// ---- S-A-7 --------------------------------------------------------------------
test('S-A-7: all stores unchanged by the correction leg — and unchanged by every non-mutating semantic leg (inference, normalization, planning, acceptance, evaluation)', async ()=>{
  const s=await sGolden();
  const g=s.g;
  // the drift is the ONLY mutation on the timeline (steps 2-5 and 7-14 touch nothing)
  eq(g.creationSnapshot, s.preDriftSnapshot, 'T20 + normalization + planning + acceptance + pre-drift evaluation mutated NOTHING (P1 face over the golden)');
  eq(s.postDriftSnapshot, g.snapshot(), 'the correction leg (critic, loop, re-evaluation) mutated NOTHING — the stores after the run are the post-drift stores');
  // the store content itself is the drifted state (the drift persists honestly, no silent fix)
  eq(g.geomParamsOf(g.objectId).width, 600, 'the drifted width persists');
  eq(g.geomParamsOf(g.objectId).height, 400, 'the drifted height persists');
});

// ============================================================================
// S-B — DRIFT -> NO IMPROVEMENT -> TERMINATION (spec §30 second sequence, §60)
// ============================================================================

// ---- S-B-1 --------------------------------------------------------------------
test('S-B-1: drift -> attempted correction (capability resolution) -> no improvement -> termination/rollback per §30 — the live sequence over the golden', async ()=>{
  const s=await sGolden();
  const g=s.g;
  // the attempted correction: the loop RAN the capability resolution — its
  // record is the NO_CAPABILITY ledger entry (the attempt the frozen loop makes)
  eq(s.finished.refusalLedger.length, 1, 'the correction attempt resolved through the capability table');
  eq(s.finished.refusalLedger[0].reason, 'NO_CAPABILITY', 'the attempt found NO capability (A-9)');
  // no improvement: the re-evaluation after the loop still reports the violation
  eq(s.reEval.status, 'DEVIATION', 'the re-evaluation still deviates (no improvement was possible)');
  eq(s.reEval.metadata.semanticResults[0].status, 'VIOLATED', 'the semantic verdict is unchanged');
  eq(g.geomParamsOf(g.objectId).width, 600, 'the substrate is UNCHANGED by the failed attempt (no silent fix, the L-2 face)');
  // termination
  eq(s.finished.status, 'TERMINATED', 'the loop terminated');
  eq(s.finished.terminationReason, 'UNFIXABLE', 'the §30 termination/rollback branch: UNFIXABLE (nothing to roll back — zero transactions)');
});

// ---- S-B-2 --------------------------------------------------------------------
test('S-B-2: this path IS the S-A path — with zero semantic capability the §30 second sequence always lands on the same honest terminus (structural identity across runs)', async ()=>{
  const a=await sGolden();
  const b=await sGolden();
  eq(CORRECTION_CAPABILITY_RECIPES.filter(r=>r.rootCause==='SEMANTIC_ERROR').length, 0, 'no capability exists — the §30 first sequence (correction -> convergence) is UNREACHABLE for semantic drift');
  eq(sCanonicalize(JSON.stringify(sOutcome(a.finished))), sCanonicalize(JSON.stringify(sOutcome(b.finished))),
    'two §30 second-sequence runs -> identical canonical engine outcomes (the SG-6 projection normalizes the substrate-identity entropy the content-derived ids embed — the R-8 fixed-id stub form needs no such normalization, the LIVE substrate does)');
  eq(a.finished.terminationReason, 'UNFIXABLE', 'the shared terminus: UNFIXABLE');
  expect(a.finished.executedAttempts===0 && b.finished.executedAttempts===0, 'neither run executed an attempt — the terminus required no attempt');
});

// ---- S-B-3 --------------------------------------------------------------------
test('S-B-3: no oscillation — the loop cannot oscillate over a NO_CAPABILITY target (zero iterations, zero attempts, the frozen policy forbids oscillation recovery)', async ()=>{
  const s=await sGolden();
  eq(s.finished.session.iteration, 0, 'zero iterations');
  eq(s.finished.executedAttempts, 0, 'zero attempts');
  deepEq(s.finished.session.visitedStates, ['IDLE'], 'the state trail never left IDLE — no state to oscillate between');
  eq(s.finished.fingerprintTrail.length, 1, 'one fingerprint — no attempt/re-attempt cycle');
  eq(createCorrectionLoopPolicy().allowOscillationRecovery, false, 'the frozen policy defaults forbid oscillation recovery (the §30 convergence model is the engine\'s own)');
});

// ---- S-B-4 --------------------------------------------------------------------
test('S-B-4: the fingerprint trail is bounded — one entry against the frozen policy budget; the ledgers are bounded too', async ()=>{
  const s=await sGolden();
  const policy=createCorrectionLoopPolicy();
  expect(s.finished.fingerprintTrail.length <= policy.maxIterations,
    `the fingerprint trail (${s.finished.fingerprintTrail.length}) is within the policy budget (${policy.maxIterations})`);
  eq(s.finished.fingerprintTrail.length, 1, 'exactly the initial-evaluation fingerprint — the honest path cannot grow the trail');
  eq(s.finished.refusalLedger.length, 1, 'the refusal ledger is bounded (exactly the NO_CAPABILITY record)');
  eq(s.finished.iterationLedger.length, 0, 'the iteration ledger is bounded (zero entries)');
});

// ============================================================================
// S-C — PROPERTY TESTS (spec §39 P1-P10) over the LIVE golden surfaces
// ============================================================================

// ---- S-C-1 (P1) ----------------------------------------------------------------
test('S-C-1: P1 no direct mutation — semantic inference/normalization/planning/acceptance/evaluation mutate NOTHING; the drift transaction is the timeline\'s only writer', async ()=>{
  const s=await sGolden();
  eq(s.g.creationSnapshot, s.preDriftSnapshot, 'every semantic leg (T20, ingest, planner, acceptance, evaluate) left the canonical state byte-identical');
  eq(s.historyAfterDrift, s.g.historyAfterCreation+1, 'the only post-creation store change is the REAL drift transaction');
  eq(s.historyAfterLoop, s.historyAfterDrift, 'and the correction leg added none');
});

// ---- S-C-2 (P2) ----------------------------------------------------------------
test('S-C-2: P2 deterministic normalization — the SAME real T20 envelope normalizes byte-identically in independent sessions; two golden runs normalize identically (modulo substrate identity)', async ()=>{
  const s=await sGolden();
  const a=createInferenceSession(), b=createInferenceSession();
  a.ingest(s.t20); b.ingest(s.t20);
  eq(JSON.stringify(a.getRegistry()), JSON.stringify(b.getRegistry()), 'same input -> byte-identical normalized registries (content-derived ids, no entropy)');
  const other=await sGolden();
  deepEq(
    { role:s.records[0].role, confidence:s.records[0].confidence, source:s.records[0].source, status:s.records[0].status, evidence:s.records[0].evidence },
    { role:other.records[0].role, confidence:other.records[0].confidence, source:other.records[0].source, status:other.records[0].status, evidence:other.records[0].evidence },
    'two independent golden runs normalize the same derivation identically (the raw proposalId/createdAt entropy is stripped, BD-5)');
});

// ---- S-C-3 (P3) ----------------------------------------------------------------
test('S-C-3: P3 unsupported-role refusal — an unsupported role cannot even ENTER the desired state, and cannot become verified even if hand-carried', async ()=>{
  const s=await sGolden();
  // (a) the real-shaped envelope with an unsupported role normalizes to a REFUSAL
  const bad=createInferenceSession().ingest(makeEnvelope([{ ...s.raw, objectId:'obj-s-widget', proposedRole:'widget' }]));
  eq(bad.records.length, 0, 'no record for the unsupported role');
  eq(bad.refusals.length, 1, 'exactly one refusal');
  eq(bad.refusals[0].status, 'REJECTED', 'the refusal is a ledger record (BD-6)');
  // (b) refusals never enter the desired state: an agenda built from refusal-bearing
  // output carries only PROPOSED records — here the refusal produced no record at all
  const ctx=createPlanningContext({ artboard:S_ARTBOARD, objects:{}, semantic:bad.records });
  const planned=createExpectedState(s.g.intent, ctx);
  eq(planned.semantic.expectations.length, 0, 'the unsupported role never entered the desired state');
  // (c) even HAND-CARRIED, an unsupported role can never become SATISFIED/verified
  const handEs=pExpected([{ id:'smr-hand', objectId:s.g.objectId, role:'widget', confidence:0.9, evidence:[], source:'T20', status:'PROPOSED' }]);
  const hand=sEvaluate(s.g, handEs, s.g.docContext);
  eq(hand.metadata.semanticResults[0].status, 'UNSUPPORTED', 'the evaluator honestly reports UNSUPPORTED (never SATISFIED)');
  eq(hand.status, 'PASS', 'and invents no deviation for it (unmeasurable != violated)');
  eq(hand.deviations.length, 0, 'zero deviations');
});

// ---- S-C-4 (P4) ----------------------------------------------------------------
test('S-C-4: P4 provenance preservation — the provenance chain T20 proposal -> record -> sidecar -> loop evidence is verbatim end to end', async ()=>{
  const s=await sGolden();
  eq(s.records[0].source, 'T20', 'the record names the TOOL (the raw proposal names the algorithm — BD-4)');
  deepEq(s.records[0].evidence, s.raw.evidence, 'the record\'s evidence is the raw derivation evidence, verbatim');
  const signal=s.postDrift.metadata.semanticResults.find(r=>r.status==='VIOLATED');
  eq(signal.role, s.records[0].role, 'the sidecar carries the agenda role');
  deepEq(s.target.evidence, [signal], 'the loop\'s agenda target carries the D-1 sidecar record VERBATIM (the R-9 channel)');
  eq(s.finished.refusalLedger[0].details.category, 'SEMANTIC', 'the ledger entry is traceable to the target category');
});

// ---- S-C-5 (P5) ----------------------------------------------------------------
test('S-C-5: P5 confidence preservation — the provided confidence is never silently replaced (no rounding, no clamping, no threshold, no constant)', async ()=>{
  const s=await sGolden();
  expect(typeof s.raw.confidence==='number' && Number.isFinite(s.raw.confidence), 'the engine confidence is a finite number');
  eq(s.records[0].confidence, s.raw.confidence, 'record confidence === raw proposal confidence (verbatim, BD-3)');
  const signal=s.postDrift.metadata.semanticResults.find(r=>r.status==='VIOLATED');
  eq(signal.confidence, s.raw.confidence, 'the D-1 sidecar confidence is verbatim');
  eq(s.target.confidence, s.raw.confidence, 'the loop target confidence is verbatim');
  expect(s.raw.confidence!==1, 'the graded engine value is NOT the critics\' constant-1 (the §2.6 T19/T20 regime contrast)');
});

// ---- S-C-6 (P6) ----------------------------------------------------------------
test('S-C-6: P6 evaluation honesty — unevaluable semantic state can NEVER become satisfied (no provider -> UNEVALUABLE; null provider -> INSUFFICIENT_EVIDENCE; both invent nothing)', async ()=>{
  const s=await sGolden();
  // no provider: the arm cannot measure — it says so, and invents nothing
  const noProvider=evaluate(s.es, s.g.docContext, { targets:[{ objectId:s.g.objectId, targetRef:'$doc:'+s.g.objectId }] });
  eq(noProvider.metadata.semanticResults[0].status, 'UNEVALUABLE', 'no provider -> UNEVALUABLE');
  eq(noProvider.metadata.semanticResults[0].reason, 'NO_ROLE_PROVIDER', 'the deterministic reason');
  eq(noProvider.status, 'PASS', 'unmeasurable is NOT satisfied and NOT violated');
  eq(noProvider.deviations.length, 0, 'zero invented deviations');
  // a provider with no observation: INSUFFICIENT_EVIDENCE, same honesty
  const nullProvider=sEvaluate(s.g, s.es, s.g.docContext, () => null);
  eq(nullProvider.metadata.semanticResults[0].status, 'INSUFFICIENT_EVIDENCE', 'null observation -> INSUFFICIENT_EVIDENCE');
  eq(nullProvider.status, 'PASS', 'still no invention');
  eq(nullProvider.deviations.length, 0, 'zero invented deviations');
});

// ---- S-C-7 (P7) ----------------------------------------------------------------
test('S-C-7: P7 correction verification — nothing is accepted without post-mutation evaluation: the loop\'s ONLY world view is the critic\'s post-drift evaluation, and it executed nothing', async ()=>{
  const s=await sGolden();
  eq(s.getCriticCalls(), 1, 'exactly ONE critic consultation (the post-mutation evaluation, engineStart)');
  eq(s.getLastEvaluation().status, 'DEVIATION', 'that consultation observed the REAL drifted document');
  deepEq(s.finished.session.currentEvaluation, s.getLastEvaluation(), 'session.currentEvaluation deep-equals the critic\'s post-drift evaluation (FD-7 world view)');
  deepFrozen(s.finished.session.currentEvaluation, 'session.currentEvaluation');
  eq(s.finished.executedAttempts, 0, 'zero attempts — no correction was accepted (or executed) without verification, because none existed');
});

// ---- S-C-8 (P8) ----------------------------------------------------------------
test('S-C-8: P8 rollback safety — the pre-attempt state persists untouched (zero attempts -> zero rollbacks needed); the frozen rollback policy exists but was never triggered', async ()=>{
  const s=await sGolden();
  eq(createCorrectionLoopPolicy().rollbackOnCriticalRegression, true, 'the frozen policy WOULD roll back a critical regression (the safety net exists)');
  eq(s.postDriftSnapshot, s.g.snapshot(), 'the post-loop state IS the pre-attempt state (nothing to restore — the honest identity)');
  const entries=s.g.historyManager.getAll();
  expect(entries.every(t=>!String(t.id).startsWith('atx-')), 'no attempt transaction exists in the history (the §32 undo pointer was never reached)');
  eq(entries.length, s.g.historyAfterCreation+1, 'the history is exactly creations + drift — no attempt, no rollback, no undo');
});

// ---- S-C-9 (P9) ----------------------------------------------------------------
test('S-C-9: P9 linear history — the golden\'s history is a strictly append-only sequence; the loop appended nothing (no History DAG, Invariant 13)', async ()=>{
  const s=await sGolden();
  const entries=s.g.historyManager.getAll();
  eq(entries.length, s.g.historyAfterCreation+1, 'creations + drift, exactly');
  eq(new Set(entries.map(t=>t.id)).size, entries.length, 'unique ids — a linear sequence, no branch points');
  eq(s.historyAfterLoop, s.historyBeforeLoop, 'the correction leg appended ZERO history entries');
  eq(s.finished.session.corrections.length, 0, 'zero corrections in the session history');
});

// ---- S-C-10 (P10) ---------------------------------------------------------------
test('S-C-10: P10 planner purity — planning over the golden records mutates NO canonical state; the context is deep-frozen; the plan carries the agenda', async ()=>{
  const s=await sGolden();
  const g=s.g;
  const before=g.snapshot();
  const ctx=createPlanningContext({ artboard:S_ARTBOARD, objects:{}, semantic:s.records });
  const plan=createPlan(g.intent, ctx);
  const after=g.snapshot();
  eq(before, after, 'createPlanningContext + createPlan mutated NOTHING');
  deepFrozen(ctx, 'ctx');
  eq(validatePlanStructure(plan).valid, true, 'the semantic-bearing plan is structurally valid');
  deepEq(plan.expectedState.semantic.expectations, s.records, 'the plan carries the accepted expectations verbatim');
});

// ============================================================================
// S-D — ARCHITECTURE SCANS (spec §40) over the 3.17 surface (SG-7 scope)
// ============================================================================

const S_MUT_RE=/\.(write|set|execute|commit|rollback|register|unregister|insert|remove|update|delete|create|render|invalidate)\s*\(/g;
const S_PURE=['semantic-inference.js','ai.js','evaluation.js','critic.js']; // the arms are pure; correction.js is the frozen EXECUTOR (SG-7)

// ---- S-D-1 --------------------------------------------------------------------
test('S-D-1: no filesystem access anywhere in the 3.17 surface (stripped bodies: no fs word, no require, no node: specifier; every static import relative; correction.js has ZERO imports)', ()=>{
  for(const f of S_SURFACE){
    eq(sWordHits(S_STRIPPED[f], 'fs').join(','), '', `${f}: no fs word in the code body`);
    eq(sWordHits(S_STRIPPED[f], 'require').join(','), '', `${f}: no require in the code body`);
    expect(!/node:/.test(S_STRIPPED[f]), `${f}: no node: specifier in the code body`);
  }
  for(const f of S_SURFACE){
    const specs=sProductionImportSpecifiers(S_SRC[f]);
    for(const s of specs) expect(s.startsWith('./')||s.startsWith('../'), `${f}: import '${s}' is relative`);
  }
  eq(sProductionImportSpecifiers(S_SRC['semantic-inference.js']).length, 0, 'semantic-inference.js carries ZERO imports (BD-7, strictly stronger)');
  expect(!/^import\b/m.test(S_SRC['correction.js']), 'correction.js carries ZERO static imports (the R-12 pin, strictly stronger)');
});

// ---- S-D-2 --------------------------------------------------------------------
test('S-D-2: no network access anywhere in the 3.17 surface (stripped bodies: no fetch / XMLHttpRequest / WebSocket / raw URL)', ()=>{
  for(const f of S_SURFACE){
    for(const w of ['fetch','XMLHttpRequest','WebSocket']){
      eq(sWordHits(S_STRIPPED[f], w).join(','), '', `${f}: no ${w}`);
    }
    expect(!/https?:\/\//.test(S_STRIPPED[f]), `${f}: no raw URL in the code body`);
  }
});

// ---- S-D-3 --------------------------------------------------------------------
test('S-D-3: no LLM calls anywhere in the 3.17 surface (stripped bodies: no openai / anthropic / llm / completion / embedding / api_key vocabulary — correction.js\'s comment-prose tokens strip to zero)', ()=>{
  const llmWords=['openai','anthropic','llm','completion','completions','embedding','api_key','apikey'];
  for(const f of S_SURFACE){
    for(const w of llmWords){
      eq(sWordHits(S_STRIPPED[f], w).join(','), '', `${f}: no ${w} in the code body`);
    }
  }
  for(const s of sImportSpecifiers(S_TEST_SRC)){
    expect(!/openai|anthropic|sdk/i.test(s), `the test file imports '${s}' — no AI-vendor SDK`);
  }
});

// ---- S-D-4 --------------------------------------------------------------------
test('S-D-4: no direct Store mutation in the 3.17 surface — the four PURE files carry no mutation-call form and no store/SceneGraph construction; the Correction leg is proven behaviorally (S-A-5/S-A-7: zero transactions, zero store deltas)', ()=>{
  for(const f of S_PURE){
    const mut=[...S_STRIPPED[f].matchAll(S_MUT_RE)].map(m=>m[0]);
    eq(mut.join(','), '', `${f}: no mutation-method call form in the code body`);
    for(const w of ['new ConstraintStore','new SceneGraph','new GeometryStore','new AppearanceStore','new ObjectStore','new SemanticStore']){
      expect(!S_STRIPPED[f].includes(w), `${f}: no store construction (${w})`);
    }
  }
});

// ---- S-D-5 --------------------------------------------------------------------
test('S-D-5: no direct History mutation in the 3.17 surface — no HistoryManager vocabulary in the four PURE files; the engine\'s frozen rollback-pointer probe is read-only and was never reached (S-A-6: zero appends)', ()=>{
  for(const f of S_PURE){
    for(const w of ['HistoryManager','historyManager']){
      eq(sWordHits(S_STRIPPED[f], w).join(','), '', `${f}: no ${w}`);
    }
    expect(!/\bDAG\b/.test(S_STRIPPED[f]), `${f}: no DAG vocabulary`);
  }
});

// ---- S-D-6 --------------------------------------------------------------------
test('S-D-6: no nested transactions in the 3.17 surface — no begin-call form in the four PURE files; every golden transaction is a root transaction (parentId null) and the loop opened none', async ()=>{
  for(const f of S_PURE){
    const begins=[...S_STRIPPED[f].matchAll(/\bbegin\s*\(/g)].map(m=>m[0]);
    eq(begins.join(','), '', `${f}: no transaction-begin call`);
  }
  const s=await sGolden();
  const entries=s.g.historyManager.getAll();
  expect(entries.every(t=>!t.parentId), 'every golden transaction is a root transaction (no nesting, no parent chaining)');
  eq(s.historyAfterLoop, s.historyBeforeLoop, 'the loop opened none');
});

// ---- S-D-7 --------------------------------------------------------------------
test('S-D-7: no new runtime dependencies — package.json is byte-identical to HEAD; the 3.17 production files import only relative specifiers; the test file imports only relative modules and the three declared node: builtins', ()=>{
  const headPkg=execFileSync('git', ['show', 'HEAD:package.json'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  const pkg=readFileSync(new URL('../package.json', import.meta.url), 'utf-8');
  eq(pkg, headPkg, 'package.json is UNCHANGED (no dependencies, zero added)');
  const specs=sImportSpecifiers(S_TEST_SRC);
  expect(specs.length>10, 'the import sweep is non-vacuous');
  for(const s of specs){
    expect(s.startsWith('./')||s.startsWith('../')||['node:fs','node:child_process','node:url'].includes(s),
      `the test file imports '${s}' — only relative src-js modules and the three declared node builtins are allowed`);
  }
});

// ---- S-D-8 --------------------------------------------------------------------
test('S-D-8: src/core is UNCHANGED — zero git deltas over the frozen core tree; the frozen 3.17 boundary files (correction/constraints/transaction/tools/semantic) are equally untouched', ()=>{
  const statusCore=execFileSync('git', ['status', '--porcelain', '--', 'src/core'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(statusCore, '', 'git status over src/core is EMPTY');
  const diffCore=execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'src/core'], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(diffCore, '', 'git diff over src/core is EMPTY');
  const frozen=['src-js/correction.js','src-js/constraints.js','src-js/transaction.js','src-js/tools.js','src-js/semantic.js'];
  const diffFrozen=execFileSync('git', ['diff', '--stat', 'HEAD', '--', ...frozen], { cwd: O_REPO_ROOT, encoding: 'utf-8' });
  eq(diffFrozen, '', 'the frozen src-js boundary is byte-identical to HEAD');
});

// ---- H-1 (H-15 README pin; the 3.16 M-18 mirror) -----------------------------
// spec §46 requires the module README when the repository convention demands
// one — the 3.14/3.15/3.16 precedent DOES (evaluation.README.md,
// correction.README.md, constraint-inference.README.md). This test pins the
// README's existence AND its 14-topic coverage so the documentation cannot
// silently regress. The §93-precedent topic list is adapted to 3.17:
// 'T19 role' -> 'T20 role', 'Constraint vocabulary' -> 'Semantic vocabulary',
// 'Hard/soft semantics' -> 'Satisfied/unsupported semantics' (the honest
// status semantics this phase documents). RED-first evidence:
// scripts/phase3.17-evidence/3.17-H1-m18-red.txt (97 total, this test the
// ONLY failure, captured before the README existed).
const README_TOPICS = Object.freeze([
  'Mission', 'T20 role', 'Proposal lifecycle', 'Semantic vocabulary',
  'Planner integration', 'Evaluation integration', 'Critic integration',
  'Correction integration', 'Satisfied/unsupported semantics', 'Transaction boundary',
  'History linearity', 'Determinism', 'Failure behavior', 'Known limitations'
]);
test('H-1: src-js/semantic-inference.README.md exists and covers the 14 spec §93-precedent topics (the DoD documentation pin, the 3.16 M-18 mirror)', ()=>{
  const readme = readFileSync(new URL('../src-js/semantic-inference.README.md', import.meta.url), 'utf-8');
  expect(readme.length > 1000, 'the README is a real document, not a stub');
  for(const topic of README_TOPICS){
    expect(readme.includes(topic), `the README is missing the spec §93-precedent topic: ${topic}`);
  }
  expect(readme.includes('semantic-inference.js'), 'the README names its module');
});

// --- summary (house protocol) -------------------------------------------------
Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
