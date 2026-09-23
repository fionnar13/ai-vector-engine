// PHASE 3.15 — CHECKPOINT A tests (spec §3-§10, §18, §44, §50; Working Discipline 2/8/9).
// Harness mirrors tests/ai.test.mjs + tests/evaluation-critic.test.mjs (counted-suite
// protocol: final "Tests: N total, M passed, F failed" line, exit 1 on failure).
//
// Scope (Checkpoint A): the Correction Loop Engine core data structures and the
// §3/§5 state machine — CorrectionLoopSession (§4), CorrectionAttempt (§6),
// CorrectionTarget (§7), CorrectionDiagnosis (§8), CorrectionStrategy (§9),
// CorrectionPlan (§10), CorrectionLoopPolicy (§18), CorrectionTerminationReason
// (§50), and the transition/validation machinery over them. All structures are
// deep-frozen plain data with content-derived ids (§44 determinism; the
// fnv1a32/stableStringify house discipline from ai.js/evaluation.js/critic.js).
//
// Invariants under test:
//   - The §5 state vocabulary is exactly 11 states; the §50 termination
//     vocabulary is exactly 9 reasons; §6 attempt statuses are exactly 7;
//     §7 target categories are exactly 11; §8 root causes are exactly 10.
//   - The §3 transition graph: the eleven literal §3 edges (ROLLBACK spelled
//     ROLLING_BACK per §5) plus five spec-derived completion edges, each
//     disclosed in the module header (EVALUATING→VERIFIED per §17,
//     RE_EVALUATING→DIAGNOSING per the §0/§16/§17 iteration cycle,
//     ROLLING_BACK→DIAGNOSING per §69 correction-#2-retry,
//     ROLLING_BACK→TERMINATED, VERIFIED→TERMINATED per §4/§50 formal close).
//   - Every structure is produced deep-frozen, plain-data-only (function values
//     rejected at construction and validation), JSON round-trip lossless, and
//     deterministically identified: same content => same id, any content change
//     => different id (§44; house §12/§22 pattern).
//   - transitionSession returns a NEW frozen session (session records are
//     immutable events; the trail grows in visitedStates; iteration is NOT
//     touched by transitions — the engine checkpoints own iteration semantics).
//   - TERMINATED carries a mandatory §50 reason (both directions, mirroring the
//     §12 gate-5 status/length discipline of evaluation.js): a session may only
//     reach TERMINATED through terminateSession(session, reason); the §3
//     RE_EVALUATING→TERMINATED edge stays a legal canTransition edge while the
//     reasonless direct jump is refused with INVALID_TERMINATION.
//   - Policy defaults are exactly the §18 implementation defaults
//     (5 / 3 / 0.01 / 0.05 / false / true / true).
//
// STUB-KILL design (Checkpoint A directive: "stub-kill proof for the state
// machine"): three kills with EXACT-MATCH predicted failing sets, disjoint by
// construction:
//   KILL-1 canTransition neutered (always true)  -> {A-22, A-25, A-31}
//   KILL-2 visitedStates append removed          -> {A-23, A-24, A-27}
//   KILL-3 termination reason discipline removed -> {A-19, A-30}
//
// CHECKPOINT B scope (spec §8/§9/§19/§20/§27/§28/§38): diagnosis resolution
// (CorrectionTarget -> CorrectionDiagnosis: the category→rootCause table,
// affectedObjects, capability-grounded recommendedStrategies, deterministic
// confidence), §28 no-fabrication (NO_CAPABILITY resolutions — Checkpoint A's
// accepted contract keeps recommendedStrategies NON-EMPTY on diagnoses, so
// the no-capability path is a distinct resolution record, never a bare
// diagnosis), §20 CorrectionImpact, §38 CorrectionCost, §19 deterministic
// strategy ranking (Priority = Severity × Confidence × Impact ×
// Correctability), §27 explainability. Tests B-1..B-25 are appended to the
// SAME counted suite. Strategy grounding is verified against the LIVE
// tools.js registry (the 3.14 Checkpoint C discipline: corrections map to
// real capabilities or they are not proposed).
//
// STUB-KILL design (Checkpoint B directive: diagnosis mapping + strategy
// ranking). The sets OVERLAP by design — B-16/B-21/B-22/B-23 deliberately
// exercise the integrated resolve→rank→explain flow, so they are sensitive to
// both kill sites; each kill's failed set is still an EXACT-MATCH prediction.
// KILL-B1's prediction was self-corrected from {B-4..B-8, B-11, B-16, B-23,
// B-25} to include B-21/B-22 (the battery's run-1 mismatch evidence is
// preserved as 3.15-B-stubkill-run1-prediction-mismatch.txt):
//   KILL-B1 category→rootCause mapping neutered (resolver returns UNKNOWN;
//           every resolution becomes NO_CAPABILITY)
//                                              -> {B-4, B-5, B-6, B-7, B-8, B-11, B-16, B-21, B-22, B-23, B-25}
//   KILL-B2 §19 priority formula neutered (constant 1)
//                                              -> {B-16, B-17, B-19, B-23}
//
// CHECKPOINT C scope (spec §10/§11/§35/§36/§37/§40/§41/§42/§43): CorrectionPlan
// GENERATION — given target + diagnosis + selected strategy the planner
// materializes factory-mirroring command descriptors (layered derivation:
// CARRIED when the strategy input already satisfies the capability input
// contract; DERIVED where target evidence deterministically yields the missing
// parameters — T05 axis delta (§43's own "Move +10px -> position delta"
// example; T07 opacity; refused otherwise, never fabricated), the §41
// dependency scan (affected objects -> dependencies -> constraints -> semantic
// relationships, injected duck-typed context, partial-scan honesty flags), the
// §35-§37 planning-time safety gate (hard/required constraints are MANDATORY:
// a predicted axis conflict REJECTS the plan with the exact §35
// ConstraintCorrectionContext; soft constraints trade off and are recorded),
// §40 scope containment, and the §42 CorrectionPreview dry-run record with a
// §43 RULE_BASED expectedEvaluation. NO §14 acceptance is implemented here —
// acceptance belongs to Checkpoint D (the planning surface exports no
// acceptance API, C-20 pins the boundary).
//
// STUB-KILL design (Checkpoint C directive: planning + hard-constraint
// rejection). The sets are DISJOINT by design (the B rationale: gate/generator
// tests that assert rejection or trade-off evidence use hand-built CARRIED
// strategies with explicit deltas, so they stay independent of the deriver —
// mirroring how B's ranking tests stayed independent of the resolver):
//   KILL-C1 derivation engine neutered (deriver returns the strategy input
//           as-is — CARRIED always; never derives, never refuses)
//                                              -> {C-1, C-2, C-3, C-4, C-10, C-13, C-18, C-19}
//   KILL-C2 hard-constraint rejection removed (hard conflicts classified as
//           soft trade-offs; gate never REJECTS)
//                                              -> {C-8, C-12}
//
// CHECKPOINT D scope (spec §11/§12/§14/§15/§16/§30/§31/§32/§33/§47/§48):
// execution + transaction. A CorrectionPlan executes as ONE INDEPENDENT
// substrate transaction per attempt — TransactionBuilder.begin({id}) with a
// content-derived 'atx-' id — whose Commands route the plan descriptors
// through the LIVE tools (pre-flight registry validation: unregistered tools
// and live-validator failures are honest EXECUTION_REFUSED records; runtime
// failures fail the transaction ATOMICALLY — stores untouched, nothing
// pushed). §14 acceptance (post > pre on the plan metric over deviation
// evidence, §15 critical-regression gate, structural validity, transaction
// validity), §15 RegressionReport (identity = category|property|objectId;
// content ids separate), §16 best-state preservation (deterministic total
// order — the loop never assumes last is best), §30 CorrectionFingerprint +
// evaluation fingerprint, §33 no-progress SKIP (same fingerprint + Δ=0),
// §31 oscillation (fingerprint recurrence), §32 rollback through the
// substrate's OWN undo API (command-inverse preferred — exact T05
// translation negation; snapshot fallback for non-invertible corrections)
// with a top-of-history guard, §47/§48 session-local history metadata with
// the HistoryManager UNTOUCHED and LINEAR (invariant 13). C-20 evolves with
// D (the approved C-20 boundary ruling anticipated this): the C-era
// module-level no-acceptance guard becomes the exact D acceptance export set
// plus a function-level planning-boundary check.
//
// STUB-KILL design (Checkpoint D directive: execution, acceptance policy,
// rollback). Sets OVERLAP where integrated tests deliberately span sites
// (the B rationale — the integrated chain exercises the whole pipe):
//   KILL-D1 execution neutered (no preflight, no transaction built or
//           executed; a fabricated deterministic EXECUTED projection)
//                                                      -> {D-4, D-5, D-6, D-7,
//           D-8, D-9, D-10, D-12, D-18, D-19, D-20}
//           (D-20: its rollback throws when nothing is top-of-history)
//   KILL-D2 acceptance policy neutered (verdict always ACCEPTED, every
//           criterion forced met)                     -> {D-13, D-14, D-15, D-19}
//   KILL-D3 rollback neutered (substrate undo skipped; ROLLED_BACK reported
//           anyway)                                   -> {D-8, D-9, D-19}

import { createCorrectionLoopPolicy, validateCorrectionLoopPolicy,
  CORRECTION_LOOP_STATES, CORRECTION_LOOP_TRANSITIONS,
  CORRECTION_ATTEMPT_STATUSES, CORRECTION_TARGET_CATEGORIES, CORRECTION_SEVERITIES,
  CORRECTION_DIAGNOSIS_ROOT_CAUSES, CORRECTION_STRATEGY_RISKS,
  CORRECTION_TERMINATION_REASONS,
  CorrectionErrorCodes, CorrectionError,
  createCorrectionTarget, validateCorrectionTarget,
  createCorrectionDiagnosis, validateCorrectionDiagnosis,
  createCorrectionStrategy, validateCorrectionStrategy,
  createCorrectionPlan, validateCorrectionPlan,
  createCorrectionAttempt, validateCorrectionAttempt,
  createCorrectionLoopSession, validateCorrectionLoopSession,
  canTransition, transitionSession, terminateSession,
  CATEGORY_TO_ROOT_CAUSE, CORRECTION_CAPABILITY_RECIPES,
  CORRECTION_SEVERITY_WEIGHTS, CORRECTION_SCOPE_WEIGHT,
  resolveCorrectionDiagnosis, resolveCorrectionDiagnoses,
  computeCorrectionImpact, computeCorrectionCost,
  rankCorrectionStrategies, explainCorrectionDiagnosis,
  explainCorrectionStrategySelection,
  CORRECTION_CAPABILITY_INPUT_CONTRACT, CONSTRAINT_PINNED_AXES, TOOL_MUTATION_AXES,
  PLAN_REFUSAL_REASONS,
  deriveCorrectionCommands, scanCorrectionDependencies,
  evaluateCorrectionSafety, verifyCorrectionScope,
  generateCorrectionPlan, buildCorrectionPreview,
  // Checkpoint D — execution + transaction (§11/§12/§14/§15/§16/§30-§33/§47/§48)
  computeCorrectionFingerprint, computeEvaluationFingerprint,
  executeCorrectionAttempt, acceptCorrectionAttempt, rollbackCorrectionAttempt,
  detectCorrectionRegression, isBetterEvaluation, preserveCorrectionBestState,
  detectCorrectionNoProgress, detectCorrectionOscillation, shouldSkipCorrection,
  buildCorrectionHistoryMetadata,
  CORRECTION_VERDICTS, CORRECTION_REJECTION_REASONS,
  CORRECTION_EXECUTION_REFUSALS,
  // Checkpoint E — re-evaluation + convergence (§3/§17/§22-§26)
  CorrectionEngine, CORRECTION_LOOP_MODES, CORRECTION_ENGINE_STATUSES,
  CORRECTION_ENGINE_OPERATIONS, CORRECTION_ENGINE_ACTIONS, CORRECTION_MODE_DISPATCH,
  CORRECTION_CONVERGENCE_KINDS, validateCorrectionLoopRequest, detectCorrectionConvergence } from '../src-js/correction.js';
// Checkpoint B grounding proof: the capability table is verified against the
// LIVE tool registry (tests may import the registry; the module itself stays
// zero-import by its pinned contract).
import { ToolRegistry, registerCoreTools } from '../src-js/tools.js';
// Checkpoint C grounding proof: every plan command kind must map to a REAL
// transaction.js command factory export (the §11 command architecture —
// CorrectionPlan -> Command -> Transaction -> SceneGraph).
import * as transactionNS from '../src-js/transaction.js';
// Checkpoint C boundary proof (C-20): the export surface carries NO acceptance
// API — §14 acceptance belongs to Checkpoint D.
import * as correctionNS from '../src-js/correction.js';
// Checkpoint D: the LIVE substrate is bound at the call site (the module
// itself stays zero-import — the injected duck-typed substrate discipline).
import { TransactionBuilder, TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';
import { SceneGraph } from '../src-js/scenegraph.js';
// Checkpoint E grounding proof: the LIVE §12 evaluation authority satisfies the
// §23 critic duck-type the engine consumes (the module itself stays zero-import).
import { evaluate as liveEvaluate, validateEvaluationResult as liveValidateEvaluationResult,
  buildActualState as gBuildActualState, createEvaluationResult as gCreateEvaluationResult,
  EVALUATION_TOLERANCES as G_TOLERANCES } from '../src-js/evaluation.js';
// Checkpoint F grounding: the §58 pipeline harness pieces (the 3.14 vertical
// slice assembly — real stores, real Planner, real DSL executor) and the
// renderer purity surface (§60-P3). The test suite is the composition layer;
// no src-js/ file is modified by Checkpoint F.
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { createPlanningContext as gPlanningContext, createExpectedState as gCreateExpectedState,
  createPlan as gCreatePlan, validatePlan as gValidatePlan, compilePlanToDSL } from '../src-js/ai.js';
import { parseDSL, validateDSL, compileToIR, DSLExecutor } from '../src-js/dsl.js';
import { RenderTreeBuilder } from '../src-js/renderer.js';

let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function deepEq(a,b,msg){ const x=JSON.stringify(a), y=JSON.stringify(b); if(x!==y) throw new Error(`${msg||'deepEq failed'}: ${x} !== ${y}`); }
function throwsWithCode(fn, code, msg){
  let threw=null;
  try{ fn(); }catch(e){ threw=e; }
  expect(threw, `${msg||'expected throw'}: nothing was thrown`);
  expect(threw instanceof CorrectionError, `${msg||'expected CorrectionError'}: got ${threw && threw.constructor && threw.constructor.name}: ${threw}`);
  eq(threw.code, code, `${msg||'error code'} — message: ${threw.message}`);
}
function deepFrozen(value, path){
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `deep-frozen violated at ${path||'(root)'}`);
  for (const k of Object.keys(value)) deepFrozen(value[k], `${path||'(root)'}.${k}`);
}

// ---------------------------------------------------------------------------
// Fixtures: minimal valid content builders. Evaluations are EvaluationResult-
// shaped plain records (the §4 fields hold evaluation objects; Checkpoint A
// shape-guards them as plain data — the full §12 authority stays in
// evaluation.js by design, see module header).
// ---------------------------------------------------------------------------

const EVAL_BEFORE = Object.freeze({ status: 'DEVIATION', deviations: [
  { id: 'dev-fix1', category: 'geometry', property: 'geometry.width', expected: 100, actual: 120, delta: 20, tolerance: 0.000000001, severity: 'error', objectId: 'obj-1', targetRef: '$step-1', message: 'width deviation' }
]});
const EVAL_AFTER = Object.freeze({ status: 'PASS', deviations: [] });

function targetContent(over={}){
  return { category: 'ALIGNMENT', objectIds: ['obj-1', 'obj-2'], metric: 'alignment.deviation.px',
    observedValue: 14.2, targetValue: 0, severity: 'HIGH', confidence: 0.9,
    evidence: [{ type: 'METRIC', source: 'evaluation', objectIds: ['obj-1'], value: 14.2 }], ...over };
}
function diagnosisContent(over={}){
  return { targetId: 'PLACEHOLDER', rootCause: 'POSITION_ERROR', confidence: 0.85,
    affectedObjects: ['obj-1'], recommendedStrategies: [{ name: 'align-center', risk: 'LOW' }], ...over };
}
function strategyContent(over={}){
  return { name: 'align-center-horizontal', applicableTo: ['ALIGNMENT', 'POSITION'],
    commands: [{ kind: 'AlignObjects', axis: 'horizontal', mode: 'center' }],
    expectedEffect: { alignment: 'decrease toward 0' }, risk: 'LOW', reversible: true, confidence: 0.9, ...over };
}
function planContent(over={}){
  const d = over.__diagnosis || createCorrectionDiagnosis(diagnosisContent({ targetId: 'ctarget-x' }));
  const s = over.__strategy || createCorrectionStrategy(strategyContent());
  const rest = { ...over }; delete rest.__diagnosis; delete rest.__strategy;
  return { sessionId: 'loop-x', diagnosis: d, strategy: s,
    commands: [{ kind: 'AlignObjects', axis: 'horizontal', mode: 'center', objectIds: ['obj-1','obj-2'] }],
    expectedImprovement: { metric: 'alignment.deviation.px', from: 14.2, to: 0 },
    riskAssessment: { level: 'LOW', reversible: true },
    preconditions: [{ kind: 'objects-exist', objectIds: ['obj-1','obj-2'] }],
    postconditions: [{ kind: 'metric-below', metric: 'alignment.deviation.px', value: 1 }],
    ...rest };
}
function attemptContent(over={}){
  const t = over.__target || createCorrectionTarget(targetContent());
  const p = over.__plan || createCorrectionPlan(planContent({ sessionId: 'loop-x' }));
  const rest = { ...over }; delete rest.__target; delete rest.__plan;
  return { iteration: 1, target: t, plan: p, transactionId: 'tx-attempt-1',
    beforeEvaluation: EVAL_BEFORE, status: 'PROPOSED', ...rest };
}
function sessionContent(over={}){
  return { rootIntentId: 'intent-abc123', rootTransactionId: 'tx-root-1',
    maxIterations: 5, initialEvaluation: EVAL_BEFORE, ...over };
}

// ---------------------------------------------------------------------------
// Vocabularies (§5, §50, §6, §7, §8, §9)
// ---------------------------------------------------------------------------

test('A-1: §5 state vocabulary — exactly the 11 CorrectionLoopState values, frozen (spec §5)', ()=>{
  deepEq([...CORRECTION_LOOP_STATES], ['IDLE','PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','VERIFIED','ROLLING_BACK','TERMINATED'], 'state vocabulary');
  eq(CORRECTION_LOOP_STATES.length, 11, 'exactly 11 states');
  expect(Object.isFrozen(CORRECTION_LOOP_STATES), 'vocabulary frozen');
});

test('A-2: §50 termination vocabulary — exactly the 9 CorrectionTerminationReason values, frozen', ()=>{
  deepEq([...CORRECTION_TERMINATION_REASONS], ['VERIFIED','MAX_ITERATIONS_REACHED','NO_PROGRESS','OSCILLATION_DETECTED','UNFIXABLE','EXECUTION_ERROR','CONSTRAINT_BLOCKED','SEMANTIC_BLOCKED','USER_CANCELLED'], 'termination vocabulary');
  eq(CORRECTION_TERMINATION_REASONS.length, 9, 'exactly 9 reasons');
  expect(Object.isFrozen(CORRECTION_TERMINATION_REASONS), 'vocabulary frozen');
});

test('A-3: §6 attempt status vocabulary — exactly the 7 CorrectionAttempt.status values, frozen', ()=>{
  deepEq([...CORRECTION_ATTEMPT_STATUSES], ['PROPOSED','EXECUTED','IMPROVED','REGRESSED','NO_EFFECT','FAILED','ROLLED_BACK'], 'attempt statuses');
  eq(CORRECTION_ATTEMPT_STATUSES.length, 7, 'exactly 7 statuses');
  expect(Object.isFrozen(CORRECTION_ATTEMPT_STATUSES), 'vocabulary frozen');
});

test('A-4: §7 target category + severity vocabularies — exactly 11 categories and 4 severities, frozen', ()=>{
  deepEq([...CORRECTION_TARGET_CATEGORIES], ['GEOMETRY','ALIGNMENT','SPACING','SYMMETRY','SIZE','POSITION','APPEARANCE','SEMANTIC','CONSTRAINT','TEXT','STRUCTURE'], 'target categories');
  eq(CORRECTION_TARGET_CATEGORIES.length, 11, 'exactly 11 categories');
  deepEq([...CORRECTION_SEVERITIES], ['LOW','MEDIUM','HIGH','CRITICAL'], 'severities (§7/§15)');
  expect(Object.isFrozen(CORRECTION_TARGET_CATEGORIES) && Object.isFrozen(CORRECTION_SEVERITIES), 'vocabularies frozen');
});

test('A-5: §8 root-cause + §9 risk vocabularies — exactly 10 root causes and 3 risks, frozen', ()=>{
  deepEq([...CORRECTION_DIAGNOSIS_ROOT_CAUSES], ['POSITION_ERROR','SIZE_ERROR','TRANSFORM_ERROR','SPACING_ERROR','ALIGNMENT_ERROR','STYLE_ERROR','STRUCTURAL_ERROR','SEMANTIC_ERROR','CONSTRAINT_VIOLATION','UNKNOWN'], 'root causes');
  eq(CORRECTION_DIAGNOSIS_ROOT_CAUSES.length, 10, 'exactly 10 root causes');
  deepEq([...CORRECTION_STRATEGY_RISKS], ['LOW','MEDIUM','HIGH'], 'strategy risks');
  expect(Object.isFrozen(CORRECTION_DIAGNOSIS_ROOT_CAUSES) && Object.isFrozen(CORRECTION_STRATEGY_RISKS), 'vocabularies frozen');
});

// ---------------------------------------------------------------------------
// Policy (§18)
// ---------------------------------------------------------------------------

test('A-6: createCorrectionLoopPolicy() — the §18 implementation defaults are EXACT, deep-frozen, and validator-accepted', ()=>{
  const p = createCorrectionLoopPolicy();
  deepEq({ ...p }, { maxIterations: 5, maxCorrectionsPerIteration: 3, minimumImprovement: 0.01,
    maximumRegression: 0.05, allowOscillationRecovery: false, preserveBestState: true,
    rollbackOnCriticalRegression: true }, '§18 defaults');
  expect(Object.isFrozen(p), 'policy frozen');
  expect(validateCorrectionLoopPolicy(p).valid, 'defaults validate');
});

test('A-7: createCorrectionLoopPolicy(partial) merges over defaults; validator enforces types and bounds', ()=>{
  const p = createCorrectionLoopPolicy({ maxIterations: 2, minimumImprovement: 0.5 });
  eq(p.maxIterations, 2, 'override applied');
  eq(p.minimumImprovement, 0.5, 'override applied');
  eq(p.maxCorrectionsPerIteration, 3, 'untouched default retained');
  eq(p.preserveBestState, true, 'untouched default retained');
  expect(validateCorrectionLoopPolicy(p).valid, 'merged policy validates');
  const bad = [
    { maxIterations: 0 }, { maxIterations: 2.5 }, { maxCorrectionsPerIteration: -1 },
    { minimumImprovement: -0.01 }, { maximumRegression: 'wide' },
    { preserveBestState: 1 }, { rollbackOnCriticalRegression: null }, { allowOscillationRecovery: 'yes' }
  ];
  for (const over of bad){
    const q = createCorrectionLoopPolicy(over);
    const check = validateCorrectionLoopPolicy(q);
    expect(!check.valid, `expected rejection for override ${JSON.stringify(over)}`);
  }
  const missing = { ...p }; delete missing.maxIterations;
  expect(!validateCorrectionLoopPolicy(missing).valid, 'missing field rejected');
});

// ---------------------------------------------------------------------------
// CorrectionTarget (§7)
// ---------------------------------------------------------------------------

test('A-8: CorrectionTarget — deterministic content-derived id, deep-frozen, JSON round-trip lossless, validator accepts', ()=>{
  const t1 = createCorrectionTarget(targetContent());
  const t2 = createCorrectionTarget(targetContent());
  expect(t1.id.startsWith('ctarget-'), `id prefix, got ${t1.id}`);
  eq(t1.id, t2.id, 'same content => same id (§44)');
  const t3 = createCorrectionTarget(targetContent({ observedValue: 15 }));
  expect(t1.id !== t3.id, 'content change => different id');
  deepFrozen(t1, 'target');
  const rt = JSON.parse(JSON.stringify(t1));
  deepEq(rt, { ...t1 }, 'JSON round-trip lossless');
  expect(validateCorrectionTarget(rt).valid, 'round-tripped target validates');
  expect(validateCorrectionTarget(t1).valid, 'fresh target validates');
  eq(t1.objectIds.length, 2, 'objectIds retained');
});

test('A-9: CorrectionTarget validation — mandatory fields, enums, confidence range, plain-data-only', ()=>{
  throwsWithCode(()=>createCorrectionTarget(targetContent({ category: 'MAGIC' })), CorrectionErrorCodes.INVALID_TARGET, 'bad category');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ severity: 'mega' })), CorrectionErrorCodes.INVALID_TARGET, 'bad severity');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ confidence: 1.5 })), CorrectionErrorCodes.INVALID_TARGET, 'confidence > 1');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ confidence: -0.1 })), CorrectionErrorCodes.INVALID_TARGET, 'confidence < 0');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ observedValue: '14.2' })), CorrectionErrorCodes.INVALID_TARGET, 'non-numeric observedValue');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ objectIds: [] })), CorrectionErrorCodes.INVALID_TARGET, 'empty objectIds');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ metric: '' })), CorrectionErrorCodes.INVALID_TARGET, 'empty metric');
  const withFn = targetContent();
  withFn.evidence = [{ compute: ()=>42 }];
  throwsWithCode(()=>createCorrectionTarget(withFn), CorrectionErrorCodes.INVALID_TARGET, 'function value in evidence');
  const missing = targetContent(); delete missing.severity;
  throwsWithCode(()=>createCorrectionTarget(missing), CorrectionErrorCodes.INVALID_TARGET, 'missing mandatory severity');
  // targetValue is optional (§7: number|undefined): absent OK, non-number rejected
  const withoutTv = targetContent(); delete withoutTv.targetValue;
  expect(validateCorrectionTarget(createCorrectionTarget(withoutTv)).valid, 'absent targetValue accepted');
  throwsWithCode(()=>createCorrectionTarget(targetContent({ targetValue: 'zero' })), CorrectionErrorCodes.INVALID_TARGET, 'non-numeric targetValue');
});

// ---------------------------------------------------------------------------
// CorrectionDiagnosis (§8)
// ---------------------------------------------------------------------------

test('A-10: CorrectionDiagnosis — deterministic id, deep-frozen, round-trip, all 10 root causes constructible', ()=>{
  const d1 = createCorrectionDiagnosis(diagnosisContent({ targetId: 'ctarget-1' }));
  const d2 = createCorrectionDiagnosis(diagnosisContent({ targetId: 'ctarget-1' }));
  expect(d1.id.startsWith('diag-'), `id prefix, got ${d1.id}`);
  eq(d1.id, d2.id, 'same content => same id');
  deepFrozen(d1, 'diagnosis');
  expect(validateCorrectionDiagnosis(JSON.parse(JSON.stringify(d1))).valid, 'round-trip validates');
  for (const rc of CORRECTION_DIAGNOSIS_ROOT_CAUSES){
    expect(validateCorrectionDiagnosis(createCorrectionDiagnosis(diagnosisContent({ targetId: 't', rootCause: rc }))).valid, `rootCause ${rc} accepted`);
  }
});

test('A-11: CorrectionDiagnosis validation — rootCause enum, confidence range, mandatory targetId, plain-data-only', ()=>{
  throwsWithCode(()=>createCorrectionDiagnosis(diagnosisContent({ rootCause: 'VIBES' })), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'bad rootCause');
  throwsWithCode(()=>createCorrectionDiagnosis(diagnosisContent({ confidence: 2 })), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'confidence > 1');
  throwsWithCode(()=>createCorrectionDiagnosis(diagnosisContent({ affectedObjects: 'obj-1' })), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'affectedObjects not an array');
  throwsWithCode(()=>createCorrectionDiagnosis(diagnosisContent({ recommendedStrategies: [42] })), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'non-object strategy entry');
  const withFn = diagnosisContent(); withFn.affectedObjects = ['obj-1', ()=>1];
  throwsWithCode(()=>createCorrectionDiagnosis(withFn), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'function value in affectedObjects');
  const missing = diagnosisContent(); delete missing.targetId;
  throwsWithCode(()=>createCorrectionDiagnosis(missing), CorrectionErrorCodes.INVALID_DIAGNOSIS, 'missing targetId');
});

// ---------------------------------------------------------------------------
// CorrectionStrategy (§9)
// ---------------------------------------------------------------------------

test('A-12: CorrectionStrategy — deterministic id, deep-frozen, round-trip, all 3 risks constructible', ()=>{
  const s1 = createCorrectionStrategy(strategyContent());
  const s2 = createCorrectionStrategy(strategyContent());
  expect(s1.id.startsWith('strategy-'), `id prefix, got ${s1.id}`);
  eq(s1.id, s2.id, 'same content => same id');
  const s3 = createCorrectionStrategy(strategyContent({ risk: 'HIGH' }));
  expect(s1.id !== s3.id, 'risk change => different id');
  deepFrozen(s1, 'strategy');
  expect(validateCorrectionStrategy(JSON.parse(JSON.stringify(s1))).valid, 'round-trip validates');
  for (const r of CORRECTION_STRATEGY_RISKS){
    expect(validateCorrectionStrategy(createCorrectionStrategy(strategyContent({ risk: r }))).valid, `risk ${r} accepted`);
  }
  eq(s1.reversible, true, 'reversible retained');
});

test('A-13: CorrectionStrategy validation — risk enum, boolean reversible, plain-object commands, mandatory fields', ()=>{
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ risk: 'CRITICAL' })), CorrectionErrorCodes.INVALID_STRATEGY, 'risk CRITICAL is not a §9 strategy risk');
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ reversible: 'yes' })), CorrectionErrorCodes.INVALID_STRATEGY, 'non-boolean reversible');
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ applicableTo: [] })), CorrectionErrorCodes.INVALID_STRATEGY, 'empty applicableTo');
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ commands: [] })), CorrectionErrorCodes.INVALID_STRATEGY, 'empty commands');
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ commands: ['MoveObjectCommand'] })), CorrectionErrorCodes.INVALID_STRATEGY, 'non-object command entry');
  throwsWithCode(()=>createCorrectionStrategy(strategyContent({ confidence: 0 })), CorrectionErrorCodes.INVALID_STRATEGY, 'confidence 0 rejected on strategy (rule-derived confidence must be positive)');
  const withFn = strategyContent(); withFn.expectedEffect = { apply: ()=>1 };
  throwsWithCode(()=>createCorrectionStrategy(withFn), CorrectionErrorCodes.INVALID_STRATEGY, 'function value in expectedEffect');
  const missing = strategyContent(); delete missing.name;
  throwsWithCode(()=>createCorrectionStrategy(missing), CorrectionErrorCodes.INVALID_STRATEGY, 'missing name');
});

// ---------------------------------------------------------------------------
// CorrectionPlan (§10)
// ---------------------------------------------------------------------------

test('A-14: CorrectionPlan — embeds valid diagnosis + strategy, deterministic id, deep-frozen, round-trip, validator accepts', ()=>{
  const p1 = createCorrectionPlan(planContent());
  const p2 = createCorrectionPlan(planContent());
  expect(p1.id.startsWith('cplan-'), `id prefix, got ${p1.id}`);
  eq(p1.id, p2.id, 'same content => same id');
  deepFrozen(p1, 'plan');
  expect(validateCorrectionPlan(JSON.parse(JSON.stringify(p1))).valid, 'round-trip validates');
  expect(validateCorrectionDiagnosis(p1.diagnosis).valid, 'embedded diagnosis valid');
  expect(validateCorrectionStrategy(p1.strategy).valid, 'embedded strategy valid');
  eq(p1.sessionId, 'loop-x', 'sessionId retained');
  eq(p1.commands.length, 1, 'commands retained');
});

test('A-15: CorrectionPlan validation — embedded records validated, mandatory sections, plain-data-only', ()=>{
  throwsWithCode(()=>createCorrectionPlan(planContent({ sessionId: '' })), CorrectionErrorCodes.INVALID_PLAN, 'empty sessionId');
  throwsWithCode(()=>createCorrectionPlan(planContent({ expectedImprovement: 'fewer errors' })), CorrectionErrorCodes.INVALID_PLAN, 'non-object expectedImprovement');
  throwsWithCode(()=>createCorrectionPlan(planContent({ riskAssessment: null })), CorrectionErrorCodes.INVALID_PLAN, 'null riskAssessment');
  throwsWithCode(()=>createCorrectionPlan(planContent({ commands: [] })), CorrectionErrorCodes.INVALID_PLAN, 'empty commands');
  throwsWithCode(()=>createCorrectionPlan(planContent({ preconditions: 'none' })), CorrectionErrorCodes.INVALID_PLAN, 'non-array preconditions');
  const badDiag = planContent(); badDiag.__diagnosis = createCorrectionDiagnosis(diagnosisContent({ targetId: 't' })); badDiag.diagnosis = { ...badDiag.__diagnosis, rootCause: 'NOPE' };
  throwsWithCode(()=>createCorrectionPlan(badDiag), CorrectionErrorCodes.INVALID_PLAN, 'invalid embedded diagnosis');
  const badStrat = planContent(); badStrat.strategy = { ...createCorrectionStrategy(strategyContent()), reversible: null };
  throwsWithCode(()=>createCorrectionPlan(badStrat), CorrectionErrorCodes.INVALID_PLAN, 'invalid embedded strategy');
  const withFn = planContent(); withFn.postconditions = [{ check: ()=>true }];
  throwsWithCode(()=>createCorrectionPlan(withFn), CorrectionErrorCodes.INVALID_PLAN, 'function value in postconditions');
});

// ---------------------------------------------------------------------------
// CorrectionAttempt (§6)
// ---------------------------------------------------------------------------

test('A-16: CorrectionAttempt — embeds valid target + plan, deterministic id, deep-frozen, round-trip, all 7 statuses constructible', ()=>{
  const a1 = createCorrectionAttempt(attemptContent());
  const a2 = createCorrectionAttempt(attemptContent());
  expect(a1.id.startsWith('attempt-'), `id prefix, got ${a1.id}`);
  eq(a1.id, a2.id, 'same content => same id');
  deepFrozen(a1, 'attempt');
  expect(validateCorrectionAttempt(JSON.parse(JSON.stringify(a1))).valid, 'round-trip validates');
  expect(validateCorrectionTarget(a1.target).valid, 'embedded target valid');
  expect(validateCorrectionPlan(a1.plan).valid, 'embedded plan valid');
  eq(a1.beforeEvaluation.status, 'DEVIATION', 'beforeEvaluation retained');
  for (const st of CORRECTION_ATTEMPT_STATUSES){
    expect(validateCorrectionAttempt(createCorrectionAttempt(attemptContent({ status: st }))).valid, `status ${st} accepted`);
  }
});

test('A-17: CorrectionAttempt validation — status enum, iteration integer, transactionId, plain-data-only, embedded records', ()=>{
  throwsWithCode(()=>createCorrectionAttempt(attemptContent({ status: 'MAYBE' })), CorrectionErrorCodes.INVALID_ATTEMPT, 'bad status');
  throwsWithCode(()=>createCorrectionAttempt(attemptContent({ iteration: 1.5 })), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-integer iteration');
  throwsWithCode(()=>createCorrectionAttempt(attemptContent({ iteration: -1 })), CorrectionErrorCodes.INVALID_ATTEMPT, 'negative iteration');
  throwsWithCode(()=>createCorrectionAttempt(attemptContent({ transactionId: '' })), CorrectionErrorCodes.INVALID_ATTEMPT, 'empty transactionId');
  const withFn = attemptContent(); withFn.afterEvaluation = { score: ()=>1 };
  throwsWithCode(()=>createCorrectionAttempt(withFn), CorrectionErrorCodes.INVALID_ATTEMPT, 'function value in afterEvaluation');
  const withFnDelta = attemptContent(); withFnDelta.delta = { overall: 0.1, metrics: { m: ()=>1 } };
  throwsWithCode(()=>createCorrectionAttempt(withFnDelta), CorrectionErrorCodes.INVALID_ATTEMPT, 'function value in delta');
  const badTarget = attemptContent(); badTarget.__target = createCorrectionTarget(targetContent()); badTarget.target = { ...badTarget.__target, category: 'NOPE' };
  throwsWithCode(()=>createCorrectionAttempt(badTarget), CorrectionErrorCodes.INVALID_ATTEMPT, 'invalid embedded target');
  const beforeMissing = attemptContent(); delete beforeMissing.beforeEvaluation;
  throwsWithCode(()=>createCorrectionAttempt(beforeMissing), CorrectionErrorCodes.INVALID_ATTEMPT, 'missing beforeEvaluation');
  // afterEvaluation and delta are optional (§6: Object|undefined)
  const minimal = createCorrectionAttempt(attemptContent());
  expect(minimal.afterEvaluation === undefined && minimal.delta === undefined, 'afterEvaluation/delta undefined on a PROPOSED attempt');
});

// ---------------------------------------------------------------------------
// CorrectionLoopSession (§4) + validation
// ---------------------------------------------------------------------------

test('A-18: createCorrectionLoopSession — §4 defaults, deterministic id, deep-frozen, round-trip, validator accepts', ()=>{
  const s1 = createCorrectionLoopSession(sessionContent());
  const s2 = createCorrectionLoopSession(sessionContent());
  expect(s1.id.startsWith('loop-'), `id prefix, got ${s1.id}`);
  eq(s1.id, s2.id, 'same content => same id');
  eq(s1.state, 'IDLE', 'starts IDLE');
  eq(s1.iteration, 0, 'iteration 0');
  deepEq(s1.corrections, [], 'corrections empty');
  deepEq(s1.visitedStates, ['IDLE'], 'visitedStates opens with IDLE');
  expect(s1.terminationReason === undefined, 'terminationReason undefined');
  expect(s1.bestEvaluation === undefined, 'bestEvaluation undefined');
  deepEq(s1.currentEvaluation, EVAL_BEFORE, 'currentEvaluation defaults to initialEvaluation');
  deepFrozen(s1, 'session');
  const rt = JSON.parse(JSON.stringify(s1));
  deepEq(rt, { ...s1 }, 'JSON round-trip lossless');
  expect(validateCorrectionLoopSession(rt).valid, 'round-tripped session validates');
  expect(validateCorrectionLoopSession(s1).valid, 'fresh session validates');
  // explicit currentEvaluation override is honored
  const withCur = createCorrectionLoopSession(sessionContent({ currentEvaluation: EVAL_AFTER }));
  deepEq(withCur.currentEvaluation, EVAL_AFTER, 'explicit currentEvaluation retained');
});

test('A-19: session validation — mandatory fields, bounds, trail start, TERMINATED⟺terminationReason in BOTH directions', ()=>{
  throwsWithCode(()=>createCorrectionLoopSession(sessionContent({ rootIntentId: '' })), CorrectionErrorCodes.INVALID_SESSION, 'empty rootIntentId');
  throwsWithCode(()=>createCorrectionLoopSession(sessionContent({ rootTransactionId: '' })), CorrectionErrorCodes.INVALID_SESSION, 'empty rootTransactionId');
  throwsWithCode(()=>createCorrectionLoopSession(sessionContent({ maxIterations: 0 })), CorrectionErrorCodes.INVALID_SESSION, 'maxIterations 0');
  throwsWithCode(()=>createCorrectionLoopSession(sessionContent({ maxIterations: 2.5 })), CorrectionErrorCodes.INVALID_SESSION, 'non-integer maxIterations');
  throwsWithCode(()=>createCorrectionLoopSession(sessionContent({ initialEvaluation: 'bad' })), CorrectionErrorCodes.INVALID_SESSION, 'non-object initialEvaluation');
  const withFn = sessionContent(); withFn.initialEvaluation = { score: ()=>1 };
  throwsWithCode(()=>createCorrectionLoopSession(withFn), CorrectionErrorCodes.INVALID_SESSION, 'function value in initialEvaluation');
  // TERMINATED without reason must be rejected (built raw — construction cannot produce it)
  const terminatedNoReason = { ...createCorrectionLoopSession(sessionContent()), state: 'TERMINATED', visitedStates: ['IDLE','TERMINATED'] };
  const c1 = validateCorrectionLoopSession(terminatedNoReason);
  expect(!c1.valid, 'TERMINATED without terminationReason rejected');
  // reason without TERMINATED must be rejected (both-direction discipline)
  const reasonNoTerminated = { ...createCorrectionLoopSession(sessionContent()), terminationReason: 'NO_PROGRESS' };
  const c2 = validateCorrectionLoopSession(reasonNoTerminated);
  expect(!c2.valid, 'terminationReason without TERMINATED state rejected');
  // invalid reason string rejected
  const badReason = { ...createCorrectionLoopSession(sessionContent()), state: 'TERMINATED', terminationReason: 'WHATEVER', visitedStates: ['IDLE','TERMINATED'] };
  expect(!validateCorrectionLoopSession(badReason).valid, 'unknown terminationReason rejected');
});

// ---------------------------------------------------------------------------
// State machine (§3/§5)
// ---------------------------------------------------------------------------

test('A-20: CORRECTION_LOOP_TRANSITIONS — the §3 graph is present verbatim, frozen, and every endpoint is a §5 state', ()=>{
  expect(Object.isFrozen(CORRECTION_LOOP_TRANSITIONS), 'transition map frozen');
  const literal = {
    IDLE: ['PLANNING'],
    PLANNING: ['EXECUTING'],
    EXECUTING: ['EVALUATING'],
    EVALUATING: ['DIAGNOSING', 'VERIFIED'],
    DIAGNOSING: ['CORRECTING'],
    CORRECTING: ['RE_EXECUTING', 'ROLLING_BACK'],
    RE_EXECUTING: ['RE_EVALUATING'],
    RE_EVALUATING: ['VERIFIED', 'ROLLING_BACK', 'TERMINATED', 'DIAGNOSING'],
    ROLLING_BACK: ['DIAGNOSING', 'TERMINATED'],
    VERIFIED: ['TERMINATED'],
    TERMINATED: []
  };
  for (const from of Object.keys(literal)){
    expect(Array.isArray(CORRECTION_LOOP_TRANSITIONS[from]), `edge list present for ${from}`);
    for (const to of literal[from]){
      expect(CORRECTION_LOOP_TRANSITIONS[from].includes(to), `§3/derived edge ${from} -> ${to} present`);
    }
    for (const to of CORRECTION_LOOP_TRANSITIONS[from]){
      expect(CORRECTION_LOOP_STATES.includes(from) && CORRECTION_LOOP_STATES.includes(to), `endpoints of ${from}->${to} are §5 states`);
    }
  }
  eq(Object.keys(CORRECTION_LOOP_TRANSITIONS).length, 11, 'every state has an (possibly empty) edge list');
});

test('A-21: canTransition — §3 happy chain, §3 failure paths, and the five disclosed completion edges all legal', ()=>{
  // §3 literal chain
  for (const [from, to] of [['IDLE','PLANNING'],['PLANNING','EXECUTING'],['EXECUTING','EVALUATING'],['EVALUATING','DIAGNOSING'],['DIAGNOSING','CORRECTING'],['CORRECTING','RE_EXECUTING'],['RE_EXECUTING','RE_EVALUATING'],['RE_EVALUATING','VERIFIED']]){
    expect(canTransition(from, to), `§3 edge ${from}->${to}`);
  }
  // §3 failure paths (ROLLBACK spelled ROLLING_BACK per §5)
  expect(canTransition('CORRECTING','ROLLING_BACK'), '§3 CORRECTING ->(CORRECTION_FAILED)-> ROLLING_BACK');
  expect(canTransition('RE_EVALUATING','ROLLING_BACK'), '§3 RE_EVALUATING ->(REGRESSION)-> ROLLING_BACK');
  expect(canTransition('RE_EVALUATING','TERMINATED'), '§3 RE_EVALUATING ->(NO_PROGRESS)-> TERMINATED');
  // disclosed completion edges
  expect(canTransition('EVALUATING','VERIFIED'), '§17 clean-pass edge EVALUATING -> VERIFIED');
  expect(canTransition('RE_EVALUATING','DIAGNOSING'), 'iteration-cycle edge RE_EVALUATING -> DIAGNOSING');
  expect(canTransition('ROLLING_BACK','DIAGNOSING'), '§69 retry edge ROLLING_BACK -> DIAGNOSING');
  expect(canTransition('ROLLING_BACK','TERMINATED'), 'give-up edge ROLLING_BACK -> TERMINATED');
  expect(canTransition('VERIFIED','TERMINATED'), '§4/§50 formal-close edge VERIFIED -> TERMINATED');
});

test('A-22: canTransition — illegal edges are false (IDLE shortcuts, backwards jumps, absorbing TERMINATED)', ()=>{
  const illegal = [
    ['IDLE','VERIFIED'], ['IDLE','EXECUTING'], ['IDLE','EVALUATING'],
    ['PLANNING','IDLE'], ['PLANNING','EVALUATING'],
    ['EXECUTING','DIAGNOSING'], ['EXECUTING','CORRECTING'],
    ['EVALUATING','CORRECTING'], ['EVALUATING','RE_EVALUATING'],
    ['DIAGNOSING','VERIFIED'], ['DIAGNOSING','RE_EXECUTING'],
    ['CORRECTING','VERIFIED'],
    ['RE_EXECUTING','VERIFIED'], ['RE_EXECUTING','ROLLING_BACK'],
    ['VERIFIED','PLANNING'], ['VERIFIED','RE_EVALUATING'],
    ['ROLLING_BACK','RE_EXECUTING'], ['ROLLING_BACK','CORRECTING'],
    ['TERMINATED','DIAGNOSING'], ['TERMINATED','PLANNING'], ['TERMINATED','IDLE'], ['TERMINATED','VERIFIED']
  ];
  for (const [from, to] of illegal){
    expect(!canTransition(from, to), `illegal edge must be refused: ${from} -> ${to}`);
  }
});

test('A-23: transitionSession — the full §3 happy chain from IDLE to VERIFIED, trail grows exactly, iteration untouched', ()=>{
  let s = createCorrectionLoopSession(sessionContent());
  const chain = ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','VERIFIED'];
  for (const to of chain){
    const prev = s;
    s = transitionSession(s, to);
    eq(s.state, to, `state advanced to ${to}`);
    deepEq(s.visitedStates, [...prev.visitedStates, to], `trail records ${to}`);
    expect(s !== prev, 'transition returns a NEW session record');
    expect(Object.isFrozen(s), 'new session frozen');
    eq(s.iteration, 0, 'iteration untouched by transitions (engine checkpoints own it)');
    eq(s.id, prev.id, 'session id stable across transitions');
  }
  deepEq(s.visitedStates, ['IDLE', ...chain], 'final trail is the complete §3 chain');
});

test('A-24: transitionSession immutability — the input session is untouched (deep JSON compare before/after)', ()=>{
  const original = createCorrectionLoopSession(sessionContent());
  const snapshot = JSON.stringify(original);
  const next = transitionSession(original, 'PLANNING');
  eq(JSON.stringify(original), snapshot, 'original byte-identical after transition');
  expect(next !== original, 'distinct object identity');
  eq(next.visitedStates.length, 2, 'next session carries the grown trail');
  eq(original.visitedStates.length, 1, 'original trail unchanged');
  // frozen: attempts to mutate the returned session throw in strict mode
  let mutated = false;
  try { next.state = 'TERMINATED'; mutated = true; } catch (e) { /* expected */ }
  expect(!mutated, 'frozen session refuses property write');
});

test('A-25: transitionSession rejection — illegal transitions throw CorrectionError(INVALID_TRANSITION) naming both states', ()=>{
  const s = createCorrectionLoopSession(sessionContent());
  throwsWithCode(()=>transitionSession(s, 'VERIFIED'), CorrectionErrorCodes.INVALID_TRANSITION, 'IDLE -> VERIFIED refused');
  let msg = '';
  try { transitionSession(s, 'VERIFIED'); } catch (e){ msg = e.message; }
  expect(msg.includes('IDLE') && msg.includes('VERIFIED'), `message names both states: ${msg}`);
  throwsWithCode(()=>transitionSession(s, 'TERMINATED'), CorrectionErrorCodes.INVALID_TERMINATION, 'direct TERMINATED jump refused: a §50 reason is mandatory');
});

test('A-26: transitionSession input discipline — unknown target state and invalid sessions rejected', ()=>{
  const s = createCorrectionLoopSession(sessionContent());
  throwsWithCode(()=>transitionSession(s, 'DREAMING'), CorrectionErrorCodes.INVALID_TRANSITION, 'unknown target state');
  throwsWithCode(()=>transitionSession({ state: 'IDLE' }, 'PLANNING'), CorrectionErrorCodes.INVALID_SESSION, 'invalid session input');
  throwsWithCode(()=>transitionSession(s, 42), CorrectionErrorCodes.INVALID_TRANSITION, 'non-string target');
});

test('A-27: §3 failure path — CORRECTING ->(CORRECTION_FAILED)-> ROLLING_BACK -> DIAGNOSING retry, second cycle reaches VERIFIED, trail records EVERY visit', ()=>{
  let s = createCorrectionLoopSession(sessionContent());
  const walk = ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','ROLLING_BACK','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','VERIFIED'];
  for (const to of walk) s = transitionSession(s, to);
  deepEq(s.visitedStates, ['IDLE', ...walk], 'trail records every visit including the retry cycle');
  eq(s.visitedStates.filter(x => x === 'DIAGNOSING').length, 2, 'DIAGNOSING visited twice');
  eq(s.visitedStates.filter(x => x === 'CORRECTING').length, 2, 'CORRECTING visited twice');
  eq(s.visitedStates.filter(x => x === 'ROLLING_BACK').length, 1, 'ROLLING_BACK visited once');
});

test('A-28: §3 failure path — RE_EVALUATING ->(REGRESSION)-> ROLLING_BACK, then formal termination with EXECUTION_ERROR', ()=>{
  let s = createCorrectionLoopSession(sessionContent());
  for (const to of ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','ROLLING_BACK']) s = transitionSession(s, to);
  eq(s.state, 'ROLLING_BACK', 'regression lands in ROLLING_BACK');
  s = terminateSession(s, 'EXECUTION_ERROR');
  eq(s.state, 'TERMINATED', 'terminated');
  eq(s.terminationReason, 'EXECUTION_ERROR', 'reason recorded');
  expect(validateCorrectionLoopSession(s).valid, 'terminated session validates');
});

test('A-29: §3 edge RE_EVALUATING->TERMINATED is a legal canTransition edge, but the reasonless direct jump is refused (INVALID_TERMINATION) — the §50 reason is mandatory', ()=>{
  expect(canTransition('RE_EVALUATING', 'TERMINATED'), '§3 NO_PROGRESS edge exists');
  let s = createCorrectionLoopSession(sessionContent());
  for (const to of ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING']) s = transitionSession(s, to);
  throwsWithCode(()=>transitionSession(s, 'TERMINATED'), CorrectionErrorCodes.INVALID_TERMINATION, 'reasonless TERMINATED jump refused');
  // the sanctioned path: terminateSession carries the reason
  const t = terminateSession(s, 'NO_PROGRESS');
  eq(t.terminationReason, 'NO_PROGRESS', 'reason carried through the sanctioned path');
  eq(t.state, 'TERMINATED', 'state TERMINATED through the sanctioned path');
});

test('A-30: terminateSession — happy paths from RE_EVALUATING/VERIFIED/ROLLING_BACK with valid §50 reasons; invalid reasons rejected', ()=>{
  const at = (states) => { let s = createCorrectionLoopSession(sessionContent()); for (const to of states) s = transitionSession(s, to); return s; };
  const s1 = terminateSession(at(['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING']), 'NO_PROGRESS');
  eq(s1.terminationReason, 'NO_PROGRESS', 'NO_PROGRESS from RE_EVALUATING');
  const s2 = terminateSession(at(['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','VERIFIED']), 'VERIFIED');
  eq(s2.terminationReason, 'VERIFIED', 'VERIFIED reason from VERIFIED state');
  const s3 = terminateSession(at(['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','ROLLING_BACK']), 'EXECUTION_ERROR');
  eq(s3.terminationReason, 'EXECUTION_ERROR', 'EXECUTION_ERROR from ROLLING_BACK');
  for (const bad of ['REGRESSION', 'CORRECTION_FAILED', '', 'no_progress']){
    const s = at(['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING']);
    throwsWithCode(()=>terminateSession(s, bad), CorrectionErrorCodes.INVALID_TERMINATION, `invalid reason '${bad}' refused`);
  }
  for (const r of CORRECTION_TERMINATION_REASONS){
    const s = at(['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING']);
    const t = terminateSession(s, r);
    eq(t.state, 'TERMINATED', `reason ${r} terminates`);
  }
});

test('A-31: TERMINATED is absorbing and illegal sources refuse termination — but §53 USER_CANCELLED is legal from ANY active state (any iteration)', ()=>{
  let s = createCorrectionLoopSession(sessionContent());
  s = terminateSession(s, 'USER_CANCELLED');
  eq(s.state, 'TERMINATED', 'user cancellation terminates from IDLE (§53: any iteration)');
  for (const to of ['DIAGNOSING', 'PLANNING', 'VERIFIED', 'IDLE']){
    throwsWithCode(()=>transitionSession(s, to), CorrectionErrorCodes.INVALID_TRANSITION, `absorbing: TERMINATED -> ${to} refused`);
  }
  throwsWithCode(()=>terminateSession(s, 'NO_PROGRESS'), CorrectionErrorCodes.INVALID_TRANSITION, 'already terminated');
  const early = createCorrectionLoopSession(sessionContent());
  expect(!canTransition('PLANNING', 'TERMINATED'), 'PLANNING -> TERMINATED is not a §3 map edge');
  const atPlanning = transitionSession(early, 'PLANNING');
  throwsWithCode(()=>terminateSession(atPlanning, 'NO_PROGRESS'), CorrectionErrorCodes.INVALID_TRANSITION, 'engine reason from PLANNING refused (no §3 edge)');
  const cancelledMidCycle = terminateSession(atPlanning, 'USER_CANCELLED');
  eq(cancelledMidCycle.state, 'TERMINATED', '§53: USER_CANCELLED from PLANNING is legal');
  eq(cancelledMidCycle.terminationReason, 'USER_CANCELLED', '§53 reason recorded');
  const midCycle = (walk) => { let x = createCorrectionLoopSession(sessionContent()); for (const to of walk) x = transitionSession(x, to); return terminateSession(x, 'USER_CANCELLED'); };
  for (const walk of [
    ['PLANNING'],
    ['PLANNING','EXECUTING'],
    ['PLANNING','EXECUTING','EVALUATING'],
    ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING'],
    ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING'],
    ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING'],
    ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING'],
    ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','ROLLING_BACK']
  ]){
    eq(midCycle(walk).terminationReason, 'USER_CANCELLED', `§53 cancellation legal from ${walk[walk.length-1]}`);
  }
});

test('A-32: determinism (§44) — two identical session chains produce byte-identical JSON; id stability across the chain', ()=>{
  const run = () => {
    let s = createCorrectionLoopSession(sessionContent());
    const walk = ['PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','ROLLING_BACK','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING'];
    for (const to of walk) s = transitionSession(s, to);
    return terminateSession(s, 'MAX_ITERATIONS_REACHED');
  };
  const a = run(), b = run();
  eq(a.id, b.id, 'same session content => same session id');
  deepEq(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'byte-identical JSON (key-order independent deep equality)');
  eq(JSON.stringify(a) === JSON.stringify(b), true, 'identical insertion-order serialization too');
});

// ===========================================================================
// CHECKPOINT B — diagnosis resolution, strategy selection, impact, cost,
// explainability (§8/§9/§19/§20/§27/§28/§38)
// ===========================================================================

const toolRegistry = new ToolRegistry();
registerCoreTools(toolRegistry);
const LIVE_TOOL_IDS = new Set(toolRegistry.list().map(t => t.id));
const isBPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// POSITION-flavored default target (mirrors the A fixture discipline).
function bTarget(over={}){
  return createCorrectionTarget({ category: 'POSITION', objectIds: ['obj-1'], metric: 'position.x',
    observedValue: 5, targetValue: 0, severity: 'MEDIUM', confidence: 0.8,
    evidence: [{ type: 'METRIC', source: 'evaluation', objectIds: ['obj-1'], value: 5 }], ...over });
}
// Hand-built strategy for ranking/impact/cost tests (ranking is a standalone
// §19 mechanism — those tests are independent of the resolver by design, so
// the two stub-kill sites stay disjoint).
function bStrategy(over={}){
  return createCorrectionStrategy({ name: 'b-strategy', applicableTo: ['POSITION_ERROR'],
    commands: [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1', 'obj-2'] } }],
    expectedEffect: { metric: 'position.x', direction: 'TOWARD_TARGET' },
    risk: 'LOW', reversible: true, confidence: 0.9, ...over });
}
function bDiagnosis(target, strategies, over={}){
  return createCorrectionDiagnosis({ targetId: target.id, rootCause: 'POSITION_ERROR',
    confidence: target.confidence, affectedObjects: [...target.objectIds],
    recommendedStrategies: strategies, ...over });
}

test('B-1: category→rootCause resolution table — exactly 11 keys covering every §7 category, frozen, values ∈ §8 causes, UNKNOWN unreachable', ()=>{
  deepFrozen(CATEGORY_TO_ROOT_CAUSE, 'CATEGORY_TO_ROOT_CAUSE');
  eq(Object.keys(CATEGORY_TO_ROOT_CAUSE).length, 11, 'table covers exactly 11 categories');
  for (const c of CORRECTION_TARGET_CATEGORIES){
    expect(Object.prototype.hasOwnProperty.call(CATEGORY_TO_ROOT_CAUSE, c), `category ${c} must have a mapped root cause`);
    expect(CORRECTION_DIAGNOSIS_ROOT_CAUSES.includes(CATEGORY_TO_ROOT_CAUSE[c]), `mapped cause for ${c} must be a §8 root cause`);
  }
  expect(Object.values(CATEGORY_TO_ROOT_CAUSE).indexOf('UNKNOWN') === -1, 'the resolver table never maps to UNKNOWN (UNKNOWN stays the externally-constructed vocabulary member)');
});

test('B-2: capability recipe table — frozen, every recipe grounded in a REGISTERED mutation tool (live registry), strictly positive confidence, reversible, scoped', ()=>{
  deepFrozen(CORRECTION_CAPABILITY_RECIPES, 'CORRECTION_CAPABILITY_RECIPES');
  expect(Array.isArray(CORRECTION_CAPABILITY_RECIPES) && CORRECTION_CAPABILITY_RECIPES.length >= 7, 'at least the seven executable capability families are present');
  for (const r of CORRECTION_CAPABILITY_RECIPES){
    expect(isBPlain(r), `recipe ${r && r.name} must be plain data`);
    expect(typeof r.name === 'string' && r.name.length > 0, 'recipe.name non-empty');
    expect(CORRECTION_DIAGNOSIS_ROOT_CAUSES.includes(r.rootCause), `recipe ${r.name} rootCause must be a §8 cause`);
    expect(Array.isArray(r.metrics) && r.metrics.length > 0 && r.metrics.every(m => typeof m === 'string' && m.length > 0), `recipe ${r.name} metrics non-empty strings`);
    expect(isBPlain(r.command) && typeof r.command.kind === 'string' && r.command.kind.length > 0, `recipe ${r.name} command.kind non-empty`);
    expect(LIVE_TOOL_IDS.has(r.command.toolId), `recipe ${r.name} command.toolId ${r.command.toolId} must be a REGISTERED tool id (live registry grounding)`);
    eq(toolRegistry.get(r.command.toolId).category, 'mutation', `recipe ${r.name} must ground in an executable mutation tool (corrections are transaction-backed)`);
    expect(CORRECTION_STRATEGY_RISKS.includes(r.risk), `recipe ${r.name} risk must be LOW|MEDIUM|HIGH`);
    eq(r.reversible, true, `recipe ${r.name} must be reversible (every substrate transaction carries an inverse, transaction.js)`);
    expect(typeof r.confidence === 'number' && Number.isFinite(r.confidence) && r.confidence > 0 && r.confidence <= 1, `recipe ${r.name} confidence strictly positive in (0,1]`);
    expect(['LOCAL', 'SUBTREE', 'GLOBAL'].includes(r.scope), `recipe ${r.name} scope must be LOCAL|SUBTREE|GLOBAL`);
  }
});

test('B-3: grounding coverage — the seven executable causes are covered; SEMANTIC_ERROR/CONSTRAINT_VIOLATION/UNKNOWN are honest gaps whose provenance is the live registry itself', ()=>{
  const covered = new Set(CORRECTION_CAPABILITY_RECIPES.map(r => r.rootCause));
  for (const cause of ['POSITION_ERROR', 'SIZE_ERROR', 'TRANSFORM_ERROR', 'SPACING_ERROR', 'ALIGNMENT_ERROR', 'STYLE_ERROR', 'STRUCTURAL_ERROR']){
    expect(covered.has(cause), `${cause} must be covered by the capability table`);
  }
  for (const cause of ['SEMANTIC_ERROR', 'CONSTRAINT_VIOLATION', 'UNKNOWN']){
    eq(CORRECTION_CAPABILITY_RECIPES.filter(r => r.rootCause === cause).length, 0, `${cause} must have ZERO recipes (no executable capability — §28 no fabrication)`);
  }
  eq(toolRegistry.get('T19').category, 'proposal', 'infer_constraints is proposal-class — NOT an executable correction');
  eq(toolRegistry.get('T20').category, 'proposal', 'infer_semantic is proposal-class — NOT an executable correction');
  eq(toolRegistry.get('T18').category, 'read', 'detect_symmetry is read-class — detector, not corrector');
  eq(toolRegistry.get('T14').name, 'outline_text', 'T14 outlines text; it does not author content — no TEXT capability');
});

test('B-4: metric matcher dot-boundary discipline — prefix matches exact or dot-boundary only; attribution survives where strategy matching fails', ()=>{
  const resolved = resolveCorrectionDiagnosis(bTarget({ category: 'ALIGNMENT', metric: 'alignment.deviation.px', objectIds: ['obj-1', 'obj-2'] }));
  eq(resolved.status, 'RESOLVED', "'alignment.deviation.px' matches the 'alignment' capability prefix");
  const boundary = resolveCorrectionDiagnosis(bTarget({ category: 'ALIGNMENT', metric: 'alignmentX', objectIds: ['obj-1'] }));
  eq(boundary.status, 'NO_CAPABILITY', "'alignmentX' must NOT match the 'alignment' prefix (dot-boundary discipline)");
  eq(boundary.rootCause, 'ALIGNMENT_ERROR', 'the cause is still attributed even where no strategy matches');
});

test('B-5: resolveCorrectionDiagnosis RESOLVED shape (POSITION) — §8 diagnosis with a capability-grounded strategy, deep-frozen end to end', ()=>{
  const t = bTarget();
  const res = resolveCorrectionDiagnosis(t);
  eq(res.status, 'RESOLVED', 'POSITION + position.x must resolve');
  const d = res.diagnosis;
  expect(d, 'RESOLVED resolution carries a diagnosis');
  eq(d.targetId, t.id, 'diagnosis names the target (§8)');
  eq(d.rootCause, 'POSITION_ERROR', 'POSITION maps to POSITION_ERROR');
  eq(d.confidence, 0.8, 'diagnosis confidence inherits target confidence (deterministic, no entropy)');
  deepEq(d.affectedObjects, ['obj-1'], 'affectedObjects are the target objects in target order');
  eq(d.recommendedStrategies.length, 1, 'one capability recipe matches position.x');
  const s = d.recommendedStrategies[0];
  eq(validateCorrectionStrategy(s).valid, true, 'resolver-emitted strategy passes the §9 validator');
  eq(s.name, 'translate-to-target', 'the POSITION capability recipe is translate-to-target');
  eq(s.applicableTo[0], 'POSITION_ERROR', 'strategy applicableTo is the diagnosed cause');
  deepEq(s.commands, [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'] } }], 'command descriptor: REAL toolId T05 + target objectIds in target order');
  deepEq(s.expectedEffect, { metric: 'position.x', direction: 'TOWARD_TARGET', targetValue: 0 }, 'expectedEffect carries metric + direction + targetValue');
  eq(s.risk, 'LOW', 'translation is LOW risk');
  eq(s.reversible, true, 'transaction-backed translation is reversible');
  eq(s.confidence, 1, 'table strategies carry confidence 1 (direct capability mapping)');
  deepFrozen(res, 'resolution');
});

test('B-6: full 11-category sweep — 8 categories resolve to the mapped cause; SEMANTIC/TEXT/CONSTRAINT hit the §28 NO_CAPABILITY path with the exact record shape', ()=>{
  const sweep = [
    ['POSITION', 'position.x', 'POSITION_ERROR', 'RESOLVED'],
    ['SIZE', 'size.width', 'SIZE_ERROR', 'RESOLVED'],
    ['GEOMETRY', 'geometry.transform', 'TRANSFORM_ERROR', 'RESOLVED'],
    ['ALIGNMENT', 'alignment.deviation.px', 'ALIGNMENT_ERROR', 'RESOLVED'],
    ['SPACING', 'spacing.gap', 'SPACING_ERROR', 'RESOLVED'],
    ['SYMMETRY', 'symmetry.axisDelta', 'ALIGNMENT_ERROR', 'RESOLVED'],
    ['APPEARANCE', 'appearance.fill', 'STYLE_ERROR', 'RESOLVED'],
    ['STRUCTURE', 'structure.zorder', 'STRUCTURAL_ERROR', 'RESOLVED'],
    ['SEMANTIC', 'semantic.role', 'SEMANTIC_ERROR', 'NO_CAPABILITY'],
    ['CONSTRAINT', 'constraint.lock', 'CONSTRAINT_VIOLATION', 'NO_CAPABILITY'],
    ['TEXT', 'text.content', 'SEMANTIC_ERROR', 'NO_CAPABILITY']
  ];
  eq(sweep.length, CORRECTION_TARGET_CATEGORIES.length, 'the sweep covers every §7 category exactly once');
  for (const [category, metric, cause, expectedStatus] of sweep){
    const res = resolveCorrectionDiagnosis(bTarget({ category, metric }));
    eq(res.status, expectedStatus, `${category}: expected ${expectedStatus}`);
    const observedCause = expectedStatus === 'RESOLVED' ? res.diagnosis.rootCause : res.rootCause;
    eq(observedCause, cause, `${category}: rootCause ${cause}`);
    if (expectedStatus === 'RESOLVED'){
      expect(res.diagnosis && res.diagnosis.recommendedStrategies.length >= 1, `${category}: RESOLVED implies >=1 grounded strategy`);
    } else {
      expect(res.diagnosis === undefined, `${category}: NO_CAPABILITY must NOT fabricate a diagnosis (§28)`);
      deepEq(res.objectIds, ['obj-1'], `${category}: the NO_CAPABILITY record still names the affected objects`);
    }
  }
});

test('B-7: resolver determinism — identical target resolves with identical diagnosis/strategy ids and byte-identical JSON (§44)', ()=>{
  const a = resolveCorrectionDiagnosis(bTarget());
  const b = resolveCorrectionDiagnosis(bTarget());
  eq(a.diagnosis.id, b.diagnosis.id, 'same content => same diagnosis id');
  eq(a.diagnosis.recommendedStrategies[0].id, b.diagnosis.recommendedStrategies[0].id, 'same content => same strategy id');
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical JSON');
  deepEq(JSON.parse(JSON.stringify(a.diagnosis)), JSON.parse(JSON.stringify(a.diagnosis)), 'JSON round-trip lossless');
});

test('B-8: content-derived ids move with content — objectIds change moves the strategy id; confidence change moves the diagnosis id but NOT the strategy id', ()=>{
  const t1 = resolveCorrectionDiagnosis(bTarget());
  const t2 = resolveCorrectionDiagnosis(bTarget({ objectIds: ['obj-2'] }));
  expect(t1.diagnosis.recommendedStrategies[0].id !== t2.diagnosis.recommendedStrategies[0].id, 'strategy content includes commands.objectIds -> id moves');
  const t3 = resolveCorrectionDiagnosis(bTarget({ confidence: 0.5 }));
  eq(t1.diagnosis.recommendedStrategies[0].id, t3.diagnosis.recommendedStrategies[0].id, 'strategy content excludes diagnosis-level confidence -> id stable');
  expect(t1.diagnosis.id !== t3.diagnosis.id, 'diagnosis content includes confidence -> id moves');
});

test('B-9: resolver input discipline — invalid target content is refused with INVALID_TARGET before any resolution', ()=>{
  throwsWithCode(()=>resolveCorrectionDiagnosis(bTarget({ category: 'BOGUS' })), CorrectionErrorCodes.INVALID_TARGET, 'bogus category');
  throwsWithCode(()=>resolveCorrectionDiagnosis(null), CorrectionErrorCodes.INVALID_TARGET, 'null target');
  throwsWithCode(()=>resolveCorrectionDiagnosis(42), CorrectionErrorCodes.INVALID_TARGET, 'non-object target');
});

test('B-10: §28 SEMANTIC — the NO_CAPABILITY resolution is a frozen, self-describing record; the Checkpoint A diagnosis contract (non-empty strategies) stands', ()=>{
  const res = resolveCorrectionDiagnosis(bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }));
  eq(res.status, 'NO_CAPABILITY', 'no semantic mutation capability exists');
  expect(typeof res.targetId === 'string' && res.targetId.length > 0, 'the record names the target');
  deepFrozen(res, 'resolution');
  throwsWithCode(()=>createCorrectionDiagnosis({ targetId: 't', rootCause: 'SEMANTIC_ERROR', confidence: 1, affectedObjects: ['o'], recommendedStrategies: [] }),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'Checkpoint A contract regression guard: empty recommendedStrategies stays refused — the §28 path is NO_CAPABILITY, not an empty diagnosis');
});

test('B-11: §28 CONSTRAINT/TEXT — NO_CAPABILITY with live-registry provenance (T19/T20 proposal-class; no text-content editor exists)', ()=>{
  for (const [category, metric, cause] of [['CONSTRAINT', 'constraint.lock', 'CONSTRAINT_VIOLATION'], ['TEXT', 'text.content', 'SEMANTIC_ERROR']]){
    const res = resolveCorrectionDiagnosis(bTarget({ category, metric }));
    eq(res.status, 'NO_CAPABILITY', `${category}: no fabricated corrections (§28)`);
    eq(res.rootCause, cause, `${category}: cause still attributed honestly`);
  }
  const mutationIds = new Set(toolRegistry.listByCategory('mutation').map(t => t.id));
  expect(!mutationIds.has('T19') && !mutationIds.has('T20'), 'T19/T20 are NOT mutation tools — no executable semantic/constraint correction exists');
});

test('B-12: CorrectionImpact (§20) — LOCAL scope for the translate capability: no secondary objects, reversibility mirrors the strategy', ()=>{
  const t = bTarget({ objectIds: ['obj-1', 'obj-2'] });
  const s = bStrategy({ name: 'translate-two', reversible: true });
  const impact = computeCorrectionImpact(t, s);
  eq(impact.targetId, t.id, 'impact names the target');
  eq(impact.strategyId, s.id, 'impact names the strategy');
  eq(impact.scope, 'LOCAL', 'T05 move_object mutates only the target objects (leaf-level capability profile)');
  deepEq(impact.secondaryObjects, [], 'LOCAL => no secondary objects');
  eq(impact.secondaryEffectCount, 0, 'count matches');
  eq(impact.reversible, true, 'reversibility mirrors the strategy');
  deepFrozen(impact, 'impact');
});

test('B-13: CorrectionImpact (§20) — SUBTREE for hierarchy capabilities (T10) with the affected subtree roots recorded; conservative GLOBAL for unknown toolIds', ()=>{
  const t = bTarget({ objectIds: ['obj-1', 'obj-2'] });
  const group = bStrategy({ name: 'regroup', commands: [{ kind: 'CreateNode', toolId: 'T10', input: { objectIds: ['obj-1', 'obj-2'] } }] });
  const impact = computeCorrectionImpact(t, group);
  eq(impact.scope, 'SUBTREE', 'grouping reparents descendants — SUBTREE blast radius');
  deepEq(impact.secondaryObjects, ['obj-1', 'obj-2'], 'the affected subtree roots are the target objects (descendant enumeration is execution-time, scene access pending)');
  eq(impact.secondaryEffectCount, 2, 'count matches');
  const unknown = bStrategy({ name: 'mystery', commands: [{ kind: 'MoveObject', toolId: 'T99', input: { objectIds: ['obj-1'] } }] });
  eq(computeCorrectionImpact(t, unknown).scope, 'GLOBAL', 'unknown toolId => conservative GLOBAL default');
});

test('B-14: CorrectionCost (§38) — deterministic integers: total = riskWeight × (commandCount + objectCount), objectCount deduped across commands', ()=>{
  const t = bTarget({ objectIds: ['obj-1', 'obj-2'] });
  const low = computeCorrectionCost(t, bStrategy({ risk: 'LOW' }));
  deepEq([low.commandCount, low.objectCount, low.riskWeight, low.total], [1, 2, 1, 3], 'LOW, 1 command, 2 objects');
  const med = computeCorrectionCost(t, bStrategy({ risk: 'MEDIUM', commands: [{ kind: 'TransformObject', toolId: 'T06', input: { objectIds: ['obj-1', 'obj-2'] } }] }));
  deepEq([med.commandCount, med.objectCount, med.riskWeight, med.total], [1, 2, 2, 6], 'MEDIUM multiplies');
  const high = computeCorrectionCost(t, bStrategy({ risk: 'HIGH', commands: [
    { kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'] } },
    { kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-2', 'obj-3'] } }] }));
  deepEq([high.commandCount, high.objectCount, high.riskWeight, high.total], [2, 3, 3, 15], 'HIGH, 2 commands, 3 unique objects');
  deepFrozen(low, 'cost');
});

test('B-15: impact/cost input discipline — invalid strategy/target refused with the structure-specific codes', ()=>{
  const t = bTarget();
  throwsWithCode(()=>computeCorrectionImpact(t, bStrategy({ risk: 'EXTREME' })), CorrectionErrorCodes.INVALID_STRATEGY, 'invalid risk');
  throwsWithCode(()=>computeCorrectionCost(null, bStrategy()), CorrectionErrorCodes.INVALID_TARGET, 'null target');
  throwsWithCode(()=>computeCorrectionImpact(t, 'nope'), CorrectionErrorCodes.INVALID_STRATEGY, 'non-object strategy');
});

test('B-16: §19 ranking, single candidate — EXACT priority = Severity(2) × Confidence(1) × Impact(1) × Correctability(1) = 2, factors and cost attached, selected = ranked[0]', ()=>{
  const t = bTarget(); // MEDIUM severity; the resolver strategy carries table confidence 1
  const res = resolveCorrectionDiagnosis(t);
  const sel = rankCorrectionStrategies(t, res.diagnosis);
  eq(sel.status, 'SELECTED', 'a resolved diagnosis selects');
  eq(sel.ranked.length, 1, 'one candidate');
  const entry = sel.ranked[0];
  eq(entry.strategy.id, res.diagnosis.recommendedStrategies[0].id, 'ranked entry is the resolver strategy');
  eq(entry.priority, 2 * 1 * 1 * 1, 'EXACT §19 product');
  expect(Math.abs(entry.priority - 2) < 1e-9, 'priority reads as 2');
  deepEq(entry.factors, { severity: CORRECTION_SEVERITY_WEIGHTS.MEDIUM, confidence: 1, impact: CORRECTION_SCOPE_WEIGHT.LOCAL, correctability: 1 }, 'factors are the disclosed §19 encodings');
  eq(entry.cost.total, 2, 'cost: riskWeight 1 × (1 command + 1 object)');
  eq(sel.selected.id, entry.strategy.id, 'selected === ranked[0].strategy');
  deepFrozen(sel, 'selection');
});

test('B-17: §19 ranking, multi-candidate — deterministic order with EXACT priorities (input deliberately out of priority order)', ()=>{
  const t = bTarget({ severity: 'HIGH', objectIds: ['obj-1', 'obj-2'] });
  const sB = bStrategy({ name: 'b-partially-reversible', reversible: false, confidence: 0.9 });        // 3×0.9×1×0.5 = 1.35
  const sA = bStrategy({ name: 'a-fully-reversible', reversible: true, confidence: 0.9 });             // 3×0.9×1×1   = 2.7
  const sC = bStrategy({ name: 'c-subtree', reversible: true, confidence: 0.4, risk: 'MEDIUM',
    commands: [{ kind: 'CreateNode', toolId: 'T10', input: { objectIds: ['obj-1', 'obj-2'] } }] });    // 3×0.4×0.5×1 = 0.6
  const d = bDiagnosis(t, [sB, sA, sC]);
  const sel = rankCorrectionStrategies(t, d);
  deepEq(sel.ranked.map(e => e.strategy.name), ['a-fully-reversible', 'b-partially-reversible', 'c-subtree'], 'descending priority order (the sort actually happened)');
  eq(sel.ranked[0].priority, (3 * 0.9 * 1 * 1), 'EXACT 2.7');
  eq(sel.ranked[1].priority, (3 * 0.9 * 1 * 0.5), 'EXACT 1.35');
  eq(sel.ranked[2].priority, (3 * 0.4 * 0.5 * 1), 'EXACT 0.6');
  eq(sel.selected.id, sA.id, 'the fully-reversible candidate wins');
});

test('B-18: §19 ranking tie-break — equal priorities keep the diagnosis recommendation order (deterministic stability, no entropy)', ()=>{
  const t = bTarget({ severity: 'MEDIUM' });
  const s1 = bStrategy({ name: 'alpha-first', confidence: 0.7 });
  const s2 = bStrategy({ name: 'beta-second', confidence: 0.7 });
  const sel = rankCorrectionStrategies(t, bDiagnosis(t, [s1, s2]));
  eq(sel.ranked[0].priority, sel.ranked[1].priority, 'genuinely tied');
  eq(sel.ranked[0].strategy.name, 'alpha-first', 'tie keeps recommendation order');
  eq(sel.ranked[1].strategy.name, 'beta-second', '…not reversed, not shuffled');
});

test('B-19: §19 strictly-positive property — even the worst legal candidate ranks strictly above zero (ranking viability, module-header disclosure 7)', ()=>{
  const t = bTarget({ severity: 'LOW' });
  const worst = bStrategy({ name: 'worst-legal', confidence: 0.01, reversible: false,
    commands: [{ kind: 'MoveObject', toolId: 'T99', input: { objectIds: ['obj-1'] } }] });
  const sel = rankCorrectionStrategies(t, bDiagnosis(t, [worst]));
  eq(sel.ranked[0].priority, 1 * 0.01 * 0.25 * 0.5, 'EXACT 0.00125 (LOW × 0.01 × GLOBAL × irreversible)');
  expect(sel.ranked[0].priority > 0, 'strictly positive — rankable');
});

test('B-20: ranking integrity — every ranked strategy comes from the diagnosis (never invented, §28), descending monotonicity, and input discipline', ()=>{
  const t = bTarget({ severity: 'HIGH', objectIds: ['obj-1', 'obj-2'] });
  const strategies = [bStrategy({ name: 'x1', confidence: 0.9 }), bStrategy({ name: 'x2', confidence: 0.5, reversible: false })];
  const d = bDiagnosis(t, strategies);
  const sel = rankCorrectionStrategies(t, d);
  expect(sel.ranked.every(e => d.recommendedStrategies.includes(e.strategy)), 'every ranked strategy is reference-identical to a diagnosis recommendation');
  for (let i = 1; i < sel.ranked.length; i++){
    expect(sel.ranked[i - 1].priority >= sel.ranked[i].priority, 'descending monotonic');
  }
  throwsWithCode(()=>rankCorrectionStrategies(t, bDiagnosis(t, [{ not: 'a strategy' }])), CorrectionErrorCodes.INVALID_STRATEGY, 'non-strategy entry surfaced by per-entry §9 validation');
  throwsWithCode(()=>rankCorrectionStrategies(t, bDiagnosis(t, [bStrategy({ risk: 'NOPE' })])), CorrectionErrorCodes.INVALID_STRATEGY, 'invalid strategy entry surfaced at ranking');
  throwsWithCode(()=>rankCorrectionStrategies(t, createCorrectionDiagnosis({ targetId: 'ctarget-somewhere-else', rootCause: 'POSITION_ERROR', confidence: 1, affectedObjects: ['obj-1'], recommendedStrategies: [bStrategy()] })),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'diagnosis.targetId must name the ranked target (§8 coherence)');
});

test('B-21: §27 explainCorrectionDiagnosis — deterministic plain-data explanation (two calls byte-identical), decision DIAGNOSED, >=3 reasons, zero function values', ()=>{
  const t = bTarget();
  const res = resolveCorrectionDiagnosis(t);
  const e1 = explainCorrectionDiagnosis(t, res.diagnosis);
  const e2 = explainCorrectionDiagnosis(t, res.diagnosis);
  eq(JSON.stringify(e1), JSON.stringify(e2), 'deterministic — identical bytes');
  eq(e1.decision, 'DIAGNOSED', 'decision label');
  eq(e1.subject, t.id, 'subject is the target id');
  expect(typeof e1.summary === 'string' && e1.summary.length > 0, 'summary present');
  expect(e1.summary.indexOf('POSITION_ERROR') !== -1, 'summary names the root cause');
  expect(Array.isArray(e1.reasons) && e1.reasons.length >= 3, 'at least three reasons');
  deepFrozen(e1, 'explanation');
  const fnScan = (v) => { if (typeof v === 'function') throw new Error('function value in explanation'); if (v && typeof v === 'object') for (const k of Object.keys(v)) fnScan(v[k]); };
  fnScan(e1);
});

test('B-22: §27 number formatting — floats render in canonical JS form inside the summary (no locale, no entropy)', ()=>{
  const t = bTarget({ observedValue: 0.1 + 0.2 });
  const res = resolveCorrectionDiagnosis(t);
  const e = explainCorrectionDiagnosis(t, res.diagnosis);
  expect(e.summary.indexOf('0.30000000000000004') !== -1, 'canonical JS number rendering (String(0.1+0.2) === "0.30000000000000004")');
});

test('B-23: §27 explainCorrectionStrategySelection — labeled factors with exact values, priority in the summary, alternatives counted', ()=>{
  const t = bTarget(); // MEDIUM severity, single resolver candidate
  const sel = rankCorrectionStrategies(t, resolveCorrectionDiagnosis(t).diagnosis);
  const e = explainCorrectionStrategySelection(t, sel);
  eq(e.decision, 'SELECTED', 'decision label');
  eq(e.subject, t.id, 'subject');
  deepEq(e.factors, [
    { label: 'severity', value: 2 }, { label: 'confidence', value: 1 },
    { label: 'impact', value: 1 }, { label: 'correctability', value: 1 }
  ], 'the four §19 factors, labeled and exact');
  expect(e.summary.indexOf('priority 2') !== -1, 'summary carries the exact priority');
  eq(e.alternatives, 0, 'single candidate => no alternatives');
  deepFrozen(e, 'explanation');
});

test('B-24: §27 selection determinism — two ranks of identical inputs produce byte-identical explanations', ()=>{
  const t = bTarget({ severity: 'HIGH', objectIds: ['obj-1', 'obj-2'] });
  const strategies = [bStrategy({ name: 's1', confidence: 0.9 }), bStrategy({ name: 's2', confidence: 0.6, reversible: false })];
  const e1 = explainCorrectionStrategySelection(t, rankCorrectionStrategies(t, bDiagnosis(t, strategies)));
  const e2 = explainCorrectionStrategySelection(t, rankCorrectionStrategies(t, bDiagnosis(t, strategies)));
  eq(JSON.stringify(e1), JSON.stringify(e2), 'byte-identical');
  eq(e1.alternatives, 1, 'two candidates => one alternative');
});

test('B-25: plural resolver — target input order preserved, frozen array, non-array input refused', ()=>{
  const results = resolveCorrectionDiagnoses([
    bTarget({ category: 'POSITION', metric: 'position.x' }),
    bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }),
    bTarget({ category: 'ALIGNMENT', metric: 'alignment.deviation.px', objectIds: ['obj-1', 'obj-2'] })
  ]);
  expect(Array.isArray(results), 'array result');
  deepEq(results.map(r => r.status), ['RESOLVED', 'NO_CAPABILITY', 'RESOLVED'], 'input target order preserved');
  deepFrozen(results, 'results');
  throwsWithCode(()=>resolveCorrectionDiagnoses('nope'), CorrectionErrorCodes.INVALID_TARGET, 'non-array input');
  throwsWithCode(()=>resolveCorrectionDiagnoses([null]), CorrectionErrorCodes.INVALID_TARGET, 'null entry');
});

// ===========================================================================
// CHECKPOINT C — correction planning (§10/§11/§35/§36/§37/§40/§41/§42/§43):
// factory-anchored command materialization, dependency scan, planning-time
// hard-constraint safety, scope control, plan generation, §42 preview.
// NO §14 acceptance here — that boundary is Checkpoint D's (C-20).
// ===========================================================================

// Hand-built CARRIED strategy with an explicit delta — used by the gate and
// generator tests that must stay INDEPENDENT of the deriver (stub-kill site
// disjointness; the same rationale as B's standalone ranking tests).
function cCarriedTranslateStrategy(over={}){
  return createCorrectionStrategy({ name: 'translate-to-target', applicableTo: ['POSITION_ERROR'],
    commands: [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: -5, y: 0 } } }],
    expectedEffect: { metric: 'position.x', direction: 'TOWARD_TARGET' },
    risk: 'LOW', reversible: true, confidence: 1, ...over });
}
function cCarriedDiagnosis(target, strategy, over={}){
  return createCorrectionDiagnosis({ targetId: target.id, rootCause: 'POSITION_ERROR',
    confidence: target.confidence, affectedObjects: [...target.objectIds],
    recommendedStrategies: [strategy], ...over });
}
// Plain constraint records — the shape ConstraintStore.list() hands over
// (constraints.js:318-346); the gate reads id/type/objectIds/strength/enabled.
function cConstraint(over={}){
  return { id: 'c-fix', type: 'horizontal', objectIds: ['obj-1', 'obj-2'], strength: 'required', enabled: true, source: 'user', parameters: {}, ...over };
}
// Injected scene reader — the duck-typed scenegraph read contract
// (findNodeByObjectId; the module never constructs a SceneGraph).
function cSceneFinder(){
  const nodes = {
    'obj-1': { id: 'n-1', objectRef: 'obj-1', parent: 'n-root', children: [] },
    'obj-2': { id: 'n-2', objectRef: 'obj-2', parent: 'n-mid', children: [] },
    'obj-9': { id: 'n-9', objectRef: 'obj-9', parent: null, children: [] }
  };
  const parents = { 'n-root': null, 'n-mid': 'n-root', 'n-9': null };
  return (oid) => {
    const n = nodes[oid];
    if (!n) return undefined;
    const ancestors = [];
    let p = n.parent;
    while (p){ ancestors.push(p); p = parents[p]; }
    return { ...n, ancestors };
  };
}
const cSemanticRecords = [
  { objectId: 'obj-1', relationships: [{ type: 'labels', targetObjectId: 'obj-2' }] },
  { objectId: 'obj-3', relationships: [{ type: 'decorates', targetObjectId: 'obj-1' }] },
  { objectId: 'obj-4', relationships: [{ type: 'references', targetObjectId: 'obj-9' }] }
];

// ---- Capability input contract + axis tables (disclosures 19/20) ----------

test('C-1: T05 delta derivation — position.x/position.y metrics materialize the EXACT factory-anchored delta (§43 rule-based prediction, disclosure 19)', ()=>{
  const target = bTarget({ metric: 'position.x', observedValue: 5, targetValue: 0 });
  const res = resolveCorrectionDiagnosis(target);
  const derived = deriveCorrectionCommands(target, res.diagnosis.recommendedStrategies[0]);
  eq(derived.status, 'DERIVED', 'position.x with numeric target evidence is derivable');
  deepEq(derived.commands, [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: -5, y: 0 } } }], 'exact T05 delta: to - from on the named axis, 0 on the other');
  deepEq(derived.derivation, [{ commandIndex: 0, toolId: 'T05', source: 'DERIVED', derivedKeys: ['delta'] }], 'derivation evidence records what was materialized');
  const yTarget = bTarget({ metric: 'position.y', observedValue: 2, targetValue: 9, objectIds: ['obj-1', 'obj-2'] });
  const yRes = resolveCorrectionDiagnosis(yTarget);
  const yDerived = deriveCorrectionCommands(yTarget, yRes.diagnosis.recommendedStrategies[0]);
  eq(yDerived.status, 'DERIVED', 'position.y is derivable');
  deepEq(yDerived.commands[0].input.delta, { x: 0, y: 7 }, 'delta.y = targetValue - observedValue, delta.x = 0');
  deepEq(yDerived.commands[0].input.objectIds, ['obj-1', 'obj-2'], 'objectIds stay in target order');
  deepFrozen(derived, 'derivation result');
});

test('C-2: T07 opacity derivation — appearance.opacity-class metrics materialize the exact opacity; fill-class metrics refuse (no fabricated fill records)', ()=>{
  const target = bTarget({ category: 'APPEARANCE', metric: 'appearance.opacity', observedValue: 0.75, targetValue: 1 });
  const res = resolveCorrectionDiagnosis(target);
  eq(res.diagnosis.recommendedStrategies[0].commands[0].toolId, 'T07', 'STYLE capability is apply-corrected-style/T07');
  const derived = deriveCorrectionCommands(target, res.diagnosis.recommendedStrategies[0]);
  eq(derived.status, 'DERIVED', 'opacity-class metric is derivable from numeric target evidence');
  deepEq(derived.commands, [{ kind: 'UpdateAppearance', toolId: 'T07', input: { objectIds: ['obj-1'], opacity: 1 } }], 'exact T07 opacity input');
  const styleTarget = bTarget({ category: 'APPEARANCE', metric: 'style.opacity', observedValue: 0.25, targetValue: 0.5 });
  const styleDerived = deriveCorrectionCommands(styleTarget, resolveCorrectionDiagnosis(styleTarget).diagnosis.recommendedStrategies[0]);
  eq(styleDerived.status, 'DERIVED', "style.opacity matches under the 'style' prefix too");
  eq(styleDerived.commands[0].input.opacity, 0.5, 'opacity = targetValue');
  const fillTarget = bTarget({ category: 'APPEARANCE', metric: 'appearance.fill', observedValue: 1, targetValue: 0 });
  const fillDerived = deriveCorrectionCommands(fillTarget, resolveCorrectionDiagnosis(fillTarget).diagnosis.recommendedStrategies[0]);
  eq(fillDerived.status, 'NOT_DERIVABLE', 'a fill record cannot be derived from numeric §7 evidence — refused, never fabricated');
  eq(fillDerived.details.toolId, 'T07', 'refusal names the capability');
});

test('C-3: derivation refusals — missing targetValue, axis-less position metrics, and rule-less tools are NOT_DERIVABLE with exact missing keys (no fabricated parameters)', ()=>{
  const noTargetValue = bTarget({ metric: 'position.x', targetValue: undefined });
  const noTV = deriveCorrectionCommands(noTargetValue, resolveCorrectionDiagnosis(noTargetValue).diagnosis.recommendedStrategies[0]);
  eq(noTV.status, 'NOT_DERIVABLE', 'position.x without a target value has no deterministic delta');
  deepEq(noTV.details.missing, ['delta'], 'refusal names the unsatisfied input key');
  const axisLess = bTarget({ metric: 'position', observedValue: 5, targetValue: 0 });
  const al = deriveCorrectionCommands(axisLess, resolveCorrectionDiagnosis(axisLess).diagnosis.recommendedStrategies[0]);
  eq(al.status, 'NOT_DERIVABLE', "plain 'position' names no axis — refused");
  const alignTarget = bTarget({ category: 'ALIGNMENT', metric: 'alignment.deviation.px', objectIds: ['obj-1', 'obj-2'] });
  const alignDerived = deriveCorrectionCommands(alignTarget, resolveCorrectionDiagnosis(alignTarget).diagnosis.recommendedStrategies[0]);
  eq(alignDerived.status, 'NOT_DERIVABLE', 'align-to-axis (T08) has no derivation rule in C — axis/mode come from scene context, not target evidence');
  deepEq(alignDerived.details.missing, ['axis', 'mode'], 'exact missing-key list from the capability input contract');
  eq(alignDerived.details.toolId, 'T08', 'refusal names the tool');
  const reorderTarget = bTarget({ category: 'STRUCTURE', metric: 'structure.zorder' });
  const reorderDerived = deriveCorrectionCommands(reorderTarget, resolveCorrectionDiagnosis(reorderTarget).diagnosis.recommendedStrategies[0]);
  eq(reorderDerived.status, 'NOT_DERIVABLE', 'reorder-to-zorder (T12) cannot derive the operation vocabulary from a scalar');
  deepEq(reorderDerived.details.missing, ['operation'], 'exact missing-key list');
});

test('C-4: derivation CARRY path — schema-complete inputs pass through untouched (T10/T11 on structure.grouping); contract shape classes are enforced; input discipline', ()=>{
  const groupTarget = bTarget({ category: 'STRUCTURE', metric: 'structure.grouping', objectIds: ['obj-1', 'obj-2'] });
  const groupRes = resolveCorrectionDiagnosis(groupTarget);
  const groupStrategy = groupRes.diagnosis.recommendedStrategies.find(s => s.commands[0].toolId === 'T10');
  const carried = deriveCorrectionCommands(groupTarget, groupStrategy);
  eq(carried.status, 'DERIVED', 'T10 group input {objectIds} is already schema-complete');
  deepEq(carried.derivation, [{ commandIndex: 0, toolId: 'T10', source: 'CARRIED', derivedKeys: [] }], 'CARRIED source, nothing materialized');
  deepEq(carried.commands, groupStrategy.commands, 'carried commands are byte-identical to the strategy input');
  const tiny = createCorrectionStrategy({ name: 'regroup-into-container', applicableTo: ['STRUCTURAL_ERROR'],
    commands: [{ kind: 'CreateNode', toolId: 'T10', input: { objectIds: ['obj-1'] } }],
    expectedEffect: { metric: 'structure.grouping', direction: 'TOWARD_TARGET' }, risk: 'MEDIUM', reversible: true, confidence: 1 });
  const tinyDerived = deriveCorrectionCommands(groupTarget, tiny);
  eq(tinyDerived.status, 'NOT_DERIVABLE', 'T10 with a single object violates the contract minimum (live T10 validate requires >=2) — refused');
  throwsWithCode(() => deriveCorrectionCommands('nope', groupStrategy), CorrectionErrorCodes.INVALID_TARGET, 'invalid target refused');
  throwsWithCode(() => deriveCorrectionCommands(groupTarget, 'nope'), CorrectionErrorCodes.INVALID_STRATEGY, 'invalid strategy refused');
});

test('C-5: dependency scan (§41) — affected objects -> dependencies (ancestor chain) -> constraints -> semantic relationships, injected duck-typed context, input order preserved', ()=>{
  const report = scanCorrectionDependencies(['obj-1', 'obj-2'], {
    scene: { findNodeByObjectId: cSceneFinder() },
    constraints: [cConstraint({ id: 'c-a', type: 'horizontal', objectIds: ['obj-1', 'obj-2'] }),
                  cConstraint({ id: 'c-b', type: 'equalWidth', objectIds: ['obj-9', 'obj-10'], strength: 'weak' })],
    semantic: cSemanticRecords
  });
  deepEq(report.affectedObjects, ['obj-1', 'obj-2'], 'affected objects in input order');
  deepEq(report.dependencies, [
    { objectId: 'obj-1', nodeId: 'n-1', ancestors: ['n-root'] },
    { objectId: 'obj-2', nodeId: 'n-2', ancestors: ['n-mid', 'n-root'] }
  ], 'scene dependencies: node id + ancestor chain nearest-parent-first');
  deepEq(report.constraints.map(c => c.id), ['c-a'], 'only constraints TOUCHING affected objects; input order kept; c-b touches none of obj-1/obj-2');
  deepEq(report.semanticRelationships, [
    { type: 'labels', sourceObjectId: 'obj-1', targetObjectId: 'obj-2' },
    { type: 'decorates', sourceObjectId: 'obj-3', targetObjectId: 'obj-1' }
  ], 'relationships touching the affected set from BOTH directions (source or target); record order then relationship order; obj-4 excluded');
  deepEq(report.scanned, { scene: true, constraints: true, semantic: true }, 'all three stages scanned');
  deepFrozen(report, 'dependency report');
});

test('C-6: dependency scan partial honesty — absent stages are reported unscanned (never silently "empty because checked"); input discipline', ()=>{
  const report = scanCorrectionDependencies(['obj-1'], {});
  deepEq(report, { affectedObjects: ['obj-1'], dependencies: [], constraints: [], semanticRelationships: [], scanned: { scene: false, constraints: false, semantic: false } }, 'exact unscanned report');
  deepFrozen(report, 'report frozen');
  const partial = scanCorrectionDependencies(['obj-1'], { constraints: [cConstraint()] });
  deepEq(partial.scanned, { scene: false, constraints: true, semantic: false }, 'per-stage flags track exactly what was provided');
  throwsWithCode(() => scanCorrectionDependencies('nope', {}), CorrectionErrorCodes.INVALID_PLAN, 'non-array objectIds refused (planning-domain input)');
  throwsWithCode(() => scanCorrectionDependencies([], {}), CorrectionErrorCodes.INVALID_PLAN, 'empty affected set refused — a dependency scan of nothing is meaningless');
});

test('C-7: safety gate PRESERVED (§36/§37) — orthogonal hard constraint survives, soft conflict becomes a recorded trade-off, disabled constraints are invisible', ()=>{
  const commands = [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: -5, y: 0 } } }];
  const verdict = evaluateCorrectionSafety(['obj-1'], commands, [
    cConstraint({ id: 'c-hard-y', type: 'horizontal', objectIds: ['obj-1', 'obj-2'], strength: 'required' }),   // pins y — orthogonal to dx-only
    cConstraint({ id: 'c-soft-x', type: 'vertical', objectIds: ['obj-1', 'obj-3'], strength: 'weak' }),         // pins x — soft trade-off
    cConstraint({ id: 'c-off', type: 'vertical', objectIds: ['obj-1', 'obj-2'], strength: 'required', enabled: false })
  ]);
  eq(verdict.status, 'PRESERVED', 'dx-only translation cannot break a y-pinning hard constraint');
  deepEq(verdict.context, { violatedConstraints: [], affectedConstraints: ['c-hard-y', 'c-soft-x'], hardConstraintViolation: false }, 'exact §35 ConstraintCorrectionContext (disabled constraint invisible)');
  deepEq(verdict.softTradeOffs, [{ constraintId: 'c-soft-x', type: 'vertical', strength: 'weak' }], 'soft conflict recorded as a trade-off (§37)');
  deepEq(verdict.hardConstraintsPreserved, ['c-hard-y'], 'orthogonal hard constraint verified preserved');
  deepEq(verdict.mutationAxes, ['x'], 'mutation axes derived from the concrete delta');
  deepFrozen(verdict, 'safety verdict');
});

test('C-8: safety gate REJECTED (§36) — a hard constraint on a mutated axis REJECTS with the exact §35 context; unknown hard types are conservative; appearance/z-order mutations never conflict', ()=>{
  const commands = [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: -5, y: 0 } } }];
  const hardX = cConstraint({ id: 'c-hard-x', type: 'vertical', objectIds: ['obj-1', 'obj-2'], strength: 'required' });
  const rejected = evaluateCorrectionSafety(['obj-1'], commands, [hardX]);
  eq(rejected.status, 'REJECTED', 'hard (required) constraint pins x; the correction mutates x — REJECT');
  deepEq(rejected.context, { violatedConstraints: [hardX], affectedConstraints: ['c-hard-x'], hardConstraintViolation: true }, 'exact §35 context: violated records, affected ids, hard flag');
  deepEq(rejected.softTradeOffs, [], 'no soft trade-offs on a hard rejection');
  const conservative = evaluateCorrectionSafety(['obj-1'], commands, [cConstraint({ id: 'c-mystery', type: 'mysteryPin', objectIds: ['obj-1'], strength: 'required' })]);
  eq(conservative.status, 'REJECTED', 'an unknown hard-constraint type cannot be PROVEN preserved — conservative REJECT (§36 bias)');
  const styleOnly = evaluateCorrectionSafety(['obj-1'], [{ kind: 'UpdateAppearance', toolId: 'T07', input: { objectIds: ['obj-1'], opacity: 0.5 } }], [hardX]);
  eq(styleOnly.status, 'PRESERVED', 'appearance mutations have no geometric axes — a hard geometric constraint cannot conflict');
  const zOnly = evaluateCorrectionSafety(['obj-1'], [{ kind: 'SetZOrder', toolId: 'T12', input: { objectIds: ['obj-1'], operation: 'front' } }], [hardX]);
  eq(zOnly.status, 'PRESERVED', 'z-order mutations move no geometric axis');
});

test('C-9: scope control (§40) — command references must stay inside the required set; violations name the exact command and offenders', ()=>{
  const contained = verifyCorrectionScope(['obj-1', 'obj-2'], [
    { kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1', 'obj-2'], delta: { x: 1, y: 0 } } }
  ]);
  eq(contained.status, 'CONTAINED', 'target-scoped commands are contained');
  deepEq(contained.referenced, ['obj-1', 'obj-2'], 'referenced ids in command order, deduped');
  deepEq(contained.violations, [], 'no violations');
  const exceeded = verifyCorrectionScope(['obj-1'], [
    { kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: 1, y: 0 } } },
    { kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1', 'obj-9', 'obj-7'], delta: { x: 1, y: 0 } } }
  ]);
  eq(exceeded.status, 'EXCEEDED', 'a command referencing obj-9/obj-7 exceeds the required scope');
  deepEq(exceeded.violations, [{ commandIndex: 1, toolId: 'T05', offenders: ['obj-9', 'obj-7'] }], 'exact violation record: command index, tool, offender ids in input order');
  deepEq(exceeded.referenced, ['obj-1', 'obj-9', 'obj-7'], 'referenced lists everything the plan would touch');
  deepFrozen(exceeded, 'scope verdict');
});
test('C-10: generateCorrectionPlan READY — exact §10 plan content: materialized commands, expectedImprovement, riskAssessment, pre/postconditions (§43 rule-based), deep-frozen', ()=>{
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: ranked.selected });
  eq(outcome.status, 'READY', 'a derivable POSITION capability plans READY');
  const plan = outcome.plan;
  eq(validateCorrectionPlan(plan).valid, true, 'generated plan passes the §10 validator');
  eq(plan.sessionId, 'loop-x', 'plan names the owning session');
  deepEq(plan.diagnosis, res.diagnosis, 'plan embeds the diagnosis');
  deepEq(plan.strategy, ranked.selected, 'plan embeds the selected strategy');
  deepEq(plan.commands, [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-1'], delta: { x: -5, y: 0 } } }], 'plan commands are the MATERIALIZED factory-anchored descriptors');
  deepEq(plan.expectedImprovement, { metric: 'position.x', from: 5, to: 0, delta: -5, direction: 'TOWARD_TARGET' }, 'expectedImprovement from target evidence');
  deepEq(plan.riskAssessment, { level: 'LOW', reversible: true, scope: 'LOCAL', secondaryObjectCount: 0 }, 'riskAssessment from §9 risk + §20 impact');
  deepEq(plan.preconditions, [
    { kind: 'objects-exist', objectIds: ['obj-1'] },
    { kind: 'tools-available', toolIds: ['T05'] }
  ], 'preconditions: objects exist, capability tools available (no constraint context -> no constraint precondition)');
  deepEq(plan.postconditions, [
    { kind: 'metric-moves-toward-target', metric: 'position.x', from: 5, to: 0 }
  ], 'postconditions: the metric moves toward its target');
  deepEq(outcome.planning.scope.status, 'CONTAINED', '§40 scope verified at generation');
  deepEq(outcome.planning.safety.status, 'PRESERVED', '§35 gate ran (empty constraint set) and preserved');
  deepEq(outcome.planning.dependencies.scanned, { scene: false, constraints: false, semantic: false }, '§41 scan ran with no context — honestly unscanned');
  deepFrozen(outcome, 'plan outcome');
});

test('C-11: generator constraint evidence — preserved hard ids land in pre/postconditions; soft trade-offs land in riskAssessment.constraints (§37 recorded for D); deterministic ids', ()=>{
  const target = bTarget();
  const strategy = cCarriedTranslateStrategy();
  const diagnosis = cCarriedDiagnosis(target, strategy);
  const context = { constraints: [
    cConstraint({ id: 'c-hard-y', type: 'horizontal', objectIds: ['obj-1', 'obj-2'], strength: 'required' }),
    cConstraint({ id: 'c-soft-x', type: 'vertical', objectIds: ['obj-1', 'obj-3'], strength: 'weak' })
  ] };
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis, strategy, context });
  eq(outcome.status, 'READY', 'orthogonal hard + soft conflict plans READY with evidence');
  deepEq(outcome.plan.riskAssessment.constraints, { hardConstraintsPreserved: ['c-hard-y'], softTradeOffs: [{ constraintId: 'c-soft-x', type: 'vertical', strength: 'weak' }] }, 'constraint evidence on the plan');
  deepEq(outcome.plan.preconditions[2], { kind: 'hard-constraints-preserved', constraintIds: ['c-hard-y'] }, 'precondition: verified-preserved hard constraints');
  deepEq(outcome.plan.postconditions[1], { kind: 'hard-constraints-intact', constraintIds: ['c-hard-y'] }, 'postcondition: hard constraints still intact after execution');
  const again = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis, strategy, context });
  eq(again.plan.id, outcome.plan.id, 'same inputs (incl. context) => same content-derived plan id (§44)');
});

test('C-12: generator HARD_CONSTRAINT_REJECTED — a plan that would violate a hard constraint is REFUSED with the §35 context and NO plan is emitted (uses a CARRIED strategy: kill-site disjoint)', ()=>{
  const target = bTarget();
  const strategy = cCarriedTranslateStrategy();
  const diagnosis = cCarriedDiagnosis(target, strategy);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis, strategy,
    context: { constraints: [cConstraint({ id: 'c-hard-x', type: 'vertical', objectIds: ['obj-1', 'obj-2'], strength: 'required' })] } });
  eq(outcome.status, 'PLAN_REFUSED', '§36: would violate -> REJECT');
  eq(outcome.reason, 'HARD_CONSTRAINT_REJECTED', 'refusal reason from the vocabulary');
  eq(outcome.plan, undefined, 'no plan object is emitted for a rejected correction');
  deepEq(outcome.details.context, { violatedConstraints: [cConstraint({ id: 'c-hard-x', type: 'vertical', objectIds: ['obj-1', 'obj-2'], strength: 'required' })], affectedConstraints: ['c-hard-x'], hardConstraintViolation: true }, '§35 ConstraintCorrectionContext carried in the refusal details');
});

test('C-13: generator evidence refusals — INSUFFICIENT_EVIDENCE for underivable capabilities; OUT_OF_SCOPE for foreign carried objectIds (§40); refusal vocabulary frozen', ()=>{
  deepEq([...PLAN_REFUSAL_REASONS], ['INSUFFICIENT_EVIDENCE', 'HARD_CONSTRAINT_REJECTED', 'OUT_OF_SCOPE'], 'refusal vocabulary exact + frozen');
  expect(Object.isFrozen(PLAN_REFUSAL_REASONS), 'refusal vocabulary frozen');
  const alignTarget = bTarget({ category: 'ALIGNMENT', metric: 'alignment.deviation.px', objectIds: ['obj-1', 'obj-2'] });
  const alignRes = resolveCorrectionDiagnosis(alignTarget);
  const alignRanked = rankCorrectionStrategies(alignTarget, alignRes.diagnosis);
  const alignOutcome = generateCorrectionPlan({ sessionId: 'loop-x', target: alignTarget, diagnosis: alignRes.diagnosis, strategy: alignRanked.selected });
  eq(alignOutcome.status, 'PLAN_REFUSED', 'align-to-axis cannot be materialized from target evidence alone in C');
  eq(alignOutcome.reason, 'INSUFFICIENT_EVIDENCE', 'honest refusal, not a guessed axis/mode');
  eq(alignOutcome.plan, undefined, 'no fabricated plan');
  const foreign = createCorrectionStrategy({ name: 'translate-to-target', applicableTo: ['POSITION_ERROR'],
    commands: [{ kind: 'MoveObject', toolId: 'T05', input: { objectIds: ['obj-foreign'], delta: { x: 1, y: 0 } } }],
    expectedEffect: { metric: 'position.x', direction: 'TOWARD_TARGET' }, risk: 'LOW', reversible: true, confidence: 1 });
  const scopeTarget = bTarget();
  const scopeOutcome = generateCorrectionPlan({ sessionId: 'loop-x', target: scopeTarget, diagnosis: cCarriedDiagnosis(scopeTarget, foreign), strategy: foreign });
  eq(scopeOutcome.status, 'PLAN_REFUSED', 'a strategy referencing objects outside the target scope is refused (§40)');
  eq(scopeOutcome.reason, 'OUT_OF_SCOPE', 'scope refusal reason');
  deepEq(scopeOutcome.details.violations, [{ commandIndex: 0, toolId: 'T05', offenders: ['obj-foreign'] }], 'exact scope violations in the refusal details');
});

test('C-14: generator coherence discipline — strategy must be a recommended strategy of the embedded diagnosis; target/diagnosis/plan-field breaches throw the structure-specific codes', ()=>{
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const impostor = cCarriedTranslateStrategy({ name: 'impostor-strategy' });
  throwsWithCode(() => generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: impostor }),
    CorrectionErrorCodes.INVALID_STRATEGY, 'a strategy outside diagnosis.recommendedStrategies is refused (§28: plans are diagnosis-backed)');
  const other = bTarget({ observedValue: 7 });
  throwsWithCode(() => generateCorrectionPlan({ sessionId: 'loop-x', target: other, diagnosis: res.diagnosis, strategy: ranked.selected }),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'diagnosis.targetId must name the planned target (§8 coherence, B discipline)');
  throwsWithCode(() => generateCorrectionPlan({ sessionId: '', target, diagnosis: res.diagnosis, strategy: ranked.selected }),
    CorrectionErrorCodes.INVALID_PLAN, 'sessionId is a mandatory §10 field');
  const semanticRes = resolveCorrectionDiagnosis(bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }));
  eq(semanticRes.status, 'NO_CAPABILITY', '§28 chain-end: no capability for SEMANTIC');
  throwsWithCode(() => generateCorrectionPlan({ sessionId: 'loop-x', target: bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }), diagnosis: semanticRes, strategy: ranked.selected }),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'a NO_CAPABILITY resolution is NOT a diagnosis — refused by the §8 validator');
});

test('C-15: generator determinism (§44) — identical requests are byte-identical; content changes move the plan id; no-context plans omit the constraints evidence key (disclosed omit-absent)', ()=>{
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const request = { sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: ranked.selected };
  const a = generateCorrectionPlan(request);
  const b = generateCorrectionPlan(request);
  eq(JSON.stringify(a) === JSON.stringify(b), true, 'byte-identical outcomes (insertion order too)');
  const changed = bTarget({ observedValue: 6 });
  const res2 = resolveCorrectionDiagnosis(changed);
  const ranked2 = rankCorrectionStrategies(changed, res2.diagnosis);
  const c = generateCorrectionPlan({ sessionId: 'loop-x', target: changed, diagnosis: res2.diagnosis, strategy: ranked2.selected });
  expect(a.plan.id !== c.plan.id, 'content change moves the content-derived plan id');
  expect(Object.prototype.hasOwnProperty.call(a.plan.riskAssessment, 'constraints') === false, 'no constraint context -> no constraints key on riskAssessment (omit-absent, disclosure 22)');
});

test('C-16: buildCorrectionPreview (§42) — exact dry-run record: affectedObjects, commands, §43 RULE_BASED expectedEvaluation, risks with exact §38 cost; SUBTREE variant; deterministic', ()=>{
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: ranked.selected });
  const preview = buildCorrectionPreview(target, outcome.plan);
  deepEq(Object.keys(preview), ['affectedObjects', 'commands', 'expectedEvaluation', 'risks'], 'exact §42 CorrectionPreview key set');
  deepEq(preview.affectedObjects, ['obj-1'], 'affected objects: target order');
  deepEq(preview.commands, outcome.plan.commands, 'preview commands are the plan commands (dry run shows exactly what would execute)');
  deepEq(preview.expectedEvaluation, { metric: 'position.x', before: 5, expectedAfter: 0, expectedDelta: -5, direction: 'TOWARD_TARGET', basis: 'RULE_BASED' }, '§43 rule-based prediction — NOT an EvaluationResult (§12 authority stays in evaluation.js)');
  deepEq(preview.risks, { level: 'LOW', reversible: true, scope: 'LOCAL', secondaryObjectCount: 0,
    cost: { targetId: target.id, strategyId: outcome.plan.strategy.id, commandCount: 1, objectCount: 1, riskWeight: 1, total: 2 }, softTradeOffs: [] }, 'risks carry level/reversibility/scope/§38 cost/§37 trade-offs');
  deepFrozen(preview, 'preview frozen');
  const again = buildCorrectionPreview(target, outcome.plan);
  eq(JSON.stringify(again) === JSON.stringify(preview), true, 'byte-identical previews (deterministic)');
  const groupTarget = bTarget({ category: 'STRUCTURE', metric: 'structure.grouping', objectIds: ['obj-1', 'obj-2'], targetValue: undefined });
  const groupRes = resolveCorrectionDiagnosis(groupTarget);
  const groupStrategy = groupRes.diagnosis.recommendedStrategies.find(s => s.commands[0].toolId === 'T10');
  const groupOutcome = generateCorrectionPlan({ sessionId: 'loop-x', target: groupTarget, diagnosis: groupRes.diagnosis, strategy: groupStrategy });
  eq(groupOutcome.status, 'READY', 'schema-complete group capability plans READY (carried)');
  const groupPreview = buildCorrectionPreview(groupTarget, groupOutcome.plan);
  eq(groupPreview.risks.scope, 'SUBTREE', 'hierarchy capability impact is SUBTREE (§20, disclosure 16)');
  deepEq(groupPreview.affectedObjects, ['obj-1', 'obj-2'], 'SUBTREE records the affected subtree roots in target order');
  deepEq(groupPreview.expectedEvaluation, { metric: 'structure.grouping', before: 5, expectedAfter: null, expectedDelta: null, direction: 'TOWARD_TARGET', basis: 'RULE_BASED' }, 'prediction degrades honestly when the metric carries no target value (expectedAfter/expectedDelta null)');
});

test('C-17: preview input discipline — target/diagnosis incoherence and non-plan inputs are refused with the structure-specific codes', ()=>{
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: ranked.selected });
  throwsWithCode(() => buildCorrectionPreview(bTarget({ observedValue: 7 }), outcome.plan),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'plan.diagnosis.targetId must name the previewed target');
  throwsWithCode(() => buildCorrectionPreview(target, 'nope'), CorrectionErrorCodes.INVALID_PLAN, 'non-plan input refused');
});

test('C-18: LIVE grounding — every generator-emitted command passes the live ToolRegistry validators; every plan kind maps to a REAL transaction.js factory; the local input contract is necessary AND sufficient against the live validators', ()=>{
  const KIND_TO_FACTORY = {
    MoveObject: 'createMoveObjectCommand', TransformObject: 'createTransformObjectCommand',
    UpdateAppearance: 'createUpdateAppearanceCommand', SetZOrder: 'createSetZOrderCommand',
    CreateNode: 'createCreateNodeCommand', DeleteNode: 'createDeleteNodeCommand'
  };
  for (const r of CORRECTION_CAPABILITY_RECIPES){
    expect(Object.prototype.hasOwnProperty.call(KIND_TO_FACTORY, r.command.kind), `recipe kind ${r.command.kind} is a pinned factory family`);
    expect(typeof transactionNS[KIND_TO_FACTORY[r.command.kind]] === 'function', `${r.command.kind} maps to the REAL factory transaction.js:${KIND_TO_FACTORY[r.command.kind]}`);
  }
  const contractTools = Object.keys(CORRECTION_CAPABILITY_INPUT_CONTRACT).sort();
  deepEq(contractTools, ['T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'], 'the contract covers exactly the 8 capability-backed mutation tools');
  for (const r of CORRECTION_CAPABILITY_RECIPES){
    expect(Object.prototype.hasOwnProperty.call(CORRECTION_CAPABILITY_INPUT_CONTRACT, r.command.toolId), `recipe tool ${r.command.toolId} has a contract entry`);
  }
  // Live necessity: deleting any contract-required key from a complete input must FAIL the live validator.
  const completeInputs = {
    T05: { objectIds: ['x'], delta: { x: 1, y: 0 } },
    T06: { objectIds: ['x'], transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } },
    T07: { objectIds: ['x'], opacity: 0.5 },
    T08: { objectIds: ['x', 'y'], axis: 'horizontal', mode: 'center' },
    T09: { objectIds: ['x', 'y', 'z'], axis: 'horizontal', mode: 'centers' },
    T10: { objectIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] },
    T11: { objectIds: ['00000000-0000-4000-8000-000000000003'] },
    T12: { objectIds: ['x'], operation: 'front' }
  };
  for (const [toolId, complete] of Object.entries(completeInputs)){
    eq(toolRegistry.validate(toolId, complete, {}).valid, true, `${toolId}: contract-complete input passes the LIVE validator (sufficiency)`);
    for (const requiredKey of Object.keys(CORRECTION_CAPABILITY_INPUT_CONTRACT[toolId].required)){
      const broken = { ...complete }; delete broken[requiredKey];
      eq(toolRegistry.validate(toolId, broken, {}).valid, false, `${toolId}: omitting contract key '${requiredKey}' FAILS the live validator (necessity)`);
    }
  }
  // Live sufficiency for generator OUTPUTS: every READY capability class emits schema-valid inputs.
  const readyScenarios = [
    bTarget(),
    bTarget({ category: 'APPEARANCE', metric: 'appearance.opacity', observedValue: 0.75, targetValue: 1 }),
    bTarget({ category: 'STRUCTURE', metric: 'structure.grouping', objectIds: ['obj-1', 'obj-2'] })
  ];
  for (const t of readyScenarios){
    const res = resolveCorrectionDiagnosis(t);
    const ranked = rankCorrectionStrategies(t, res.diagnosis);
    const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target: t, diagnosis: res.diagnosis, strategy: ranked.selected });
    eq(outcome.status, 'READY', `${t.metric}: READY`);
    for (const cmd of outcome.plan.commands){
      const check = toolRegistry.validate(cmd.toolId, cmd.input, {});
      eq(check.valid, true, `${cmd.toolId} generator output must pass the LIVE validator (${JSON.stringify(check.errors || [])})`);
    }
  }
});

test('C-19: integrated chain — resolve -> rank -> generate -> preview end-to-end frozen and deterministic; the §28 chain-end (NO_CAPABILITY) cannot enter planning', ()=>{
  const target = bTarget({ objectIds: ['obj-1', 'obj-2'], metric: 'position.x', observedValue: 5, targetValue: 0 });
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-chain', target, diagnosis: res.diagnosis, strategy: ranked.selected });
  const preview = buildCorrectionPreview(target, outcome.plan);
  eq(outcome.status, 'READY', 'chain produces a READY plan');
  deepEq(outcome.plan.commands[0].input, { objectIds: ['obj-1', 'obj-2'], delta: { x: -5, y: 0 } }, 'chain commands carry the derived delta over the target objects');
  eq(preview.expectedEvaluation.expectedDelta, -5, 'preview prediction matches the plan delta');
  deepFrozen(outcome, 'outcome frozen end to end');
  deepFrozen(preview, 'preview frozen end to end');
  const semanticRes = resolveCorrectionDiagnosis(bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }));
  throwsWithCode(() => generateCorrectionPlan({ sessionId: 'loop-chain', target: bTarget({ category: 'SEMANTIC', metric: 'semantic.role' }), diagnosis: semanticRes, strategy: ranked.selected }),
    CorrectionErrorCodes.INVALID_DIAGNOSIS, 'NO_CAPABILITY resolutions are not diagnoses — the §28 honest gap cannot be planned around');
});

test('C-20: §14 boundary guard (Checkpoint D revision, per the approved C-20 ruling) — the acceptance export surface is EXACTLY the D §14 API; planning outputs still carry no acceptance vocabulary', ()=>{
  const exported = Object.keys(correctionNS);
  expect(exported.length > 50, 'the module surface is fully loaded (sanity)');
  // The C-era guard pinned the EMPTY acceptance surface as a phase boundary.
  // Checkpoint D landed §14 acceptance IN this module per directive, so the
  // guard now pins the exact acceptance export set — anything beyond the one
  // sanctioned §14 API is a boundary breach. Naming discipline: the verdict
  // vocabulary is deliberately named CORRECTION_VERDICTS (not "ACCEPTANCE_*")
  // so this mechanical guard keeps its bite — the ONLY /accept/i export is
  // the §14 authority function.
  const acceptNames = exported.filter(n => /accept/i.test(n)).sort();
  deepEq(acceptNames, ['acceptCorrectionAttempt'], `acceptance exports must be exactly [acceptCorrectionAttempt] (found: ${acceptNames.join(', ')})`);
  // Function-level boundary (the disclosure-20 substance): the PLANNING
  // surfaces still decide nothing about acceptance — no verdict vocabulary.
  const target = bTarget();
  const res = resolveCorrectionDiagnosis(target);
  const ranked = rankCorrectionStrategies(target, res.diagnosis);
  const outcome = generateCorrectionPlan({ sessionId: 'loop-x', target, diagnosis: res.diagnosis, strategy: ranked.selected });
  expect(!Object.keys(outcome).some(k => /accept|verdict|regress/i.test(k)), 'plan-generation outcome carries no acceptance vocabulary');
  expect(!Object.keys(outcome.plan).some(k => /accept|verdict|regress/i.test(k)), 'the §10 plan carries no acceptance vocabulary');
  expect(!Object.keys(buildCorrectionPreview(target, outcome.plan)).some(k => /accept|verdict|regress/i.test(k)), 'the §42 preview carries no acceptance vocabulary');
});

// ===========================================================================
// CHECKPOINT D — execution + transaction (§11/§12/§14/§15/§16/§30/§31/§32/
// §33/§47/§48). The LIVE substrate (transaction.js executor over plain store
// doubles + SceneGraph + live ToolRegistry) is bound at the call site; the
// correction module itself stays zero-import (injected duck-typed substrate).
// Evaluations are plain records (the §4/§6 shape-guard discipline — the §12
// authority stays in evaluation.js).
// ===========================================================================

class DObjectStore {
  constructor(){ this.store=new Map(); }
  get(id){ const o=this.store.get(id); return o?JSON.parse(JSON.stringify(o)):undefined; }
  has(id){ return this.store.has(id); }
  create(obj){ if(this.store.has(obj.id)) throw new Error('Duplicate'); this.store.set(obj.id, JSON.parse(JSON.stringify(obj))); }
  update(id,obj){ if(!this.store.has(id)) throw new Error('Not found'); this.store.set(id, JSON.parse(JSON.stringify(obj))); }
  delete(id){ this.store.delete(id); }
}
class DGeometryStore {
  constructor(){ this.store=new Map(); }
  get(id){ const g=this.store.get(id); return g?JSON.parse(JSON.stringify(g)):undefined; }
  has(id){ return this.store.has(id); }
  create(id,geom){ if(this.store.has(id)) throw new Error('Dup'); this.store.set(id, JSON.parse(JSON.stringify(geom))); }
  update(id,geom){ this.store.set(id, JSON.parse(JSON.stringify(geom))); }
  delete(id){ this.store.delete(id); }
}
class DAppearanceStore {
  constructor(){ this.store=new Map(); }
  get(id){ const a=this.store.get(id); return a?JSON.parse(JSON.stringify(a)):undefined; }
  has(id){ return this.store.has(id); }
  create(app){ this.store.set(app.id, JSON.parse(JSON.stringify(app))); }
  update(id,app){ this.store.set(id, JSON.parse(JSON.stringify(app))); }
  delete(id){ this.store.delete(id); }
}

// Two-rect scene: obj-1 at x=5 (the canonical bTarget move-to-target case),
// obj-2 at y=3 (a second attempt for isolation/linearity tests).
function dSubstrate(){
  const objectStore=new DObjectStore(), geometryStore=new DGeometryStore(), appearanceStore=new DAppearanceStore();
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const transactionBuilder=new TransactionBuilder();
  geometryStore.create('geom-1', {type:'rect', params:{x:5,y:0,width:100,height:50,rx:0,ry:0}});
  geometryStore.create('geom-2', {type:'rect', params:{x:0,y:3,width:40,height:40,rx:0,ry:0}});
  appearanceStore.create({id:'app-1', stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  appearanceStore.create({id:'app-2', stack:[{id:'f2', type:'fill', enabled:true, data:{kind:'solid', color:{r:0,g:0,b:255,a:1}, opacity:1}}]});
  objectStore.create({id:D_OBJ1, geometryRef:'geom-1', appearanceRef:'app-1', meta:{name:'rect-a', locked:false, visible:true, selectable:true}});
  objectStore.create({id:D_OBJ2, geometryRef:'geom-2', appearanceRef:'app-2', meta:{name:'rect-b', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(D_OBJ1, root.id);
  sceneGraph.createNode(D_OBJ2, root.id);
  return { objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager, transactionManager,
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph } };
}

function dDeviation(over={}){
  return { id:'dev-d-px', category:'geometry', property:'position.x', expected:0, actual:5, delta:5,
    tolerance:0.000000001, severity:'error', objectId:D_OBJ1, targetRef:'$doc:obj-1', message:'position.x off target', ...over };
}
// UUID-shaped object ids: the LIVE SceneGraph validates objectRef as a UUID at
// node creation (scenegraph.js validateNodeCreation) — D fixtures are
// real-substrate fixtures, so targets carry UUID object ids.
const D_OBJ1='11111111-1111-4111-8111-111111111111';
const D_OBJ2='22222222-2222-4222-8222-222222222222';
const D_OBJ3='33333333-3333-4333-8333-333333333333';
function dTarget(over={}){ return bTarget({ objectIds:[D_OBJ1], ...over }); }
const D_EVAL_BEFORE  = Object.freeze({status:'DEVIATION', deviations:[dDeviation()]});
const D_EVAL_AFTER   = Object.freeze({status:'PASS', deviations:[]});
const D_EVAL_WORSE   = Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-d-px-worse', actual:8, delta:8, message:'position.x further off target'})]});
const D_EVAL_STRUCT  = Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-d-struct', category:'structure', property:'structure.zorder', expected:0, actual:1, delta:1, message:'zorder broken by the correction'})]});
const D_EVAL_WARN    = Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-d-warn', category:'appearance', property:'appearance.opacity', expected:1, actual:0.9, delta:0.1, severity:'warning', message:'unrelated opacity warning'})]});
const D_EVAL_WIDTH_BEFORE   = Object.freeze({status:'DEVIATION', deviations:[dDeviation(), dDeviation({id:'dev-d-w1', property:'geometry.width', expected:100, actual:120, delta:20, message:'width off'})]});
const D_EVAL_WIDTH_WORSENED = Object.freeze({status:'DEVIATION', deviations:[dDeviation(), dDeviation({id:'dev-d-w2', property:'geometry.width', expected:100, actual:129, delta:29, message:'width worse'})]});

function dSession(){
  return createCorrectionLoopSession({rootIntentId:'intent-d', rootTransactionId:'tx-root-d', maxIterations:5, initialEvaluation:D_EVAL_BEFORE});
}
// The C planning chain (resolve -> rank -> generate) bound to the session id.
function dPlanFor(session, target, generateOver={}){
  const resolution=resolveCorrectionDiagnosis(target);
  eq(resolution.status, 'RESOLVED', 'dPlanFor: a capability-backed resolution is expected');
  const ranked=rankCorrectionStrategies(target, resolution.diagnosis);
  const outcome=generateCorrectionPlan({sessionId:session.id, target, diagnosis:resolution.diagnosis, strategy:ranked.selected, ...generateOver});
  eq(outcome.status, 'READY', 'dPlanFor: a READY plan is expected');
  return { resolution, ranked, outcome, plan: outcome.plan };
}
// A hand-built §10 plan (bypasses the C generator — legal: the plan shape is
// what the executor consumes; used for regression/rollback scenarios).
function dHandPlan(session, target, commands, over={}){
  const strategy=createCorrectionStrategy({ name:'hand-correction', applicableTo:['POSITION_ERROR'],
    commands: commands.map(c=>({kind:c.kind, toolId:c.toolId, input:JSON.parse(JSON.stringify(c.input))})),
    expectedEffect: over.expectedEffect || {metric:target.metric, direction:'TOWARD_TARGET'},
    risk:'MEDIUM', reversible:true, confidence:0.9 });
  const diagnosis=createCorrectionDiagnosis({ targetId:target.id, rootCause:'POSITION_ERROR', confidence:0.8,
    affectedObjects:[...target.objectIds], recommendedStrategies:[strategy] });
  const to = target.targetValue === undefined ? null : target.targetValue;
  const numeric = Number.isFinite(target.observedValue) && Number.isFinite(target.targetValue);
  return createCorrectionPlan({ sessionId:session.id, diagnosis, strategy,
    commands: strategy.commands.map(c=>({kind:c.kind, toolId:c.toolId, input:JSON.parse(JSON.stringify(c.input))})),
    expectedImprovement: {metric:target.metric, from:target.observedValue, to, delta: numeric ? target.targetValue-target.observedValue : null, direction:'TOWARD_TARGET'},
    riskAssessment: {level:strategy.risk, reversible:strategy.reversible, scope:'LOCAL', secondaryObjectCount:0},
    preconditions: [{kind:'objects-exist', objectIds:[...target.objectIds]}],
    postconditions: [{kind:'metric-moves-toward-target', metric:target.metric, from:target.observedValue, to}] });
}

test('D-1: §30 CorrectionFingerprint — deterministic content-derived identity of a plan; exact shape; incoherent input refused', ()=>{
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const fp=computeCorrectionFingerprint(plan);
  deepEq(Object.keys(fp), ['fingerprint','planId','targetId','strategyId'], 'exact key set');
  expect(fp.fingerprint.startsWith('cfp-'), `fingerprint prefix cfp- (got ${fp.fingerprint})`);
  eq(fp.planId, plan.id, 'planId mirrored');
  eq(fp.targetId, target.id, 'targetId mirrored');
  eq(fp.strategyId, plan.strategy.id, 'strategyId mirrored');
  deepFrozen(fp, 'fingerprint frozen');
  eq(computeCorrectionFingerprint(plan).fingerprint, fp.fingerprint, 'same content => same fingerprint (§44)');
  const {plan:plan2}=dPlanFor(session, dTarget({observedValue:6}));
  expect(computeCorrectionFingerprint(plan2).fingerprint !== fp.fingerprint, 'any content change moves the fingerprint');
  throwsWithCode(()=>computeCorrectionFingerprint('nope'), CorrectionErrorCodes.INVALID_PLAN, 'non-plan input refused');
});

test('D-2: evaluation fingerprint + §33 no-progress Δ — order-insensitive content hash over status + deviation ids; Δ=0 ⟺ identical state', ()=>{
  const fp=computeEvaluationFingerprint(D_EVAL_BEFORE);
  expect(typeof fp === 'string' && fp.length > 0, 'the fingerprint is a non-empty string');
  eq(computeEvaluationFingerprint({status:'DEVIATION', deviations:[dDeviation()]}), fp, 'same deviation content => same fingerprint');
  expect(computeEvaluationFingerprint(D_EVAL_AFTER) !== fp, 'different state => different fingerprint');
  const second=dDeviation({id:'dev-d-aa', category:'appearance', property:'appearance.opacity', expected:1, actual:0.9, delta:0.1, severity:'warning', message:'opacity warning'});
  eq(computeEvaluationFingerprint({status:'DEVIATION', deviations:[dDeviation(), second]}),
     computeEvaluationFingerprint({status:'DEVIATION', deviations:[second, dDeviation()]}), 'deviation order does not affect the fingerprint (sorted ids)');
  const np=detectCorrectionNoProgress({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_AFTER});
  deepEq(Object.keys(np), ['status','beforeFingerprint','afterFingerprint','delta'], 'exact key set');
  eq(np.status, 'PROGRESS', 'changed state => PROGRESS');
  eq(np.delta, -1, 'measured deviation-count delta');
  eq(np.beforeFingerprint, fp, 'before fingerprint mirrored');
  const same=detectCorrectionNoProgress({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:{status:'DEVIATION', deviations:[dDeviation()]}});
  eq(same.status, 'NO_PROGRESS', 'identical state => NO_PROGRESS (Δ=0)');
  eq(same.delta, 0, 'Δ=0');
  throwsWithCode(()=>detectCorrectionNoProgress({beforeEvaluation:'x', afterEvaluation:D_EVAL_AFTER}), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-record before-evaluation refused');
  throwsWithCode(()=>detectCorrectionNoProgress({beforeEvaluation:{status:'DEVIATION'}, afterEvaluation:D_EVAL_AFTER}), CorrectionErrorCodes.INVALID_ATTEMPT, 'evaluation without a deviations array refused');
});

test('D-3: §31 oscillation detection — any recurrence in the evaluation-fingerprint trail is oscillation; clean trails pass; inputs validated', ()=>{
  const f1=computeEvaluationFingerprint(D_EVAL_BEFORE);
  const f2=computeEvaluationFingerprint(D_EVAL_AFTER);
  const f3=computeEvaluationFingerprint(D_EVAL_WORSE);
  const clean=detectCorrectionOscillation([f1, f2, f3]);
  deepEq(Object.keys(clean), ['oscillating','fingerprint','firstIndex','repeatedIndex'], 'exact key set (total shape)');
  eq(clean.oscillating, false, 'distinct trail is clean');
  eq(clean.fingerprint, null, 'no recurring fingerprint');
  const osc=detectCorrectionOscillation([f1, f2, f3, f2]);
  eq(osc.oscillating, true, 'recurrence detected');
  eq(osc.fingerprint, f2, 'recurring fingerprint reported');
  eq(osc.firstIndex, 1, 'first occurrence index');
  eq(osc.repeatedIndex, 3, 'repeat index');
  throwsWithCode(()=>detectCorrectionOscillation('nope'), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-array trail refused');
  throwsWithCode(()=>detectCorrectionOscillation([f1, 42]), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-string fingerprint refused');
});

test('D-4: executeCorrectionAttempt (§11/§12) — ONE substrate transaction via TransactionBuilder.begin({id}); the LIVE tool executes; store moves 5 -> 0; exact canonical shapes; deterministic ids', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const result=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  deepEq(Object.keys(result), ['status','attempt','transaction'], 'exact EXECUTED result key set');
  eq(result.status, 'EXECUTED', 'attempt executed');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'T05 moved the rect to the target (x 5 -> 0)');
  eq(s.historyManager.size(), 1, 'exactly ONE transaction pushed (substrate-native per-attempt isolation)');
  const tx=s.historyManager.getAll()[0];
  eq(tx.status, 'committed', 'transaction committed');
  eq(tx.id, result.attempt.transactionId, 'attempt.transactionId IS the real transaction id');
  expect(tx.id.startsWith('atx-'), `content-derived transaction id via TransactionBuilder.begin({id}) (got ${tx.id})`);
  eq(tx.parentId, session.rootTransactionId, 'the attempt transaction descends from the session root (lineage, not nesting)');
  eq(tx.metadata.source, 'correction', 'source marker');
  const a=result.attempt;
  eq(a.status, 'EXECUTED', 'stage status');
  eq(a.iteration, 1, 'iteration');
  eq(a.plan.id, plan.id, 'plan embedded');
  eq(a.target.id, target.id, 'target embedded');
  expect(!Object.prototype.hasOwnProperty.call(a, 'afterEvaluation'), 'the EXECUTED stage carries no after-evaluation (acceptance owns it)');
  deepFrozen(a, 'attempt frozen');
  deepEq(Object.keys(result.transaction), ['id','status','inverseKind','commandCount','diffCounts'], 'exact projection key set — canonical plain data, no substrate runtime artifacts');
  eq(result.transaction.inverseKind, 'commands', 'T05 wrapper inverse = exact translation negation (§32 command path)');
  eq(result.transaction.commandCount, 1, 'one plan command -> one Command');
  eq(result.transaction.diffCounts.modified, 1, 'geometry modified');
  eq(result.transaction.status, 'committed', 'projection mirrors the commit');
  const s2=dSubstrate();
  const result2=executeCorrectionAttempt({session:dSession(), target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s2.substrate});
  eq(result2.attempt.id, a.id, 'same content => same attempt id (§44)');
  eq(result2.attempt.transactionId, a.transactionId, 'same content => same transaction id');
});

test('D-5: execution pre-flight — LIVE registry grounding: unregistered tools and live-validator failures are honest EXECUTION_REFUSED records (never throw, never execute); incoherent inputs throw', ()=>{
  deepEq([...CORRECTION_EXECUTION_REFUSALS], ['TOOLS_UNAVAILABLE','TOOL_VALIDATION_FAILED'], 'refusal vocabulary');
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  // (a) unregistered toolId — the capability table pins registered tools, but
  // an externally supplied plan can name anything: refused, never executed.
  const ghost=createCorrectionStrategy({ name:'ghost-tool', applicableTo:['POSITION_ERROR'],
    commands:[{kind:'MoveObject', toolId:'T99', input:{objectIds:[D_OBJ1], delta:{x:-5,y:0}}}],
    expectedEffect:{metric:'position.x', direction:'TOWARD_TARGET'}, risk:'LOW', reversible:true, confidence:0.9 });
  const ghostDiagnosis=createCorrectionDiagnosis({targetId:target.id, rootCause:'POSITION_ERROR', confidence:0.8, affectedObjects:[D_OBJ1], recommendedStrategies:[ghost]});
  const ghostPlan=createCorrectionPlan({sessionId:session.id, diagnosis:ghostDiagnosis, strategy:ghost,
    commands:[{kind:'MoveObject', toolId:'T99', input:{objectIds:[D_OBJ1], delta:{x:-5,y:0}}}],
    expectedImprovement:{metric:'position.x', from:5, to:0, delta:-5, direction:'TOWARD_TARGET'},
    riskAssessment:{level:'LOW', reversible:true, scope:'LOCAL', secondaryObjectCount:0},
    preconditions:[], postconditions:[]});
  const refused=executeCorrectionAttempt({session, target, plan:ghostPlan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  deepEq(Object.keys(refused), ['status','reason','details'], 'exact refusal key set');
  eq(refused.status, 'EXECUTION_REFUSED', 'evidence-based non-execution is a refusal record');
  eq(refused.reason, 'TOOLS_UNAVAILABLE', 'unregistered tool refused');
  eq(s.historyManager.size(), 0, 'nothing executed');
  eq(s.geometryStore.get('geom-1').params.x, 5, 'store untouched');
  deepFrozen(refused, 'refusal frozen');
  // (b) the disclosure-19 divergence: enum VALUES are the tools' authority —
  // a shape-complete input whose enum value fails the LIVE validator.
  const alignTarget=dTarget({category:'ALIGNMENT', metric:'alignment.deviation.px', objectIds:[D_OBJ1, D_OBJ2]});
  const alignStrategy=createCorrectionStrategy({ name:'align-diagonal', applicableTo:['ALIGNMENT_ERROR'],
    commands:[{kind:'MoveObject', toolId:'T08', input:{objectIds:[D_OBJ1, D_OBJ2], axis:'diagonal', mode:'center'}}],
    expectedEffect:{metric:'alignment.deviation.px', direction:'TOWARD_TARGET'}, risk:'MEDIUM', reversible:true, confidence:0.9 });
  const alignDiagnosis=createCorrectionDiagnosis({targetId:alignTarget.id, rootCause:'ALIGNMENT_ERROR', confidence:0.9, affectedObjects:[D_OBJ1, D_OBJ2], recommendedStrategies:[alignStrategy]});
  const alignOutcome=generateCorrectionPlan({sessionId:session.id, target:alignTarget, diagnosis:alignDiagnosis, strategy:alignStrategy});
  eq(alignOutcome.status, 'READY', 'shape-complete input plans READY (the mirror checks shape classes, not enums — disclosure 19)');
  const refused2=executeCorrectionAttempt({session, target:alignTarget, plan:alignOutcome.plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(refused2.status, 'EXECUTION_REFUSED', 'live-validator failure refused before any transaction');
  eq(refused2.reason, 'TOOL_VALIDATION_FAILED', 'enum authority stays with the live validator');
  expect(refused2.details.errors.length > 0, 'the live errors are carried');
  eq(s.historyManager.size(), 0, 'still nothing executed');
  // (c) incoherent inputs throw the structure-specific codes.
  const {plan}=dPlanFor(session, target);
  throwsWithCode(()=>executeCorrectionAttempt({session, target:dTarget({observedValue:7}), plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_PLAN, 'target/plan diagnosis coherence enforced');
  const otherSession=createCorrectionLoopSession({rootIntentId:'intent-other', rootTransactionId:'tx-root-other', maxIterations:3, initialEvaluation:D_EVAL_AFTER});
  throwsWithCode(()=>executeCorrectionAttempt({session:otherSession, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_PLAN, '§10: the plan executes only inside its owning session');
  throwsWithCode(()=>executeCorrectionAttempt({session, target, plan, iteration:'one', beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_PLAN, 'iteration must be an integer >= 0');
  throwsWithCode(()=>executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:{registry:{}}}),
    CorrectionErrorCodes.INVALID_PLAN, 'substrate missing transactionManager/transactionBuilder refused');
});

test('D-6: execution failure is ATOMIC — a runtime tool precondition failure fails the transaction, stores stay untouched, nothing is pushed, FAILED attempt record', ()=>{
  const s=dSubstrate();
  // obj-3 carries an EMPTY appearance stack: T07 opacity-only needs an existing
  // fill item and fails at runtime (tools.js TOOL_PRECONDITION_FAILED).
  s.appearanceStore.create({id:'app-3', stack:[]});
  s.objectStore.create({id:D_OBJ3, geometryRef:'geom-2', appearanceRef:'app-3', meta:{name:'rect-c', locked:false, visible:true, selectable:true}});
  s.sceneGraph.createNode(D_OBJ3, s.sceneGraph.getAllNodes()[0].id);
  const session=dSession();
  const target=dTarget({objectIds:[D_OBJ3], category:'APPEARANCE', metric:'appearance.opacity', observedValue:1, targetValue:0.5});
  const {plan}=dPlanFor(session, target);
  eq(plan.commands[0].input.opacity, 0.5, 'plan carries the derived opacity');
  const result=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  deepEq(Object.keys(result), ['status','attempt','transaction','error'], 'exact FAILED result key set');
  eq(result.status, 'FAILED', 'runtime failure surfaces as FAILED');
  eq(result.error.code, 'EXECUTION_ERROR', 'error classified');
  expect(typeof result.error.message === 'string' && result.error.message.length > 0, 'error message carried');
  eq(result.transaction.status, 'failed', 'projection mirrors the substrate failure');
  eq(result.transaction.inverseKind, null, 'a failed transaction has no inverse');
  eq(s.historyManager.size(), 0, 'failed transaction is NOT pushed (substrate discipline)');
  eq(s.appearanceStore.get('app-3').stack.length, 0, 'stores untouched — atomic per-attempt isolation');
  eq(result.attempt.status, 'FAILED', 'stage record FAILED');
  deepFrozen(result.attempt, 'failed attempt frozen');
});

test('D-7: independent transaction per attempt — two attempts are two linear, independent transactions (own ids, own diffs); no nesting, no DAG', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const t1=dTarget();
  const {plan:p1}=dPlanFor(session, t1);
  const e1=executeCorrectionAttempt({session, target:t1, plan:p1, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  const t2=dTarget({objectIds:[D_OBJ2], metric:'position.y', observedValue:3, targetValue:0});
  const {plan:p2}=dPlanFor(session, t2);
  const e2=executeCorrectionAttempt({session, target:t2, plan:p2, iteration:2, beforeEvaluation:D_EVAL_AFTER, substrate:s.substrate});
  eq(s.geometryStore.get('geom-1').params.x, 0, 'attempt 1 effect stands');
  eq(s.geometryStore.get('geom-2').params.y, 0, 'attempt 2 effect stands');
  eq(s.historyManager.size(), 2, 'two transactions');
  const txs=s.historyManager.getAll();
  expect(txs[0].id !== txs[1].id, 'distinct transaction ids');
  eq(txs[0].id, e1.attempt.transactionId, 'attempt 1 -> transaction 1');
  eq(txs[1].id, e2.attempt.transactionId, 'attempt 2 -> transaction 2');
  expect(e1.attempt.id !== e2.attempt.id, 'distinct attempt records');
  eq(s.historyManager.getCurrentIndex(), 1, 'history at top');
  eq(s.historyManager.canRedo(), false, 'no redo tail — LINEAR (invariant 13)');
  eq(txs[0].parentId, session.rootTransactionId, 'both attempts descend from the session root');
  eq(txs[1].parentId, session.rootTransactionId, 'siblings, never nested');
});

test('D-8: §32 rollback — command-inverse path: the exact T05 translation negation is the inverse; the substrate undo restores the store; ROLLED_BACK stage record; double rollback refused', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(s.geometryStore.get('geom-1').params.x, 0, 'correction applied');
  const rb=rollbackCorrectionAttempt({attempt:exec.attempt, substrate:s.substrate});
  deepEq(Object.keys(rb), ['status','attempt','transaction'], 'exact rollback key set');
  eq(rb.status, 'ROLLED_BACK', 'rolled back');
  eq(s.geometryStore.get('geom-1').params.x, 5, 'exact restoration via the inverse command');
  eq(rb.attempt.status, 'ROLLED_BACK', 'stage record');
  eq(rb.attempt.transactionId, exec.attempt.transactionId, 'same attempt transaction');
  expect(rb.attempt.id !== exec.attempt.id, 'each stage is a distinct immutable record (disclosure 10)');
  eq(rb.transaction.parentId, exec.attempt.transactionId, 'the undo transaction is substrate-native (createInverseTransaction lineage)');
  expect(rb.transaction.inverseKind === 'commands' || rb.transaction.inverseKind === 'snapshot', 'inverse kind recorded');
  deepFrozen(rb, 'rollback frozen');
  throwsWithCode(()=>rollbackCorrectionAttempt({attempt:rb.attempt, substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_ATTEMPT, 'a ROLLED_BACK stage cannot roll back again');
  throwsWithCode(()=>rollbackCorrectionAttempt({attempt:'nope', substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_ATTEMPT, 'non-attempt input refused');
});

test('D-9: §32 rollback — snapshot fallback for non-invertible corrections: the T07 appearance attempt carries a snapshot inverse; the substrate undo restores the appearance byte-exactly', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget({category:'APPEARANCE', metric:'appearance.opacity', observedValue:1, targetValue:0.5});
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(exec.status, 'EXECUTED', 'executed');
  eq(exec.transaction.inverseKind, 'snapshot', 'the T07 wrapper declares no inverse — the executor falls back to the §32 snapshot (transaction.js inverse computation)');
  eq(s.appearanceStore.get('app-1').stack[0].data.opacity, 0.5, 'correction applied');
  const rb=rollbackCorrectionAttempt({attempt:exec.attempt, substrate:s.substrate});
  eq(rb.status, 'ROLLED_BACK', 'rolled back via the snapshot path');
  const app=s.appearanceStore.get('app-1');
  eq(app.stack[0].data.opacity, 1, 'snapshot restoration byte-exact');
  deepEq(app.stack[0].data.color, {r:255,g:0,b:0,a:1}, 'the fill record is the pre-attempt record');
  eq(rb.transaction.parentId, exec.attempt.transactionId, 'substrate-native undo lineage');
});

test('D-10: rollback guard — the substrate undo is refused when the attempt transaction is NOT top-of-history (never undo a foreign transaction)', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(s.historyManager.size(), 1, 'the attempt transaction sits on top');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'correction applied');
  // host activity AFTER the attempt: a plain user transaction
  const userTx=new TransactionBuilder().begin({source:'user', description:'user nudge'})
    .addCommand(transactionNS.createMoveObjectCommand({objectId:D_OBJ1, dx:2, dy:0})).build();
  s.transactionManager.execute(userTx);
  eq(s.geometryStore.get('geom-1').params.x, 2, 'the user move landed on top');
  throwsWithCode(()=>rollbackCorrectionAttempt({attempt:exec.attempt, substrate:s.substrate}),
    CorrectionErrorCodes.INVALID_ATTEMPT, 'refused: top-of-history is not the attempt transaction');
  eq(s.geometryStore.get('geom-1').params.x, 2, 'nothing changed by the refusal');
  eq(s.historyManager.size(), 2, 'history untouched');
});

test('D-11: §15 regression detection — RegressionReport: deviations matched by identity (category|property|objectId); new errors, target-metric regression, and worsened-beyond-tolerance are CRITICAL; frozen + deterministic', ()=>{
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const policy=createCorrectionLoopPolicy();
  const clean=detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_AFTER, target, plan, policy});
  deepEq(Object.keys(clean), ['status','criticalRegression','metricRegressed','newDeviations','resolvedDeviations','persistedDeviations','worsenedDeviations','newErrorDeviations'], 'exact RegressionReport key set');
  eq(clean.status, 'CLEAN', 'clean');
  eq(clean.criticalRegression, false, 'nothing critical');
  eq(clean.metricRegressed, false, 'metric improved');
  deepEq(clean.resolvedDeviations.map(d=>d.id), [D_EVAL_BEFORE.deviations[0].id], 'the target deviation resolved');
  deepEq(clean.newDeviations, [], 'nothing new');
  deepEq(clean.persistedDeviations, [], 'nothing persisted');
  deepFrozen(clean, 'report frozen');
  // target-metric regression (post gap 8 > pre gap 5): CRITICAL
  const mreg=detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_WORSE, target, plan, policy});
  eq(mreg.status, 'REGRESSED', 'regressed');
  eq(mreg.metricRegressed, true, 'the target metric moved backward');
  eq(mreg.criticalRegression, true, 'metric regression is critical');
  deepEq(mreg.persistedDeviations.map(d=>d.id), [D_EVAL_WORSE.deviations[0].id], 'the identity persists (category|property|objectId), content id differs');
  eq(mreg.worsenedDeviations.length, 1, 'the persisted deviation worsened');
  eq(mreg.worsenedDeviations[0].growth, 3, 'growth |8|-|5| = 3');
  // persisted worsening on a NON-metric deviation, isolated from metricRegressed
  const w=detectCorrectionRegression({beforeEvaluation:D_EVAL_WIDTH_BEFORE, afterEvaluation:D_EVAL_WIDTH_WORSENED, target, plan, policy});
  eq(w.metricRegressed, false, 'the plan metric did not move (gap 5 -> 5)');
  eq(w.criticalRegression, true, 'but the persisted width deviation worsened beyond the §18 tolerance');
  eq(w.worsenedDeviations[0].growth, 9, 'growth |29|-|20| = 9 > maximumRegression 0.05');
  // new unrelated ERROR deviation is critical; a new WARNING is not
  const nerr=detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_STRUCT, target, plan, policy});
  eq(nerr.metricRegressed, false, 'the metric improved');
  eq(nerr.newErrorDeviations.length, 1, 'the new structure error is isolated');
  eq(nerr.criticalRegression, true, 'a new error deviation is critical regardless of magnitude');
  const nwarn=detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_WARN, target, plan, policy});
  eq(nwarn.criticalRegression, false, 'a new warning-severity deviation is recorded, not critical');
  eq(nwarn.newDeviations.length, 1, 'the warning is recorded');
  const again=detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_AFTER, target, plan, policy});
  eq(JSON.stringify(again) === JSON.stringify(clean), true, 'deterministic (§44)');
  throwsWithCode(()=>detectCorrectionRegression({beforeEvaluation:'x', afterEvaluation:D_EVAL_AFTER, target, plan, policy}),
    CorrectionErrorCodes.INVALID_ATTEMPT, 'non-record evaluation refused');
  throwsWithCode(()=>detectCorrectionRegression({beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_AFTER, target, plan, policy:{}}),
    CorrectionErrorCodes.INVALID_ATTEMPT, 'a §18 policy is required (the tolerance is policy-bound)');
});

test('D-12: §14 acceptance ACCEPTED — post > pre on the plan metric; exact criteria evidence; IMPROVED stage record; verdict/reason vocabularies', ()=>{
  deepEq([...CORRECTION_VERDICTS], ['ACCEPTED','REJECTED'], 'verdict vocabulary');
  deepEq([...CORRECTION_REJECTION_REASONS], ['NO_IMPROVEMENT','METRIC_INVALID','CRITICAL_REGRESSION','STRUCTURAL_DAMAGE'], 'rejection-reason vocabulary');
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(s.geometryStore.get('geom-1').params.x, 0, 'live grounding: the correction stands before acceptance');
  const acc=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_AFTER, target, plan, policy:createCorrectionLoopPolicy()});
  deepEq(Object.keys(acc), ['status','attemptId','reasons','criteria','delta','policyRollback','attempt'], 'exact verdict key set');
  eq(acc.status, 'ACCEPTED', 'accepted');
  deepEq(acc.reasons, [], 'no rejection reasons');
  eq(acc.attemptId, exec.attempt.id, 'lineage to the executed stage');
  const imp=acc.criteria.improvement;
  deepEq(Object.keys(imp), ['metric','kind','beforeGap','afterGap','improvement','met'], 'improvement criterion shape');
  eq(imp.metric, 'position.x', 'the plan metric');
  eq(imp.kind, 'NUMERIC', 'numeric mode (plan.to finite)');
  eq(imp.beforeGap, 5, 'pre gap |5-0|');
  eq(imp.afterGap, 0, 'post gap: the metric is at target (no deviation)');
  eq(imp.improvement, 5, 'strictly positive improvement');
  eq(imp.met, true, 'criterion 1 met (PostEvaluation > PreEvaluation on a valid metric)');
  eq(acc.criteria.noCriticalRegression.met, true, 'criterion 2 met');
  eq(acc.criteria.noCriticalRegression.report.status, 'CLEAN', 'the §15 report is embedded');
  eq(acc.criteria.structuralValidity.met, true, 'criterion 3 met');
  deepEq(acc.criteria.structuralValidity.newStructureDeviations, [], 'no structural damage');
  eq(acc.criteria.transactionValid.met, true, 'criterion 4 met (EXECUTED attestation)');
  eq(acc.criteria.transactionValid.checked, false, 'honest marker: no execution projection was supplied');
  deepEq(acc.delta, {metric:'position.x', before:5, after:0, improvement:5, basis:'MEASURED'}, 'the measured §6 delta slot');
  eq(acc.policyRollback, true, '§18 rollbackOnCriticalRegression reported');
  eq(acc.attempt.status, 'IMPROVED', 'stage record');
  expect(acc.attempt.id !== exec.attempt.id, 'distinct stage record');
  deepEq(acc.attempt.afterEvaluation, D_EVAL_AFTER, 'the acceptance stage carries the after-evaluation');
  deepFrozen(acc, 'verdict frozen');
});

test('D-13: §14 acceptance REJECTED NO_IMPROVEMENT — Δ=0 fails the strict post>pre criterion; NO_EFFECT stage; the no-progress path is NOT the rollback path', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  const acc=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_BEFORE, target, plan, policy:createCorrectionLoopPolicy()});
  eq(acc.status, 'REJECTED', 'rejected');
  deepEq(acc.reasons, ['NO_IMPROVEMENT'], 'the strict criterion failed with Δ=0');
  eq(acc.criteria.improvement.met, false, 'post == pre is not improvement');
  eq(acc.criteria.improvement.improvement, 0, 'improvement exactly 0');
  eq(acc.criteria.noCriticalRegression.met, true, 'nothing regressed');
  eq(acc.attempt.status, 'NO_EFFECT', 'no-effect stage — the §3 rollback edge is the REGRESSION path');
  eq(acc.policyRollback, true, 'the §18 flag is still reported for the loop driver');
});

test('D-14: §14 acceptance REJECTED CRITICAL_REGRESSION — the target metric moved backward; REGRESSED stage; the §15 report is embedded evidence', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  const acc=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_WORSE, target, plan, policy:createCorrectionLoopPolicy()});
  eq(acc.status, 'REJECTED', 'rejected');
  deepEq(acc.reasons, ['CRITICAL_REGRESSION'], 'critical regression reason');
  eq(acc.criteria.improvement.met, false, 'a backward move is not improvement');
  expect(acc.criteria.improvement.improvement < 0, 'negative improvement');
  eq(acc.criteria.noCriticalRegression.met, false, 'criterion 2 failed');
  eq(acc.criteria.noCriticalRegression.report.status, 'REGRESSED', '§15 report embedded');
  eq(acc.criteria.noCriticalRegression.report.metricRegressed, true, 'the metric regressed');
  eq(acc.attempt.status, 'REGRESSED', 'regressed stage');
  deepFrozen(acc, 'verdict frozen');
});

test('D-15: §14 acceptance — structural validity (remains-true semantics); a new structure error rejects twice over; a new warning does not reject; pre-existing damage persisting unchanged is not damage by this correction', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  // (a) the position metric resolved but a structure deviation appeared
  const acc1=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_STRUCT, target, plan, policy:createCorrectionLoopPolicy()});
  eq(acc1.status, 'REJECTED', 'rejected');
  deepEq(acc1.reasons, ['CRITICAL_REGRESSION','STRUCTURAL_DAMAGE'], 'vocabulary-ordered reasons (new error + structural damage)');
  eq(acc1.criteria.structuralValidity.met, false, 'criterion 3 failed');
  deepEq(acc1.criteria.structuralValidity.newStructureDeviations, ['dev-d-struct'], 'the introduced structure deviation is named');
  // (b) a new WARNING-severity deviation is recorded but does not reject
  const acc2=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_WARN, target, plan, policy:createCorrectionLoopPolicy()});
  eq(acc2.status, 'ACCEPTED', 'accepted with the warning recorded');
  eq(acc2.criteria.noCriticalRegression.report.newDeviations.length, 1, 'the warning is in the report');
  // (c) remains-true: a pre-existing structure deviation that persists unchanged
  const preStruct=dDeviation({id:'dev-d-struct0', category:'structure', property:'structure.zorder', expected:0, actual:1, delta:1, message:'pre-existing'});
  const evalPre=Object.freeze({status:'DEVIATION', deviations:[dDeviation(), preStruct]});
  const evalPreSame=Object.freeze({status:'DEVIATION', deviations:[preStruct]});
  const exec3=executeCorrectionAttempt({session, target, plan, iteration:2, beforeEvaluation:evalPre, substrate:s.substrate});
  const acc3=acceptCorrectionAttempt({attempt:exec3.attempt, afterEvaluation:evalPreSame, target, plan, policy:createCorrectionLoopPolicy()});
  eq(acc3.status, 'ACCEPTED', 'pre-existing damage persisting unchanged is not introduced by this correction');
  eq(acc3.criteria.structuralValidity.met, true, 'remains-true semantics');
  deepEq(acc3.criteria.structuralValidity.newStructureDeviations, [], 'nothing new');
});

test('D-16: §16 best-state preservation — deterministic total order (errors, then warnings, then canonical id tie-break); isBetter is strict; the incumbent survives worse candidates; the §18 flag disables preservation', ()=>{
  const oneWarning=Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-d-warn', category:'appearance', property:'appearance.opacity', expected:1, actual:0.9, delta:0.1, severity:'warning', message:'w'})]});
  const oneError=Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-d-err2', property:'position.y', actual:2, delta:2, message:'y off'})]});
  eq(isBetterEvaluation(D_EVAL_AFTER, D_EVAL_BEFORE), true, 'PASS beats one error');
  eq(isBetterEvaluation(D_EVAL_BEFORE, D_EVAL_AFTER), false, 'strict: not symmetric');
  eq(isBetterEvaluation(D_EVAL_BEFORE, D_EVAL_BEFORE), false, 'equal is not better');
  eq(isBetterEvaluation(oneWarning, oneError), true, 'fewer errors dominates warning counts');
  eq(isBetterEvaluation(oneError, oneWarning), false, 'antisymmetric');
  const tieA=Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-a'})]});
  const tieB=Object.freeze({status:'DEVIATION', deviations:[dDeviation({id:'dev-b'})]});
  eq(isBetterEvaluation(tieA, tieB), true, 'canonical sorted-id tie-break (lexicographic, deterministic)');
  eq(isBetterEvaluation(tieB, tieA), false, 'tie-break is antisymmetric');
  const policy=createCorrectionLoopPolicy();
  const first=preserveCorrectionBestState({bestEvaluation:undefined, candidateEvaluation:D_EVAL_BEFORE, policy});
  deepEq(Object.keys(first), ['bestEvaluation','updated','preserved'], 'exact key set');
  eq(first.bestEvaluation, D_EVAL_BEFORE, 'the first observation becomes best');
  eq(first.updated, true, 'updated');
  eq(first.preserved, false, 'nothing was preserved (there was no incumbent)');
  const kept=preserveCorrectionBestState({bestEvaluation:D_EVAL_AFTER, candidateEvaluation:D_EVAL_WORSE, policy});
  eq(kept.bestEvaluation, D_EVAL_AFTER, 'the incumbent survives a worse candidate — the loop does NOT assume last state is best');
  eq(kept.updated, false, 'no update');
  eq(kept.preserved, true, 'preserved');
  const better=preserveCorrectionBestState({bestEvaluation:D_EVAL_BEFORE, candidateEvaluation:D_EVAL_AFTER, policy});
  eq(better.bestEvaluation, D_EVAL_AFTER, 'a better candidate replaces the incumbent');
  eq(better.updated, true, 'updated');
  const off=preserveCorrectionBestState({bestEvaluation:D_EVAL_AFTER, candidateEvaluation:D_EVAL_WORSE, policy:createCorrectionLoopPolicy({preserveBestState:false})});
  eq(off.bestEvaluation, D_EVAL_WORSE, 'preserveBestState=false: best follows current (§18 flag semantics)');
  eq(off.preserved, false, 'nothing preserved');
  deepFrozen(kept, 'frozen');
  throwsWithCode(()=>isBetterEvaluation('x', D_EVAL_AFTER), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-record candidate refused');
});

test('D-17: §33 no-progress idempotency — the SAME correction whose previous application produced Δ=0 is SKIPped; Δ≠0 legitimizes the §69 correction-#2 retry; different corrections never skip', ()=>{
  const session=dSession();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const skip=shouldSkipCorrection({plan, previousAttempt:{plan, beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_BEFORE}});
  deepEq(Object.keys(skip), ['skip','reason','fingerprint'], 'exact key set');
  eq(skip.skip, true, 'same fingerprint + Δ=0 -> SKIP');
  eq(skip.reason, 'NO_PROGRESS_IDEMPOTENT', 'the skip reason');
  eq(skip.fingerprint, computeCorrectionFingerprint(plan).fingerprint, 'the correction fingerprint is carried');
  deepFrozen(skip, 'frozen');
  const retry=shouldSkipCorrection({plan, previousAttempt:{plan, beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_AFTER}});
  eq(retry.skip, false, 'Δ≠0: retrying the same correction is legitimate (§69 correction #2)');
  const otherPlan=dPlanFor(session, dTarget({observedValue:6})).plan;
  const other=shouldSkipCorrection({plan, previousAttempt:{plan:otherPlan, beforeEvaluation:D_EVAL_BEFORE, afterEvaluation:D_EVAL_BEFORE}});
  eq(other.skip, false, 'a different correction fingerprint never skips');
  eq(shouldSkipCorrection({plan, previousAttempt:null}).skip, false, 'no previous attempt -> no skip');
  throwsWithCode(()=>shouldSkipCorrection({plan:'nope', previousAttempt:null}), CorrectionErrorCodes.INVALID_PLAN, 'non-plan input refused');
});

test('D-18: §47/§48 — session-local history metadata; the HistoryManager stays LINEAR (invariant 13) and UNCHANGED; undo-of-the-AI-operation rides the substrate', ()=>{
  deepEq(Object.getOwnPropertyNames(HistoryManager.prototype).sort(),
    ['canRedo','canUndo','clear','constructor','current','getAll','getCurrentIndex','getTransactionToRedo','getTransactionToUndo','moveBack','moveForward','push','size'],
    'HistoryManager API unchanged (§48: HistoryManager unchanged)');
  const s=dSubstrate();
  const session=dSession();
  const t1=dTarget();
  const {plan:p1}=dPlanFor(session, t1);
  const e1=executeCorrectionAttempt({session, target:t1, plan:p1, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  const t2=dTarget({objectIds:[D_OBJ2], metric:'position.y', observedValue:3, targetValue:0});
  const {plan:p2}=dPlanFor(session, t2);
  const e2=executeCorrectionAttempt({session, target:t2, plan:p2, iteration:2, beforeEvaluation:D_EVAL_AFTER, substrate:s.substrate});
  eq(s.historyManager.size(), 2, 'two linear transactions');
  const meta=buildCorrectionHistoryMetadata(session, e2.attempt);
  deepEq(Object.keys(meta), ['source','sessionId','attemptId','transactionId','iteration','attemptStatus'], 'exact metadata key set — session-local, no history fields');
  eq(meta.source, 'correction', 'the AI-operation source marker');
  eq(meta.sessionId, session.id, 'session lineage');
  eq(meta.attemptId, e2.attempt.id, 'attempt lineage');
  eq(meta.transactionId, e2.attempt.transactionId, 'the transaction the host would undo');
  eq(meta.iteration, 2, 'iteration');
  eq(meta.attemptStatus, 'EXECUTED', 'stage status');
  deepFrozen(meta, 'metadata frozen');
  // §48 "Undo AI operation": the host undoes by the metadata's transactionId
  // through the EXISTING substrate undo (top-of-history = the attempt).
  s.transactionManager.undo();
  eq(s.historyManager.size(), 2, 'the substrate undo keeps the flat linear array (the index moves back)');
  eq(s.geometryStore.get('geom-2').params.y, 3, 'the AI operation is undone');
  // a new attempt after the undo: the linear push truncates the redo tail.
  const e3=executeCorrectionAttempt({session, target:t2, plan:p2, iteration:3, beforeEvaluation:D_EVAL_AFTER, substrate:s.substrate});
  eq(s.historyManager.size(), 2, 'LINEAR truncation on push — no DAG, no branches (invariant 13)');
  eq(s.historyManager.getCurrentIndex(), 1, 'index at top');
  eq(s.historyManager.canRedo(), false, 'redo tail truncated');
  eq(s.historyManager.getAll()[1].id, e3.attempt.transactionId, 'the new attempt is the linear successor');
  expect(e1.attempt.id !== e3.attempt.id, 'iteration is part of the attempt identity');
});

test('D-19: integrated chain — plan -> execute -> accept (IMPROVED) -> a second correction regresses -> REJECTED -> rollback restores the best state; best-state preservation never assumes last is best', ()=>{
  const s=dSubstrate();
  const session=dSession();
  const policy=createCorrectionLoopPolicy();
  const target=dTarget();
  const {plan}=dPlanFor(session, target);
  const exec1=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
  eq(exec1.status, 'EXECUTED', 'attempt 1 executed');
  const acc1=acceptCorrectionAttempt({attempt:exec1.attempt, afterEvaluation:D_EVAL_AFTER, target, plan, policy});
  eq(acc1.status, 'ACCEPTED', 'attempt 1 accepted');
  eq(acc1.attempt.status, 'IMPROVED', 'improved');
  const best1=preserveCorrectionBestState({bestEvaluation:undefined, candidateEvaluation:D_EVAL_AFTER, policy});
  eq(best1.bestEvaluation, D_EVAL_AFTER, 'iteration-1 state is best');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'the correction stands');
  // iteration 2: a hand-built correction that moves the object AWAY from target
  const target2=dTarget();
  const plan2=dHandPlan(session, target2, [{kind:'MoveObject', toolId:'T05', input:{objectIds:[D_OBJ1], delta:{x:8,y:0}}}]);
  const exec2=executeCorrectionAttempt({session, target:target2, plan:plan2, iteration:2, beforeEvaluation:D_EVAL_AFTER, substrate:s.substrate});
  eq(exec2.status, 'EXECUTED', 'attempt 2 executed');
  eq(s.geometryStore.get('geom-1').params.x, 8, 'the regressing correction stands before acceptance');
  const acc2=acceptCorrectionAttempt({attempt:exec2.attempt, afterEvaluation:D_EVAL_WORSE, target:target2, plan:plan2, policy});
  eq(acc2.status, 'REJECTED', 'attempt 2 rejected');
  deepEq(acc2.reasons, ['CRITICAL_REGRESSION'], 'critical regression');
  eq(acc2.attempt.status, 'REGRESSED', 'regressed stage');
  eq(acc2.policyRollback, true, '§18: rollbackOnCriticalRegression');
  const rb2=rollbackCorrectionAttempt({attempt:exec2.attempt, substrate:s.substrate});
  eq(rb2.status, 'ROLLED_BACK', 'rolled back');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'the rollback restored the best state');
  const best2=preserveCorrectionBestState({bestEvaluation:best1.bestEvaluation, candidateEvaluation:D_EVAL_WORSE, policy});
  eq(best2.bestEvaluation, D_EVAL_AFTER, '§16: the regressed LAST state is NOT best — the loop keeps iteration-1');
  eq(best2.updated, false, 'no update');
});

test('D-20: determinism (§44) — two identical execution+acceptance chains yield byte-identical canonical records; no substrate entropy (uuid/timestamps) leaks into canonical records', ()=>{
  const run=()=>{
    const s=dSubstrate();
    const session=dSession();
    const target=dTarget();
    const {plan}=dPlanFor(session, target);
    const exec=executeCorrectionAttempt({session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:s.substrate});
    const acc=acceptCorrectionAttempt({attempt:exec.attempt, afterEvaluation:D_EVAL_AFTER, target, plan, policy:createCorrectionLoopPolicy()});
    const rb=rollbackCorrectionAttempt({attempt:exec.attempt, substrate:s.substrate});
    return {exec, acc, rb, session};
  };
  const a=run(), b=run();
  eq(a.exec.attempt.id, b.exec.attempt.id, 'same attempt id');
  eq(a.exec.attempt.transactionId, b.exec.attempt.transactionId, 'same transaction id');
  eq(JSON.stringify(a.exec.attempt), JSON.stringify(b.exec.attempt), 'byte-identical EXECUTED stage records');
  eq(JSON.stringify(a.acc), JSON.stringify(b.acc), 'byte-identical acceptance verdicts');
  eq(JSON.stringify(a.rb.attempt), JSON.stringify(b.rb.attempt), 'byte-identical ROLLED_BACK stage records');
  eq(a.rb.transaction.parentId, b.rb.transaction.parentId, 'the undo lineage is content-derived');
  const canonical=JSON.stringify({exec:a.exec.attempt, acc:a.acc, rb:a.rb.attempt, fp:computeCorrectionFingerprint(a.exec.attempt.plan)});
  expect(!canonical.includes('createdAt'), 'no substrate timestamps in canonical records');
  // The fixtures' own UUID-shaped object ids are CONTENT (the substrate
  // requires them); strip them before scanning for substrate-generated uuids.
  const stripped=canonical.split(D_OBJ1).join('').split(D_OBJ2).join('').split(D_OBJ3).join('');
  expect(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(stripped), 'no substrate-generated uuids in canonical records');
});



// ===========================================================================
// CHECKPOINT E — re-evaluation + convergence (§3/§17/§22/§23/§24/§25/§26).
// The CorrectionEngine is the loop DRIVER over the frozen §3/§5 machine: ALL
// evaluations (initial + every re-evaluation) come from the INJECTED §23
// critic {evaluate(document, context) -> EvaluationResult} — the loop never
// self-evaluates (§22). Convergence (§17) is the engine's judgment OVER the
// critic's records, never a second evaluation authority. The LIVE substrate
// and the LIVE evaluation.js authority are bound at the call site.
//
// STUB-KILL design (Checkpoint E directive: convergence detection + mode
// dispatch). Sets overlap where integrated run tests span both sites:
//   KILL-E1 §17 convergence neutered (detectCorrectionConvergence always
//           returns CONTINUE)                              -> see E-KILL report
//   KILL-E2 mode dispatch neutered (every mode dispatched as AUTO)
//                                                          -> see E-KILL report
// ===========================================================================

// Scripted critic: the duck-typed §23 authority double. Records are returned
// in sequence (clamped at the last entry); every call is recorded with its
// EXACT arguments for the consumer-only proof.
function eCritic(records, over={}){
  const calls = [];
  return {
    calls,
    evaluate(document, context){
      calls.push({ document, context });
      if (over.throwAt === calls.length) throw new Error(over.throwMessage || 'critic authority failure');
      const bad = over.badAt === calls.length ? over.badRecord : null;
      return bad || records[Math.min(calls.length - 1, records.length - 1)];
    }
  };
}
function eDev(over={}){
  return { id:'dev-e-px', category:'geometry', property:'position.x', expected:0, actual:5, delta:5,
    tolerance:0.000000001, severity:'error', objectId:D_OBJ1, targetRef:'$doc:obj-1', message:'position.x off target', ...over };
}
function eEvalX(x, over={}){
  if (x === 0) return Object.freeze({ status:'PASS', deviations:[] });
  return Object.freeze({ status:'DEVIATION', deviations:[eDev({ id:'dev-e-px-' + String(x).replace('.','_'), actual:x, delta:x, message:`position.x at ${x}`, ...over })] });
}
// Request builder over the LIVE D substrate (fresh per scenario).
function eRequest(over={}){
  const s = over.substrate || dSubstrate();
  const policy = over.policy || createCorrectionLoopPolicy(over.policyOverrides || {});
  const targets = over.targets || [dTarget()];
  const critic = over.critic || eCritic(over.records || [D_EVAL_BEFORE, D_EVAL_AFTER]);
  const request = {
    rootIntentId: over.rootIntentId || 'intent-e',
    rootTransactionId: over.rootTransactionId || 'tx-root-e',
    targets,
    policy,
    mode: over.mode || 'AUTO',
    critic,
    document: over.document !== undefined ? over.document : { objectStore: s.objectStore, geometryStore: s.geometryStore, appearanceStore: s.appearanceStore, sceneGraph: s.sceneGraph },
    evaluationContext: over.evaluationContext,
    planningContext: over.planningContext,
    substrate: s.substrate
  };
  return { request, s, critic, policy, targets };
}

test('E-1: §24/§26 vocabularies — the CorrectionEngine namespace is exactly the five §24 operations; the §26 mode vocabulary and dispatch table are frozen and exact; §17 convergence verdicts obey the disclosed precedence', ()=>{
  deepEq(Object.keys(CorrectionEngine).sort(), ['iterate','rollback','run','start','terminate'], 'the §24 contract is exactly start/iterate/run/terminate/rollback');
  deepEq([...CORRECTION_ENGINE_OPERATIONS], ['start','iterate','run','terminate','rollback'], 'the §24 operation vocabulary mirrors the namespace');
  deepEq([...CORRECTION_LOOP_MODES], ['AUTO','GUIDED','SINGLE_STEP'], 'the §26 mode vocabulary is exactly three modes');
  deepEq([...CORRECTION_ENGINE_STATUSES], ['RUNNING','AWAITING_APPROVAL','STEPPED','ROLLED_BACK','TERMINATED'], 'engine status vocabulary (disclosed)');
  deepEq([...CORRECTION_CONVERGENCE_KINDS], ['VERIFIED','NO_PROGRESS','OSCILLATION_DETECTED','MAX_ITERATIONS_REACHED','CONTINUE'], '§17 verdict vocabulary');
  deepEq(Object.keys(CORRECTION_MODE_DISPATCH), ['AUTO','GUIDED','SINGLE_STEP'], 'the dispatch table covers exactly the modes');
  deepEq(Object.keys(CORRECTION_MODE_DISPATCH.AUTO), ['cyclesPerRun','requiresApproval','stepBudget'], 'AUTO dispatch shape');
  eq(CORRECTION_MODE_DISPATCH.AUTO.requiresApproval, false, 'AUTO never waits');
  eq(CORRECTION_MODE_DISPATCH.AUTO.cyclesPerRun, null, 'AUTO runs to termination');
  eq(CORRECTION_MODE_DISPATCH.GUIDED.requiresApproval, true, 'GUIDED requires approval');
  eq(CORRECTION_MODE_DISPATCH.GUIDED.cyclesPerRun, 1, 'GUIDED advances one cycle per run');
  eq(CORRECTION_MODE_DISPATCH.SINGLE_STEP.stepBudget, 1, 'SINGLE_STEP executes one correction per engine lifetime');
  deepEq([...CORRECTION_ENGINE_ACTIONS].sort(), ['APPROVED','ATTEMPT','MANUAL_ROLLBACK','PROPOSAL_REJECTED','PROPOSED','STARTED','TERMINATED','WAITED'], 'engine report action vocabulary (disclosed)');
  for (const table of [CORRECTION_MODE_DISPATCH, CORRECTION_MODE_DISPATCH.AUTO, CORRECTION_MODE_DISPATCH.GUIDED, CORRECTION_MODE_DISPATCH.SINGLE_STEP]) expect(Object.isFrozen(table), 'dispatch tables frozen');
  // §17 precedence (the disclosed order: VERIFIED > NO_PROGRESS > OSCILLATION > MAX_ITERATIONS > CONTINUE)
  const osc = { oscillating:true, fingerprint:'efp-x', firstIndex:0, repeatedIndex:2 };
  eq(detectCorrectionConvergence({agendaSatisfied:true, noProgressStreak:5, oscillation:osc, budgetExhausted:true}).kind, 'VERIFIED', 'VERIFIED dominates every stagnation signal');
  eq(detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:2, oscillation:osc, budgetExhausted:true}).kind, 'NO_PROGRESS', 'streak >= 2 outranks oscillation and budget');
  eq(detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:1, oscillation:osc, budgetExhausted:true}).kind, 'OSCILLATION_DETECTED', 'oscillation outranks budget');
  eq(detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:1, oscillation:null, budgetExhausted:true}).kind, 'MAX_ITERATIONS_REACHED', 'budget is the last engine verdict');
  eq(detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:1, oscillation:null, budgetExhausted:false}).kind, 'CONTINUE', 'live loop continues');
  eq(detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:0, oscillation:null, budgetExhausted:false}).kind, 'CONTINUE', 'streak 1 is not yet NO_PROGRESS');
  const v = detectCorrectionConvergence({agendaSatisfied:true, noProgressStreak:0, oscillation:null, budgetExhausted:false});
  deepEq(Object.keys(v), ['kind','evidence'], 'verdict shape');
  deepFrozen(v, 'verdict frozen');
  throwsWithCode(()=>detectCorrectionConvergence('nope'), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-record input refused');
  throwsWithCode(()=>detectCorrectionConvergence({agendaSatisfied:'yes', noProgressStreak:0, oscillation:null, budgetExhausted:false}), CorrectionErrorCodes.INVALID_ATTEMPT, 'non-boolean agendaSatisfied refused');
  throwsWithCode(()=>detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:-1, oscillation:null, budgetExhausted:false}), CorrectionErrorCodes.INVALID_ATTEMPT, 'negative streak refused');
  throwsWithCode(()=>detectCorrectionConvergence({agendaSatisfied:false, noProgressStreak:0, oscillation:42, budgetExhausted:false}), CorrectionErrorCodes.INVALID_ATTEMPT, 'garbage oscillation record refused');
});

test('E-2: §25 CorrectionLoopRequest — the request contract validates every field; structure-specific codes for structure fields, INVALID_SESSION for the engine envelope (disclosure 33)', ()=>{
  const { request } = eRequest({ evaluationContext: { targets: [{ objectId: D_OBJ1, targetRef: '$doc:obj-1' }] } });
  const ok = validateCorrectionLoopRequest(request);
  eq(ok.valid, true, 'a complete request validates');
  eq(ok.errors.length, 0, 'no errors on the happy path');
  const breach = (mutate, code, msg) => {
    const r = eRequest({ evaluationContext: { targets: [] } }).request;
    mutate(r);
    const out = validateCorrectionLoopRequest(r);
    eq(out.valid, false, msg + ': refused');
    expect(out.errors.length > 0, msg + ': errors reported');
    eq(out.errors[0].code, code, msg + ': code');
  };
  breach(r => { delete r.rootIntentId; }, CorrectionErrorCodes.INVALID_SESSION, 'missing rootIntentId');
  breach(r => { r.rootTransactionId = ''; }, CorrectionErrorCodes.INVALID_SESSION, 'empty rootTransactionId');
  breach(r => { r.targets = []; }, CorrectionErrorCodes.INVALID_TARGET, 'empty agenda');
  breach(r => { r.targets = 'nope'; }, CorrectionErrorCodes.INVALID_TARGET, 'non-array agenda');
  breach(r => { r.targets = [dTarget(), { category: 'POSITION' }]; }, CorrectionErrorCodes.INVALID_TARGET, 'incoherent agenda entry');
  breach(r => { delete r.policy; }, CorrectionErrorCodes.INVALID_POLICY, 'missing policy');
  breach(r => { r.policy = { ...r.policy, maxIterations: 0 }; }, CorrectionErrorCodes.INVALID_POLICY, 'incoherent policy');
  breach(r => { r.mode = 'SOLO'; }, CorrectionErrorCodes.INVALID_SESSION, 'unknown mode');
  breach(r => { r.critic = {}; }, CorrectionErrorCodes.INVALID_SESSION, 'critic without evaluate');
  breach(r => { r.critic = { evaluate: 42 }; }, CorrectionErrorCodes.INVALID_SESSION, 'non-function evaluate');
  breach(r => { r.document = undefined; }, CorrectionErrorCodes.INVALID_SESSION, 'missing document');
  breach(r => { r.substrate = { registry: {} }; }, CorrectionErrorCodes.INVALID_SESSION, 'malformed substrate');
  breach(r => { r.evaluationContext = 42; }, CorrectionErrorCodes.INVALID_SESSION, 'non-plain evaluationContext');
  breach(r => { r.planningContext = () => {}; }, CorrectionErrorCodes.INVALID_SESSION, 'function planningContext');
  // start() refuses the same breaches with the same codes (envelope throw)
  const bad = eRequest({}).request; bad.mode = 'SOLO';
  throwsWithCode(() => CorrectionEngine.start(bad), CorrectionErrorCodes.INVALID_SESSION, 'start refuses an invalid request');
});

test('E-3: §24 start — the initial evaluation comes EXCLUSIVELY from the injected critic (positional (document, context) call, exactly once); the session id is content-derived; the engine state shape is exact and frozen', ()=>{
  const evaluationContext = { targets: [{ objectId: D_OBJ1, targetRef: '$doc:obj-1' }] };
  const { request, s } = eRequest({ evaluationContext });
  const state = CorrectionEngine.start(request);
  deepEq(Object.keys(state), ['request','session','policy','mode','status','terminationReason','convergence','bestEvaluation','fingerprintTrail','noProgressStreak','executedAttempts','iterationLedger','refusalLedger','pendingProposal','focusTargetId','cursorFloor','lastReport'], 'exact engine state key set (disclosure 34)');
  eq(state.status, 'RUNNING', 'the loop is live');
  eq(state.terminationReason, undefined, 'no termination');
  eq(state.mode, 'AUTO', 'mode mirrored');
  eq(state.session.state, 'IDLE', 'the §3 machine has not engaged (no correction yet)');
  eq(state.session.iteration, 0, 'zero iterations');
  eq(state.executedAttempts, 0, 'zero attempts');
  eq(state.session.rootIntentId, 'intent-e', 'session carries the request identity');
  eq(state.session.maxIterations, 5, 'session budget = policy.maxIterations');
  expect(state.session.id.startsWith('loop-'), 'content-derived session id');
  eq(state.bestEvaluation, D_EVAL_BEFORE, '§16 best starts at the initial evaluation (by reference)');
  deepEq(state.fingerprintTrail, [computeEvaluationFingerprint(D_EVAL_BEFORE)], 'the trail opens with the initial evaluation fingerprint');
  eq(state.noProgressStreak, 0, 'streak 0');
  deepEq(state.iterationLedger, [], 'empty ledger');
  deepEq(state.refusalLedger, [], 'empty refusal ledger');
  eq(state.pendingProposal, undefined, 'no pending proposal');
  eq(state.focusTargetId, null, 'no focus yet');
  eq(state.cursorFloor, 0, 'cursor at the first candidate');
  eq(state.lastReport.action, 'STARTED', 'start report');
  eq(state.lastReport.status, 'RUNNING', 'report mirrors status');
  expect(Object.isFrozen(state), 'the engine state is frozen (shallow — the injected authorities stay live by reference, disclosure 34)');
  // the §22/§23 consumer proof: exactly ONE critic call, positional args verbatim
  eq(state.request.critic.calls.length, 1, 'exactly one critic call');
  eq(state.request.critic.calls[0].document, request.document, 'the document is passed verbatim (positional arg 1)');
  eq(state.request.critic.calls[0].context, evaluationContext, 'the evaluation context is passed verbatim (positional arg 2)');
  // determinism: an identical request (fresh substrate, same evaluation content) yields the same session id
  const second = eRequest({ evaluationContext });
  const state2 = CorrectionEngine.start(second.request);
  eq(state2.session.id, state.session.id, 'same request content => same content-derived session id (§44)');
  eq(s.substrate.transactionManager.historyManager.size(), 0, 'start never touches the substrate');
});

test('E-4: start on an already-satisfied agenda — VERIFIED with zero attempts; the §3 machine never engages (no-cycle rule, disclosure 37); the session stays IDLE and carries no termination', ()=>{
  const { request } = eRequest({ records: [D_EVAL_AFTER] });
  const state = CorrectionEngine.start(request);
  eq(state.status, 'TERMINATED', 'the loop is done before it began');
  eq(state.terminationReason, 'VERIFIED', '§17 VERIFIED');
  eq(state.convergence.kind, 'VERIFIED', 'convergence verdict recorded');
  eq(state.session.state, 'IDLE', 'no correction was ever attempted — the §3 trail stays [IDLE]');
  deepEq(state.session.visitedStates, ['IDLE'], 'the honest trail');
  eq(state.session.terminationReason, undefined, 'the §4 record carries no §50 reason (terminateSession from IDLE has no engine edge — the ENGINE is the verdict carrier)');
  eq(state.executedAttempts, 0, 'zero attempts');
  eq(state.request.critic.calls.length, 1, 'exactly one evaluation (the initial one)');
  deepEq(state.iterationLedger, [], 'nothing in the ledger');
});

test('E-5: §24 run (AUTO) — one correction closes the loop: session rides IDLE→PLANNING→EXECUTING→EVALUATING→VERIFIED→TERMINATED on the LIVE substrate; the critic is called exactly iterations+1 times (§22 consumer-only)', ()=>{
  const { request, s } = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER] });
  const state = CorrectionEngine.start(request);
  const done = CorrectionEngine.run(state);
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', '§17 VERIFIED');
  eq(done.executedAttempts, 1, 'one attempt');
  eq(done.session.iteration, 1, 'one iteration');
  deepEq(done.session.visitedStates, ['IDLE','PLANNING','EXECUTING','EVALUATING','VERIFIED','TERMINATED'], 'the §3 choreography of a verified first cycle');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'the LIVE tool moved the rect to target (x 5 -> 0)');
  eq(s.historyManager.size(), 1, 'exactly one substrate transaction (per-attempt isolation, invariant 13 untouched)');
  eq(done.bestEvaluation, D_EVAL_AFTER, '§16 best = the post state');
  eq(done.session.currentEvaluation, D_EVAL_AFTER, 'the session carries the critic\'s post evaluation');
  eq(done.noProgressStreak, 0, 'the attempt made progress');
  deepEq(done.iterationLedger.map(e => e.outcome), ['ACCEPTED'], 'ledger: one accepted attempt');
  eq(done.iterationLedger[0].attempt.status, 'IMPROVED', 'the final §6 stage is IMPROVED');
  deepEq(done.session.corrections.map(a => a.status), ['IMPROVED'], 'the §4 corrections trail carries the final stage per attempt');
  eq(done.request.critic.calls.length, 2, '§22: initial + one re-evaluation — the loop produced NO evaluation itself');
  eq(done.request.critic.calls[1].document, request.document, 're-evaluation also gets (document, context) verbatim');
  eq(done.lastReport.action, 'TERMINATED', 'the run report is the termination');
  eq(done.convergence.kind, 'VERIFIED', 'convergence evidence carried');
  // a frozen engine state: the done state must not mutate the input state
  eq(state.status, 'RUNNING', 'the input state is untouched (immutable driver states)');
  eq(state.session.iteration, 0, 'the input session record is untouched');
});

test('E-6: MAX_ITERATIONS is the hard stop — a stubbornly improving agenda runs exactly maxIterations attempts and terminates MAX_ITERATIONS_REACHED from RE_EVALUATING', ()=>{
  const records = [eEvalX(5), eEvalX(3), eEvalX(1.5), eEvalX(0.75)];
  const { request, s } = eRequest({ records, policyOverrides: { maxIterations: 3 } });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'MAX_ITERATIONS_REACHED', 'the budget verdict');
  eq(done.executedAttempts, 3, 'exactly maxIterations attempts');
  eq(done.session.iteration, 3, 'budget consumed');
  deepEq(done.session.corrections.map(a => a.status), ['IMPROVED','IMPROVED','IMPROVED'], 'every attempt improved but never satisfied');
  deepEq(done.session.visitedStates.slice(-2), ['RE_EVALUATING','TERMINATED'], 'the give-up rides the §3 RE_EVALUATING→TERMINATED edge');
  eq(done.request.critic.calls.length, 4, 'initial + one re-evaluation per attempt');
  expect(done.request.critic.calls.every(c => c.document === request.document), 'every evaluation saw the same document');
  eq(s.historyManager.size(), 3, 'three independent attempt transactions');
});

test('E-7: NO_PROGRESS — two consecutive Δ≈0 iterations terminate NO_PROGRESS; the §33 SKIP consumes no execution; the T11 recipe-vs-tool contract gap surfaces as an honest FAILED attempt (disclosure 39)', ()=>{
  const grp = Object.freeze({ status:'DEVIATION', deviations:[{ id:'dev-e-grp', category:'structure', property:'structure.grouping', expected:true, actual:false, delta:null, tolerance:null, severity:'error', objectId:D_OBJ1, targetRef:'$doc:obj-1', message:'objects not grouped' }] });
  const target = dTarget({ category:'STRUCTURE', metric:'structure.grouping', objectIds:[D_OBJ1, D_OBJ2], observedValue:1, targetValue:undefined, severity:'MEDIUM' });
  const { request } = eRequest({ records: [grp, grp, grp], targets: [target], policyOverrides: { maxIterations: 5 } });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'streak 2 => §17 NO_PROGRESS');
  eq(done.executedAttempts, 2, 'T10 executed in iteration 1; the SKIPped T10 left only T11 for iteration 2');
  deepEq(done.session.corrections.map(a => a.status), ['NO_EFFECT','FAILED'], 'attempt 1 kept (NO_IMPROVEMENT is not the rollback path); attempt 2 hits the T11 group-node-id contract gap');
  const skips = done.refusalLedger.filter(r => r.source === 'SKIP');
  eq(skips.length, 1, 'iteration 2 SKIPped the identical T10 plan (§33: same fingerprint + Δ=0)');
  eq(skips[0].details.fingerprint, done.iterationLedger[0].plan && computeCorrectionFingerprint(done.iterationLedger[0].plan).fingerprint, 'the skipped fingerprint is attempt 1\'s plan fingerprint');
  eq(done.noProgressStreak, 2, 'both iterations netted zero');
  eq(done.request.critic.calls.length, 3, 'initial + one evaluation per consumed iteration');
});

test('E-8: OSCILLATION — A→B→A evaluation cycling is detected by the gap-aware §31 scan (adjacent recurrence is no-progress, not oscillation) and terminates OSCILLATION_DETECTED before the budget', ()=>{
  const records = [eEvalX(5), eEvalX(3), eEvalX(5), eEvalX(3), eEvalX(5)];
  const { request } = eRequest({ records, policyOverrides: { maxIterations: 8, maximumRegression: 1000 } });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'OSCILLATION_DETECTED', '§17 oscillation');
  eq(done.executedAttempts, 2, 'detected at the second re-evaluation — well before the budget');
  const fp = done.fingerprintTrail;
  eq(fp.length, 3, 'initial + two post-attempt fingerprints');
  eq(fp[0], fp[2], 'the trail returned to state A');
  expect(fp[0] !== fp[1], 'B differs from A');
  eq(done.convergence.evidence.oscillation.firstIndex, 0, 'first A index');
  eq(done.convergence.evidence.oscillation.repeatedIndex, 2, 'gap 2 recurrence (adjacent dups are the streak\'s business)');
  deepEq(done.session.corrections.map(a => a.status), ['IMPROVED','NO_EFFECT'], 'iteration 2 was KEPT (a worse state is not "no improvement" — it is a regression-classified rejection; here the tolerance is policy-widened so it lands NO_EFFECT)');
});

test('E-9: §33 SKIP inside the loop — a fixed-fiction authority drives SKIP-then-exhaust to NO_PROGRESS with exactly one executed attempt', ()=>{
  const records = [D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE];
  const { request } = eRequest({ records, policyOverrides: { maxIterations: 5 } });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'the skip exhausts the single-recipe cursor => §17 NO_PROGRESS');
  eq(done.executedAttempts, 1, 'the §33 gate consumed NO substrate work in iteration 2');
  eq(s_historySize(done), 1, 'exactly one transaction ever pushed');
  deepEq(done.refusalLedger.map(r => r.source), ['SKIP'], 'the skip is ledgered honestly');
  eq(done.noProgressStreak, 2, 'iteration 1 (NO_EFFECT) + iteration 2 (SKIP) = two consecutive Δ≈0 iterations');
  deepEq(done.session.corrections.map(a => a.status), ['NO_EFFECT'], 'only attempt 1 exists');
});
function s_historySize(state){
  return state.request.substrate.transactionManager.historyManager.size();
}

test('E-10: §22/§23 consumer-only — call count is exactly iterations+1 with verbatim positional args; a throwing critic propagates without fabricating state; a malformed record is refused INVALID_ATTEMPT', ()=>{
  // (a) exact call accounting on the E-5 scenario
  const a = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER] });
  const done = CorrectionEngine.run(CorrectionEngine.start(a.request));
  eq(done.request.critic.calls.length, done.executedAttempts + 1, 'critic calls = iterations + 1 (the initial evaluation included)');
  // (b) a critic that throws mid-loop: the raw failure propagates; no evaluation is invented; the caller's state is untouched
  const b = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER], critic: eCritic([D_EVAL_BEFORE, D_EVAL_AFTER], { throwAt: 2 }) });
  const started = CorrectionEngine.start(b.request);
  let threw = null;
  try { CorrectionEngine.run(started); } catch (e){ threw = e; }
  expect(threw, 'the authority failure propagates (never swallowed, never fabricated)');
  eq(b.critic.calls.length, 2, 'the failing call was the second evaluation');
  // (c) a malformed evaluation record: the shape guard refuses with the D-era INVALID_ATTEMPT bucket
  const c = eRequest({ records: [D_EVAL_BEFORE], critic: eCritic([D_EVAL_BEFORE], { badAt: 2, badRecord: { status: 'DEVIATION' } }) });
  let threw2 = null;
  try { CorrectionEngine.run(CorrectionEngine.start(c.request)); } catch (e){ threw2 = e; }
  expect(threw2, 'the malformed record is refused');
  throwsWithCode(() => { throw threw2; }, CorrectionErrorCodes.INVALID_ATTEMPT, 'the shape-guard bucket');
  expect(!JSON.stringify(threw2 && threw2.message).includes('fabricated'), 'no fabricated fallback evaluation');
});

test('E-11: GUIDED — propose then WAIT: nothing executes without approval; the §42 preview rides the proposal; approval executes the STORED plan; waiting is idempotent', ()=>{
  const { request, s } = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER], mode: 'GUIDED' });
  const proposed = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(proposed.status, 'AWAITING_APPROVAL', 'the engine waits');
  expect(proposed.pendingProposal, 'a proposal is pending');
  deepEq(Object.keys(proposed.pendingProposal), ['target','diagnosis','strategy','plan','preview','fingerprint','cursorIndex','rankedCount'], 'exact proposal shape');
  eq(proposed.pendingProposal.cursorIndex, 0, 'the top-ranked candidate');
  eq(proposed.pendingProposal.fingerprint, computeCorrectionFingerprint(proposed.pendingProposal.plan).fingerprint, 'the proposal carries its §30 fingerprint');
  expect(proposed.pendingProposal.preview && proposed.pendingProposal.preview.expectedEvaluation.basis === 'RULE_BASED', 'the §42 preview rides the proposal (RULE_BASED prediction, disclosure 21)');
  eq(s.geometryStore.get('geom-1').params.x, 5, 'NOTHING executed');
  eq(s.historyManager.size(), 0, 'no transaction');
  eq(proposed.session.state, 'IDLE', 'the §3 machine has not engaged');
  eq(proposed.session.iteration, 0, 'no iteration consumed');
  eq(proposed.request.critic.calls.length, 1, 'only the initial evaluation so far');
  // waiting without a directive is a deterministic idempotent no-op
  const waited = CorrectionEngine.iterate(proposed);
  eq(waited.status, 'AWAITING_APPROVAL', 'still waiting');
  eq(waited.lastReport.action, 'WAITED', 'the wait is reported');
  eq(waited.pendingProposal.fingerprint, proposed.pendingProposal.fingerprint, 'the same proposal stands');
  eq(s.historyManager.size(), 0, 'still nothing executed');
  // a non-boolean directive is refused
  throwsWithCode(() => CorrectionEngine.iterate(waited, { approved: 'yes' }), CorrectionErrorCodes.INVALID_TRANSITION, 'approval must be boolean');
  // approval executes the STORED plan (not a re-derivation)
  const planId = waited.pendingProposal.plan.id;
  const done = CorrectionEngine.iterate(waited, { approved: true });
  eq(done.lastReport.action, 'TERMINATED', 'the approved iterate terminated — the report carries the terminal action (disclosure 38)');
  eq(done.status, 'TERMINATED', 'the approved correction closes the loop');
  eq(done.terminationReason, 'VERIFIED', '§17 VERIFIED');
  eq(done.iterationLedger[0].plan.id, planId, 'the executed plan IS the approved stored plan');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'the correction stands');
  eq(s.historyManager.size(), 1, 'one transaction');
});

test('E-12: GUIDED rejection — the host rejects the proposal; the cursor advances past it; a single-recipe agenda exhausts to UNFIXABLE with the rejection ledgered', ()=>{
  const { request } = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER, D_EVAL_AFTER], mode: 'GUIDED' });
  const proposed = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(proposed.status, 'AWAITING_APPROVAL', 'proposed');
  const rejected = CorrectionEngine.iterate(proposed, { approved: false });
  eq(rejected.lastReport.action, 'TERMINATED', 'the rejection exhausted the cursor — the terminal report (disclosure 38)');
  eq(rejected.status, 'TERMINATED', 'no viable candidate remains');
  eq(rejected.terminationReason, 'UNFIXABLE', 'host rejection exhausts the single-recipe cursor');
  eq(rejected.session.state, 'IDLE', 'no cycle ever engaged (no-cycle rule)');
  eq(rejected.executedAttempts, 0, 'nothing executed');
  deepEq(rejected.refusalLedger.map(r => r.source), ['PROPOSAL_REJECTED'], 'the rejection is ledgered honestly');
  eq(rejected.request.critic.calls.length, 1, 'no re-evaluation ever happened');
});

test('E-13: SINGLE_STEP — exactly one correction per engine lifetime: STEPPED when unverified (the convergence verdicts still govern termination); further iterates are refused', ()=>{
  // (a) one step that does not verify -> STEPPED, session mid-trail, non-terminated
  const a = eRequest({ records: [eEvalX(5), eEvalX(3), eEvalX(3)], policyOverrides: { maxIterations: 5 }, mode: 'SINGLE_STEP' });
  const stepped = CorrectionEngine.run(CorrectionEngine.start(a.request));
  eq(stepped.status, 'STEPPED', 'one correction consumed the mode budget');
  eq(stepped.executedAttempts, 1, 'one attempt');
  eq(stepped.terminationReason, undefined, 'no convergence verdict — the mode pauses, it does not fabricate one');
  eq(stepped.session.state, 'EVALUATING', 'the first cycle completed');
  expect(stepped.session.state !== 'TERMINATED', 'the session is not terminated');
  throwsWithCode(() => CorrectionEngine.iterate(stepped), CorrectionErrorCodes.INVALID_TRANSITION, 'the step budget is spent — further iterates are refused');
  // (b) one step that verifies -> TERMINATED (convergence outranks the pause)
  const b = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER], mode: 'SINGLE_STEP' });
  const verified = CorrectionEngine.run(CorrectionEngine.start(b.request));
  eq(verified.status, 'TERMINATED', 'the single step closed the loop');
  eq(verified.terminationReason, 'VERIFIED', '§17 VERIFIED');
});

test('E-14: §26 mode dispatch is deterministic — repeated GUIDED runs on a waiting engine are byte-identical pauses; the dispatch never auto-executes an unapproved proposal', ()=>{
  const { request, s } = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER, D_EVAL_AFTER], mode: 'GUIDED' });
  const r1 = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(r1.status, 'AWAITING_APPROVAL', 'first run proposes');
  const r2 = CorrectionEngine.run(r1);
  const r3 = CorrectionEngine.run(r2);
  eq(r2.status, 'AWAITING_APPROVAL', 'still waiting');
  const projection = (st) => JSON.stringify({ session: st.session, status: st.status, terminationReason: st.terminationReason, convergence: st.convergence, fingerprintTrail: st.fingerprintTrail, noProgressStreak: st.noProgressStreak, executedAttempts: st.executedAttempts, iterationLedger: st.iterationLedger, refusalLedger: st.refusalLedger, pendingProposal: st.pendingProposal, focusTargetId: st.focusTargetId, cursorFloor: st.cursorFloor, lastReport: st.lastReport });
  eq(projection(r2), projection(r3), 'repeated waits are byte-identical (deterministic dispatch)');
  eq(r3.pendingProposal.fingerprint, r1.pendingProposal.fingerprint, 'the same proposal stands');
  eq(s.historyManager.size(), 0, 'three runs, zero executions — GUIDED never auto-executes');
  eq(r3.request.critic.calls.length, 1, 'no hidden evaluations');
});

test('E-15: terminate — USER_CANCELLED rides the §53 overlay from any non-terminated state; engine-driven reasons defer to the §3 machine; double termination is refused', ()=>{
  const a = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER], mode: 'GUIDED' });
  const proposed = CorrectionEngine.run(CorrectionEngine.start(a.request));
  const cancelled = CorrectionEngine.terminate(proposed, 'USER_CANCELLED');
  eq(cancelled.status, 'TERMINATED', 'terminated from AWAITING_APPROVAL');
  eq(cancelled.session.state, 'TERMINATED', 'the session record is terminated');
  eq(cancelled.session.terminationReason, 'USER_CANCELLED', '§50 reason carried');
  const b = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER] });
  const started = CorrectionEngine.start(b.request);
  const cancelled2 = CorrectionEngine.terminate(started, 'USER_CANCELLED');
  eq(cancelled2.session.terminationReason, 'USER_CANCELLED', 'the overlay works from IDLE too');
  throwsWithCode(() => CorrectionEngine.terminate(started, 'VERIFIED'), CorrectionErrorCodes.INVALID_TRANSITION, 'an engine-driven reason from a state with no §3 TERMINATED edge is refused by the machine');
  throwsWithCode(() => CorrectionEngine.terminate(cancelled, 'USER_CANCELLED'), CorrectionErrorCodes.INVALID_TRANSITION, 'double termination refused (absorbing state)');
  throwsWithCode(() => CorrectionEngine.terminate(started, 'WHENEVER'), CorrectionErrorCodes.INVALID_TERMINATION, 'non-§50 reason refused');
});

test('E-16: §15 critical regression inside the loop — the engine auto-rolls-back through the §3 ROLLING_BACK disposition, re-evaluates the restored state through the critic, retries, and the streak closes the loop; the best state is never the regressed last state', ()=>{
  const records = [eEvalX(5), eEvalX(2), eEvalX(8), eEvalX(2), eEvalX(8), eEvalX(2), eEvalX(8)];
  const { request, s } = eRequest({ records, policyOverrides: { maxIterations: 4 } });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'two rolled-back iterations net zero => streak 2');
  eq(done.executedAttempts, 3, 'improve, regress+rollback, retry+rollback');
  deepEq(done.session.corrections.map(a => a.status), ['IMPROVED','ROLLED_BACK','ROLLED_BACK'], 'one final §6 stage per attempt (disclosure 40)');
  deepEq(done.iterationLedger.map(e => e.outcome), ['ACCEPTED','REGRESSION_ROLLED_BACK','REGRESSION_ROLLED_BACK'], 'the ledger carries the rollback outcomes');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'the §32 undo restored the best state on the LIVE substrate');
  eq(done.bestEvaluation, records[1], '§16: the regressed LAST state was never best — the improved iteration-1 state survives');
  eq(done.noProgressStreak, 2, 'both rollback iterations netted zero (confirmation evaluations)');
  expect(done.convergence.kind === 'NO_PROGRESS', 'the convergence verdict is carried');
});

test('E-17: rollback (the §24 op) — the host unwinds the last attempt through the substrate\'s own §32 undo; the engine reports ROLLED_BACK at the ROLLING_BACK position; a spent or empty engine refuses', ()=>{
  const a = eRequest({ records: [eEvalX(5), eEvalX(3), eEvalX(3)], mode: 'SINGLE_STEP' });
  const stepped = CorrectionEngine.run(CorrectionEngine.start(a.request));
  eq(stepped.status, 'STEPPED', 'one attempt stands (store x = 0)');
  const rolled = CorrectionEngine.rollback(stepped);
  eq(rolled.status, 'ROLLED_BACK', 'the engine reports the manual rollback');
  eq(rolled.lastReport.action, 'MANUAL_ROLLBACK', 'reported');
  eq(rolled.session.state, 'ROLLING_BACK', 'the §3 disposition position');
  deepEq(rolled.session.corrections.map(x => x.status), ['ROLLED_BACK'], 'the attempt\'s final stage is ROLLED_BACK (one record per iteration)');
  eq(rolled.iterationLedger[0].outcome, 'ROLLED_BACK', 'the ledger entry is updated in place');
  eq(a.s.geometryStore.get('geom-1').params.x, 5, 'the substrate undo restored the store');
  throwsWithCode(() => CorrectionEngine.rollback(rolled), CorrectionErrorCodes.INVALID_ATTEMPT, 'nothing left to undo (the attempt is already ROLLED_BACK)');
  const fresh = eRequest({ records: [D_EVAL_BEFORE] });
  throwsWithCode(() => CorrectionEngine.rollback(CorrectionEngine.start(fresh.request)), CorrectionErrorCodes.INVALID_ATTEMPT, 'rollback with zero attempts refused');
});

test('E-18: termination property (§17/§26) — across 48 deterministic scenarios spanning four authority behaviors and three budgets, AUTO run ALWAYS terminates within the budget with a §50 reason and a valid session', ()=>{
  const scenario = (seed) => {
    const cls = seed % 4;
    const maxIterations = 1 + (seed % 3);
    let records;
    if (cls === 0) records = [eEvalX(5), eEvalX(4), eEvalX(2), eEvalX(0), eEvalX(0)];
    else if (cls === 1) records = [eEvalX(5), eEvalX(5), eEvalX(5), eEvalX(5), eEvalX(5)];
    else if (cls === 2) records = [eEvalX(5), eEvalX(3), eEvalX(5), eEvalX(3), eEvalX(5), eEvalX(3), eEvalX(5)];
    else records = [eEvalX(5), eEvalX(3), eEvalX(1.5), eEvalX(0.75), eEvalX(0.375)];
    const policyOverrides = cls === 2 ? { maxIterations, maximumRegression: 1000 } : { maxIterations };
    const expected = cls === 0 ? (maxIterations >= 3 ? 'VERIFIED' : 'MAX_ITERATIONS_REACHED')
      : cls === 1 ? (maxIterations === 1 ? 'MAX_ITERATIONS_REACHED' : 'NO_PROGRESS')
      : cls === 2 ? (maxIterations === 1 ? 'MAX_ITERATIONS_REACHED' : 'OSCILLATION_DETECTED')
      : 'MAX_ITERATIONS_REACHED';
    return { cls, maxIterations, records, policyOverrides, expected };
  };
  for (let seed = 0; seed < 48; seed++){
    const sc = scenario(seed);
    const { request } = eRequest({ records: sc.records, policyOverrides: sc.policyOverrides });
    const done = CorrectionEngine.run(CorrectionEngine.start(request));
    eq(done.status, 'TERMINATED', `seed ${seed} (class ${sc.cls}, max ${sc.maxIterations}): AUTO run terminates`);
    eq(done.terminationReason, sc.expected, `seed ${seed}: the disclosed convergence outcome`);
    expect(done.session.iteration <= sc.maxIterations, `seed ${seed}: the budget is the hard stop (${done.session.iteration} <= ${sc.maxIterations})`);
    eq(done.executedAttempts, done.session.iteration, `seed ${seed}: the engine mirrors the session iteration`);
    eq(validateCorrectionLoopSession(done.session).valid, true, `seed ${seed}: the session record stays valid`);
    expect(CORRECTION_TERMINATION_REASONS.includes(done.terminationReason), `seed ${seed}: §50 vocabulary`);
  }
});

test('E-19: §44 engine determinism — two identical AUTO runs on fresh substrates yield byte-identical canonical engine records; no substrate entropy (uuid/timestamps) leaks into them', ()=>{
  const canonical = (st) => JSON.stringify({
    session: st.session, status: st.status, terminationReason: st.terminationReason,
    convergence: st.convergence, bestEvaluation: st.bestEvaluation,
    fingerprintTrail: st.fingerprintTrail, noProgressStreak: st.noProgressStreak,
    executedAttempts: st.executedAttempts, iterationLedger: st.iterationLedger,
    refusalLedger: st.refusalLedger, lastReport: st.lastReport
  });
  const run = () => { const { request } = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_AFTER] }); return CorrectionEngine.run(CorrectionEngine.start(request)); };
  const a = run(), b = run();
  const ja = canonical(a), jb = canonical(b);
  eq(ja, jb, 'byte-identical canonical projections');
  expect(!ja.includes('createdAt'), 'no substrate timestamps');
  const stripped = ja.split(D_OBJ1).join('').split(D_OBJ2).join('').split(D_OBJ3).join('');
  expect(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(stripped), 'no substrate-generated uuids');
  eq(a.session.id, b.session.id, 'content-derived session ids agree');
});

test('E-20: exhaustion mappings — NO_CAPABILITY and hard-constraint refusals terminate deterministically from the no-cycle IDLE position with the disclosed §50 reasons', ()=>{
  // (a) SEMANTIC has no capability basis (§28) — the loop refuses to fabricate
  const sem = Object.freeze({ status:'DEVIATION', deviations:[{ id:'dev-e-sem', category:'semantic', property:'semantic.role', expected:'label', actual:'other', delta:null, tolerance:null, severity:'error', objectId:D_OBJ1, targetRef:'$doc:obj-1', message:'semantic role off' }] });
  const a = eRequest({ records: [sem], targets: [dTarget({ category:'SEMANTIC', metric:'semantic.role', observedValue:1, targetValue:0 })] });
  const doneA = CorrectionEngine.run(CorrectionEngine.start(a.request));
  eq(doneA.status, 'TERMINATED', 'terminated');
  eq(doneA.terminationReason, 'UNFIXABLE', 'no capability => §28 honest gap');
  eq(doneA.session.state, 'IDLE', 'no cycle engaged');
  deepEq(doneA.refusalLedger.map(r => r.source), ['NO_CAPABILITY'], 'ledgered');
  // (b) a hard (required) constraint on a mutated axis refuses every candidate — CONSTRAINT_BLOCKED
  const b = eRequest({ records: [D_EVAL_BEFORE, D_EVAL_BEFORE], planningContext: { constraints: [{ id:'c-e-hard-x', type:'vertical', objectIds:[D_OBJ1, D_OBJ2], strength:'required', enabled:true, source:'user', parameters:{} }] } });
  const doneB = CorrectionEngine.run(CorrectionEngine.start(b.request));
  eq(doneB.status, 'TERMINATED', 'terminated');
  eq(doneB.terminationReason, 'CONSTRAINT_BLOCKED', '§35-§37 planning gate exhausts the cursor');
  eq(doneB.session.state, 'IDLE', 'no cycle engaged');
  deepEq(doneB.refusalLedger.map(r => r.reason), ['HARD_CONSTRAINT_REJECTED'], 'the §35 refusal is ledgered');
  eq(doneB.executedAttempts, 0, 'nothing executed');
  eq(b.s.historyManager.size(), 0, 'no transaction');
});

test('E-21: multi-target agenda — focus follows the agenda order; the first satisfied target hands the focus to the next; both corrections land in agenda order and the loop verifies', ()=>{
  const posDev = eDev();
  const opDev = { id:'dev-e-op', category:'appearance', property:'appearance.opacity', expected:1, actual:0.5, delta:0.5, tolerance:0.000000001, severity:'warning', objectId:D_OBJ2, targetRef:'$doc:obj-2', message:'opacity off target' };
  const r0 = Object.freeze({ status:'DEVIATION', deviations:[posDev, opDev] });
  const r1 = Object.freeze({ status:'DEVIATION', deviations:[opDev] });
  const r2 = Object.freeze({ status:'PASS', deviations:[] });
  const targets = [dTarget(), dTarget({ category:'APPEARANCE', objectIds:[D_OBJ2], metric:'appearance.opacity', observedValue:0.5, targetValue:1, severity:'MEDIUM', evidence:[{ type:'METRIC', source:'evaluation', objectIds:[D_OBJ2], value:0.5 }] })];
  const { request, s } = eRequest({ records: [r0, r1, r2], targets });
  const done = CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'both targets satisfied');
  eq(done.executedAttempts, 2, 'one correction per target');
  deepEq(done.session.corrections.map(a => a.target.objectIds), [[D_OBJ1],[D_OBJ2]], 'agenda order preserved');
  deepEq(done.session.corrections.map(a => a.status), ['IMPROVED','IMPROVED'], 'both improved');
  eq(s.geometryStore.get('geom-1').params.x, 0, 'target 1 corrected on the live substrate');
  expect(JSON.stringify(s.appearanceStore.get('app-2')).includes('"opacity":1'), 'target 2 corrected on the live substrate');
  eq(done.request.critic.calls.length, 3, 'initial + one per attempt');
  deepEq(done.session.visitedStates, ['IDLE','PLANNING','EXECUTING','EVALUATING','DIAGNOSING','CORRECTING','RE_EXECUTING','RE_EVALUATING','VERIFIED','TERMINATED'], 'cycle 2 rides the §3 subcycle edges');
});

test('E-22: LIVE §12 authority grounding — the live evaluate() satisfies the §23 duck-type; the loop consumes its records verbatim; the house-metric vocabulary gap is surfaced honestly (no false fix, no fabricated correction) and a host-side adapter completes the loop end-to-end on the live substrate', ()=>{
  const E_EXPECTED = Object.freeze({ status:'requested', geometry:{ width:null, height:null, rx:null, ry:null, area:null, symmetric:null }, spatial:{ centered:false }, appearance:{ fill:null, opacity:1 }, constraint:{}, structure:{} });
  const liveCriticFor = (expected) => ({ evaluate: (document, context) => liveEvaluate(expected, document, context) });
  const evalCtx = (oid) => ({ targets: [{ objectId: oid, targetRef: '$doc:' + oid }] });
  // (a) the live authority satisfies the contract: its records pass BOTH the loop's shape guard and the live §12 validator
  const doc1 = eLiveDoc(1);
  const rec1 = liveEvaluate(E_EXPECTED, doc1.objectStore && { objectStore: doc1.objectStore, geometryStore: doc1.geometryStore, appearanceStore: doc1.appearanceStore, sceneGraph: doc1.sceneGraph }, evalCtx(D_OBJ2));
  eq(liveValidateEvaluationResult(rec1).valid, true, 'the live record is a valid §12 EvaluationResult');
  eq(rec1.deviations.length, 0, 'the matching scene evaluates clean');
  // (b) pre-verified through the LIVE authority
  const doc2 = eLiveDoc(1);
  const reqB = { rootIntentId:'intent-live', rootTransactionId:'tx-live', targets:[dTarget({ category:'APPEARANCE', objectIds:[D_OBJ2], metric:'appearance.opacity', observedValue:1, targetValue:1, evidence:[{ type:'METRIC', source:'evaluation', objectIds:[D_OBJ2], value:1 }] })], policy:createCorrectionLoopPolicy(), mode:'AUTO',
    critic: liveCriticFor(E_EXPECTED), document:{ objectStore: doc2.objectStore, geometryStore: doc2.geometryStore, appearanceStore: doc2.appearanceStore, sceneGraph: doc2.sceneGraph }, evaluationContext: evalCtx(D_OBJ2), substrate: doc2.substrate };
  const verified = CorrectionEngine.start(reqB);
  eq(verified.status, 'TERMINATED', 'the live clean evaluation verifies immediately');
  eq(verified.terminationReason, 'VERIFIED', '§17 VERIFIED over the LIVE record');
  eq(verified.session.initialEvaluation.status, 'PASS', 'the LIVE §12 record sits in the session (clean scene)');
  eq(verified.session.initialEvaluation.deviations.length, 0, 'zero live deviations');
  // (c) the vocabulary gap: the live authority emits the BARE property 'opacity'; the house metric is 'appearance.opacity'.
  //     The approved exact-or-dot-boundary rule (disclosure 14) is applied honestly: a house metric that does not match the
  //     authority's property reads as AT-TARGET (the documented host-side hazard), and a live-property metric cannot be planned
  //     by the house capability table => UNFIXABLE. The loop never bends either vocabulary to force a match.
  const doc3 = eLiveDoc(0.5);
  const doc3ctx = { objectStore: doc3.objectStore, geometryStore: doc3.geometryStore, appearanceStore: doc3.appearanceStore, sceneGraph: doc3.sceneGraph };
  const raw = liveEvaluate(E_EXPECTED, doc3ctx, evalCtx(D_OBJ2));
  eq(raw.deviations.length, 1, 'the live authority sees the opacity deviation');
  eq(raw.deviations[0].property, 'opacity', 'the LIVE property vocabulary is bare (not the house dotted metric)');
  const reqC1 = { ...reqB, critic: liveCriticFor(E_EXPECTED), document: doc3ctx, targets:[dTarget({ category:'APPEARANCE', objectIds:[D_OBJ2], metric:'appearance.opacity', observedValue:0.5, targetValue:1, evidence:[{ type:'METRIC', source:'evaluation', objectIds:[D_OBJ2], value:0.5 }] })] };
  const hazard = CorrectionEngine.start(reqC1);
  eq(hazard.status, 'TERMINATED', 'the house metric does not match the live property => the agenda checker reads AT-TARGET (the disclosed hazard, disclosure 41)');
  eq(hazard.terminationReason, 'VERIFIED', 'the hazard is EXACTLY a false verify — surfaced, not patched');
  const reqC2 = { ...reqB, critic: liveCriticFor(E_EXPECTED), document: doc3ctx, targets:[dTarget({ category:'APPEARANCE', objectIds:[D_OBJ2], metric:'opacity', observedValue:0.5, targetValue:1, evidence:[{ type:'METRIC', source:'evaluation', objectIds:[D_OBJ2], value:0.5 }] })] };
  const honest = CorrectionEngine.run(CorrectionEngine.start(reqC2));
  eq(honest.status, 'TERMINATED', 'terminated');
  eq(honest.terminationReason, 'UNFIXABLE', 'the live-property metric has NO house capability basis => the honest §28 gap');
  // (d) the host-side adapter (the disclosed host responsibility) completes the loop END-TO-END on the live substrate
  const adapt = (record) => ({ ...record, deviations: record.deviations.map(d => ({ ...d, property: d.property === 'opacity' ? 'appearance.opacity' : d.property })) });
  const adaptedCalls = [];
  const adaptedCritic = { calls: adaptedCalls, evaluate: (document, context) => { const r = adapt(liveEvaluate(E_EXPECTED, document, context)); adaptedCalls.push({ document, context }); return r; } };
  const doc4 = eLiveDoc(0.5);
  const reqD = { ...reqB, critic: adaptedCritic, document:{ objectStore: doc4.objectStore, geometryStore: doc4.geometryStore, appearanceStore: doc4.appearanceStore, sceneGraph: doc4.sceneGraph }, substrate: doc4.substrate, targets:[dTarget({ category:'APPEARANCE', objectIds:[D_OBJ2], metric:'appearance.opacity', observedValue:0.5, targetValue:1, evidence:[{ type:'METRIC', source:'evaluation', objectIds:[D_OBJ2], value:0.5 }] })] };
  const done = CorrectionEngine.run(CorrectionEngine.start(reqD));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'the adapted live authority closes the loop');
  eq(done.executedAttempts, 1, 'one T07 correction');
  expect(JSON.stringify(doc4.appearanceStore.get('lapp-1')).includes('"opacity":1'), 'the LIVE tool executed the correction on the live substrate');
  eq(adaptedCalls.length, 2, 'initial + one re-evaluation, all through the live authority');
});
function eLiveDoc(opacity){
  const objectStore=new DObjectStore(), geometryStore=new DGeometryStore(), appearanceStore=new DAppearanceStore();
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const transactionBuilder=new TransactionBuilder();
  geometryStore.create('lgeom-1', {type:'rect', params:{x:0,y:0,width:100,height:50,rx:0,ry:0}});
  appearanceStore.create({id:'lapp-1', stack:[{id:'lf1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity}}]});
  objectStore.create({id:D_OBJ2, geometryRef:'lgeom-1', appearanceRef:'lapp-1', meta:{name:'live-rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(D_OBJ2, root.id);
  return { objectStore, geometryStore, appearanceStore, sceneGraph, historyManager, transactionManager,
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph } };
}

// ===========================================================================
// CHECKPOINT F — §59 Integration Tests + §60 Property Tests + §61 Golden
// Scenario. VERIFICATION CHECKPOINT: every rollback/regression capability the
// spec names already exists from Checkpoint D (rollbackCorrectionAttempt §32,
// detectCorrectionRegression §15 — proven by D-8/D-9/D-11/D-19) and every
// loop/convergence capability from Checkpoint E — so F's work is to (1) prove
// the §59 integration chains A–E end-to-end on the LIVE substrate, (2) prove
// the §60 properties, (3) run the §61 golden scenario through the ACTUAL
// pipeline (Planner -> DSL -> Tool Registry -> Transaction -> Commit ->
// Critic -> Correction Engine), and (4) verify-and-cite the A–E tests that
// already cover a §59/§60 item.
//
// Coverage map (verify-and-cite discipline mandated by the F directive):
//   §59-A Planner→Execution→Critic→Correction→Evaluation→Verified : F-1 (new,
//        full live pipeline), §61 F-13 (the same chain, per-step evidence).
//   §59-B Correction→Regression→Rollback : D-19 + E-16 (cited) | F-2 (new,
//        LIVE-critic regression with §15 CRITICAL + §32 undo restore).
//   §59-C Correction→NoProgress→Terminate : E-7 + E-9 (cited) | F-3 re-proves
//        both arcs on the live substrate and binds the consumed authority
//        records to the LIVE §12 validator.
//   §59-D A→B→A Oscillation : E-8 (cited) | F-4 re-proves the arc + the §31
//        evidence semantics (post-attempt trail, disclosure 40).
//   §59-E Linear History Invariant : D-18 (cited) | F-5 (new, across the full
//        golden pipeline incl. rollback runs).
//   §60-P1 never mutate without transaction : F-6 (new; D-4/D-6/D-7 cited).
//   §60-P2 rollback restores pre-correction state : F-7 (new; D-8/D-9 cited).
//   §60-P3 renderer never mutates document state : F-8 (new; the renderer
//        purity precedent, tests/renderer.test.mjs:552/:355, cited).
//   §60-P4 hard constraints must not be violated : F-9 (new; C-era gate
//        KILL-C2 battery + D-15 cited).
//   §60-P5 loop must always terminate : E-18 (cited — the 48-seed property
//        battery) | F-10 (new, deterministic live-substrate grid).
//   §60-P6 HistoryManager remains linear : D-18 (cited) | F-11 (new, the
//        invariant-13 property swept across the F scenarios).
//   §60-P7 session-local iteration metadata without HistoryManager topology
//        change : D-18 (cited) | F-12 (new, exact §47 shape + topology scan).
//   §61 golden scenario : F-13 (new, all nine spec steps with evidence).
//
// F HARNESS (the §58 assembly, 3.14 Checkpoint E vertical-slice precedent):
// REAL stores + SceneGraph + EventBus + HistoryManager + TransactionExecutor;
// the REAL Planner (createExpectedState/createPlan/validatePlan), the REAL DSL
// path (compilePlanToDSL -> parseDSL -> validateDSL -> compileToIR ->
// DSLExecutor over the execution-side registry), the REAL evaluation.js
// authority behind the §23 critic duck-type, and the Correction Engine's
// injected substrate contract. NO src-js/ file is modified by Checkpoint F.
//
// F DISCLOSURES (recorded in the module header + the STOP report):
//   F-42. The golden scenario's "Planner initial arrangement" is the row the
//         planner's own create intents place (Rule A x/y placement) and the
//         planner's alignment intent (Rule G, axis 'vertical', mode 'top')
//         formally states — validated, NOT executed (the row already holds;
//         executing fixes is the loop's business). The critic's per-object
//         requested states are the planner's create ExpectedStates with the
//         recorded arrangement pinned as spatial.bbox (validateExpectedState
//         supports it; ai.js:459-466) — the numeric anchor the live authority
//         CAN evaluate (the bare spatial.aligned flag is honestly
//         unevaluated, evaluation.js:960-967).
//   F-43. The host critic adapter (the disclosed host responsibility,
//         E-22/disclosure 41 precedent): per-target liveEvaluate merged into
//         ONE §12 record through the LIVE createEvaluationResult; the live
//         placement property 'bbox.minY' bridges to the house metric
//         'position.y' (mode 'top': the row's alignment deviation IS the
//         top-edge offset — mapping both edges would double-count the T05
//         single-axis delta). Every merged record passes the LIVE §12
//         validator (asserted per call).
//   F-44. The "Align command" the golden scenario executes is the house
//         MoveObject (T05) carrying the physically-aligning translate; the
//         engine-driven T08 route is the DISCLOSED capability-table boundary:
//         align-to-axis resolves (recipe metric 'alignment' matches) but
//         plans refuse INSUFFICIENT_EVIDENCE (T08 is rule-less — no axis/mode
//         derivation, disclosure 19). Surfaced as deterministic evidence in
//         F-13, never patched — the approved 39(b) tradition.
//   F-45. RED-first scope: the F directive requires RED-first only for
//         MISSING capabilities; the coverage map found none (all §59/§60/§61
//         capabilities exist from D/E). The F battery was written and run
//         BEFORE any production change; first-run failures are recorded
//         honestly (3.15-F-red.txt) and were test-side only.
// ===========================================================================

// ---- F harness: the §61 golden document through the real §58 pipeline ------

const G_ARTBOARD = { width: 800, height: 600, centerX: 400, centerY: 300 };
const G_ROW_Y = 80, G_RECT_W = 100, G_RECT_H = 40;

async function gGolden(){
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const transactionBuilder=new TransactionBuilder();
  const docContext={ objectStore, geometryStore, appearanceStore, sceneGraph };
  const planCtx=gPlanningContext({ artboard: G_ARTBOARD, objects: {} });

  // §61 step 1 (CREATE 3 RECTANGLES) + step 2's placement: each create intent
  // goes Intent -> ExpectedState -> Plan -> validatePlan -> DSL -> IR ->
  // Tool Registry -> Transaction -> Commit (Rule A placement + Rule C fill).
  const fills=['#FF0000', '#00FF00', '#0000FF'];
  const intents=[40, 180, 320].map((x, i)=>({ type:'create', objectType:'rectangle',
    width:G_RECT_W, height:G_RECT_H, x, y:G_ROW_Y, fill:fills[i] }));
  const rects=[];
  for (const intent of intents){
    const expectedState=gCreateExpectedState(intent, planCtx);
    const plan=gCreatePlan(intent, planCtx);
    const verdict=gValidatePlan(plan, planCtx);
    eq(verdict.valid, true, 'gGolden: the create plan validates against the planning context');
    const dslProgram=compilePlanToDSL(plan);
    const parsed=parseDSL(JSON.stringify(dslProgram));
    const dslVerdict=validateDSL(parsed.program, planCtx);
    eq(dslVerdict.valid, true, 'gGolden: the DSL program validates');
    const ir=compileToIR(parsed.program, planCtx);
    const execution=await new DSLExecutor().execute(ir.ir, { toolRegistry: registry, documentContext: { ...docContext, transactionManager } });
    const out=execution.outputs.find(o=>o.output && o.output.objectId);
    if(!out) throw new Error('gGolden: T01 produced no objectId — '+JSON.stringify(execution.errors));
    const objectId=out.output.objectId;
    const obj=objectStore.get(objectId);
    const geom=geometryStore.get(obj.geometryRef);
    // rectBBox semantics (geometry.js:18 — maxX = x + width): the committed
    // arrangement bbox of the planner-placed rectangle (root-level identity
    // transform, so world = parametric).
    const bbox={ minX: geom.params.x, minY: geom.params.y,
      maxX: geom.params.x + geom.params.width, maxY: geom.params.y + geom.params.height };
    rects.push({ objectId, intent, expectedState, plan, bbox });
  }
  const objectIds=rects.map(r=>r.objectId);

  // §61 step 2 (PLANNER INITIAL ARRANGEMENT): the planner's alignment intent
  // (Rule G) is the arrangement's FORMAL statement — a schema-complete T08
  // plan over the created objects, validated but NOT executed (the row already
  // holds; executing fixes is the correction loop's business, not the
  // fixture's). F disclosure F-42.
  const objectsMap={}; for(const id of objectIds) objectsMap[id]={ id };
  const arrangeCtx=gPlanningContext({ artboard: G_ARTBOARD, objects: objectsMap });
  const alignmentIntent={ type:'alignment', targets:[...objectIds], axis:'vertical', mode:'top' };
  const alignmentPlan=gCreatePlan(alignmentIntent, arrangeCtx);
  const alignmentVerdict=gValidatePlan(alignmentPlan, arrangeCtx);
  eq(alignmentVerdict.valid, true, 'gGolden: the planner alignment plan (Rule G) validates');
  eq(alignmentPlan.steps[0].toolId, 'T08', 'Rule G resolves the alignment intent to T08 align_objects');
  const alignmentExpected=gCreateExpectedState(alignmentIntent, arrangeCtx);

  // The per-object requested states: the planner's create ExpectedStates with
  // the recorded arrangement pinned as spatial.bbox (F disclosure F-42).
  const expectedByObject={};
  for (const r of rects){
    expectedByObject[r.objectId]={ ...r.expectedState,
      spatial:{ aligned:true, centered:false, bbox:{ ...r.bbox } } };
  }

  // The host §23 critic (F disclosure F-43): per-target LIVE evaluate merged
  // into ONE §12 record through the LIVE createEvaluationResult; the live
  // placement property bridges to the house metric namespace (mode 'top' =>
  // bbox.minY -> position.y by default; F-13's step-5c passes the alignment
  // bridge to reach the T08 capability boundary). Every record is validated by
  // the LIVE §12 validator before it leaves the authority.
  function gCritic(bridge){
    const calls=[];
    const adapt = bridge || (d => d.property==='bbox.minY' ? { ...d, property:'position.y' } : d);
    return {
      calls,
      evaluate(document, context){
        calls.push({ document, context });
        const per=context.targets.map(entry=> liveEvaluate(expectedByObject[entry.objectId], document, { ...context, targets:[entry] }));
        const deviations=per.flatMap(rec=>rec.deviations).map(adapt);
        const actual=gBuildActualState(document, context);
        const union=per.flatMap(r=>r.evaluated);
        const evaluated=['existence','geometry','appearance','placement','structure','transform'].filter(c=>union.includes(c));
        const merged=gCreateEvaluationResult({ expected: alignmentExpected, actual, deviations, evaluated,
          metadata:{ tolerances:{ ...G_TOLERANCES }, unevaluatedExpectations:['spatial.aligned'] } });
        const v=liveValidateEvaluationResult(merged);
        eq(v.valid, true, 'gCritic: the merged record is a valid LIVE §12 EvaluationResult');
        return merged;
      }
    };
  }

  // The agenda target over the third rectangle (the one the error displaces).
  function gPositionTarget(targetValue, observed, over={}){
    return bTarget({ category:'POSITION', objectIds:[objectIds[2]], metric:'position.y',
      observedValue: observed, targetValue, severity:'HIGH', confidence:0.9,
      evidence:[{ type:'METRIC', source:'evaluation', objectIds:[objectIds[2]], value: observed }], ...over });
  }

  // §61 step 3 (INTRODUCE ALIGNMENT ERROR): a real substrate transaction via
  // the real command factory — never a direct store write.
  function introduceError(dy){
    const before=historyManager.size();
    const tx=new TransactionBuilder().begin({ source:'fixture', description:'introduce alignment error' })
      .addCommand(transactionNS.createMoveObjectCommand({ objectId: objectIds[2], dx:0, dy })).build();
    transactionManager.execute(tx);
    return { tx, before, after: historyManager.size() };
  }

  function geomParamsOf(oid){ return geometryStore.get(objectStore.get(oid).geometryRef).params; }
  function storeSnapshot(){
    return JSON.stringify({
      objects: objectIds.map(id=>objectStore.get(id)),
      geoms: objectIds.map(id=>geometryStore.get(objectStore.get(id).geometryRef)),
      apps: objectIds.map(id=>appearanceStore.get(objectStore.get(id).appearanceRef))
    });
  }

  function gRequest(over={}){
    return {
      rootIntentId: over.rootIntentId || 'intent-golden',
      rootTransactionId: over.rootTransactionId || 'tx-root-golden',
      targets: over.targets,
      policy: createCorrectionLoopPolicy(over.policyOverrides || {}),
      mode: over.mode || 'AUTO',
      critic: over.critic,
      document: docContext,
      evaluationContext: { targets: objectIds.map(id=>({ objectId:id, targetRef:'$doc:'+id })) },
      planningContext: over.planningContext,
      substrate: { registry, transactionManager, transactionBuilder, sceneGraph }
    };
  }

  return { objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager,
    transactionManager, registry, transactionBuilder, docContext, rects, objectIds,
    alignmentIntent, alignmentPlan, expectedByObject,
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph },
    gCritic, gPositionTarget, introduceError, geomParamsOf, storeSnapshot, gRequest };
}

// The C-era constraint record shape (the gate reads id/type/objectIds/
// strength/enabled — tests/correction.test.mjs:1113-1115 discipline).
function gConstraint(over={}){
  return { id:'c-fix', type:'horizontal', objectIds:['obj-1'], strength:'required', enabled:true, source:'user', parameters:{}, ...over };
}

// ---- §59 Integration Tests --------------------------------------------------

test('F-1 (§59-A): Planner -> Execution -> Critic -> Correction -> Evaluation -> Verified — the full §58 pipeline on the LIVE substrate closes through the Correction Engine', async ()=>{
  const g=await gGolden();
  const critic=g.gCritic();
  // the pipeline legs already ran inside the fixture: 3 create intents through
  // the real Planner/DSL/registry path (T01 creation + T07 fill per rect)
  expect(g.historyManager.size() >= 3, 'the create legs committed through the pipeline');
  for (const r of g.rects){
    eq(g.geomParamsOf(r.objectId).width, G_RECT_W, 'the committed rect matches the intent (width)');
    eq(g.geomParamsOf(r.objectId).height, G_RECT_H, 'the committed rect matches the intent (height)');
  }
  g.introduceError(12);
  const req=g.gRequest({ critic, targets:[g.gPositionTarget(80, 92)] });
  const done=CorrectionEngine.run(CorrectionEngine.start(req));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'the live chain verifies');
  eq(done.executedAttempts, 1, 'one correction closes the loop');
  deepEq(done.session.visitedStates, ['IDLE','PLANNING','EXECUTING','EVALUATING','VERIFIED','TERMINATED'], 'the §3 choreography of a verified first cycle');
  eq(g.geomParamsOf(g.objectIds[2]).y, 80, 'the LIVE T05 correction restored the planner arrangement');
  eq(critic.calls.length, 2, '§22: initial + one re-evaluation — the loop produced NO evaluation itself');
  expect(critic.calls.every(c=>c.document===req.document), 'every evaluation saw the request document verbatim');
  deepEq(done.session.corrections.map(a=>a.status), ['IMPROVED'], 'the §6 trail carries the final stage');
  eq(done.bestEvaluation, done.iterationLedger[0].afterEvaluation, '§16 best = the post state');
  eq(done.noProgressStreak, 0, 'the attempt made progress');
  eq(done.convergence.kind, 'VERIFIED', 'convergence evidence carried');
});

test('F-2 (§59-B): Correction -> Regression -> Rollback — the live critic watches the correction regress the alignment; §15 declares CRITICAL; the §32 undo restores the row', async ()=>{
  const g=await gGolden();
  const critic=g.gCritic();
  const err=g.introduceError(12);
  const preRun=g.storeSnapshot();
  const sizeAfterError=g.historyManager.size();
  // the agenda demands y=104 — on the WRONG side of the row anchor (80): the
  // derived T05 delta drives the row FURTHER from the critic's arrangement.
  const req=g.gRequest({ critic, targets:[g.gPositionTarget(104, 92)] });
  const done=CorrectionEngine.run(CorrectionEngine.start(req));
  eq(done.status, 'TERMINATED', 'terminated');
  const finals=done.session.corrections.map(a=>a.status);
  expect(finals.length >= 1, 'at least one attempt was made');
  expect(finals.every(s=>s==='ROLLED_BACK'), 'every regressed attempt was rolled back: '+JSON.stringify(finals));
  deepEq(done.iterationLedger.map(e=>e.outcome), finals.map(()=> 'REGRESSION_ROLLED_BACK'), 'the ledger records the §15 verdict per attempt (the engine\'s rollback-disposition outcome)');
  eq(g.storeSnapshot(), preRun, 'the §32 undo restored the EXACT pre-run state (P2 cross-proof)');
  eq(g.geomParamsOf(g.objectIds[2]).y, 92, 'the misaligned row is exactly as the error left it');
  // the rollback confirmations net zero progress twice -> the §17 streak closes the loop
  eq(done.terminationReason, 'NO_PROGRESS', 'the rollback arc terminates through the no-progress streak');
  eq(done.executedAttempts, 2, 'the Δ≠0 post-attempt state legitimizes the §69-style retry, then the streak closes');
  eq(done.noProgressStreak, 2, 'two consecutive net-zero confirmations');
  // linear history: the LATEST attempt transaction survives; the undone
  // predecessor was TRUNCATED by the retry's push — the linear-stack
  // signature (invariant 13; undo never appends, push never branches).
  const hIds=g.historyManager.getAll().map(t=>t.id);
  eq(g.historyManager.size() - sizeAfterError, 1, 'exactly ONE attempt transaction survives in the linear stack');
  const lastCorrection=done.session.corrections[done.session.corrections.length-1];
  expect(hIds.includes(lastCorrection.transactionId), 'the surviving attempt transaction is in history');
  expect(!hIds.includes(done.iterationLedger[0].attempt.transactionId) || done.iterationLedger[0].attempt.transactionId===lastCorrection.transactionId, 'the undone predecessor was truncated by the retry push (no branch, no DAG)');
  eq(g.historyManager.current().id, err.tx.id, 'the pointer sits at the error transaction — both rollbacks unwound exactly to it');
});

test('F-3 (§59-C): Correction -> No Progress -> Terminate — verify-and-cite (E-7 + E-9) re-proven on the live substrate with LIVE-§12-valid authority records', ()=>{
  // F upgrade over the E-era doubles: the authority records here are built
  // through the LIVE createEvaluationResult, so they are FULL §12 records
  // (expected/actual/evaluated/metadata aboard) — the convergence judgment
  // rides records the live §12 validator accepts END TO END.
  const rs=dSubstrate();
  const rsDoc={ objectStore:rs.objectStore, geometryStore:rs.geometryStore, appearanceStore:rs.appearanceStore, sceneGraph:rs.sceneGraph };
  const rsCtx={ targets:[{ objectId:D_OBJ1, targetRef:'$doc:obj-1' }] };
  const G_MIN_EXPECTED=Object.freeze({ status:'requested', geometry:{ width:null, height:null, rx:null, ry:null, area:null, symmetric:null }, spatial:{ aligned:null, centered:null, bbox:null }, appearance:{ fill:null, stroke:null, opacity:null }, constraint:{ satisfied:null }, structure:{ grouped:true } });
  // (a) E-7's arc re-run: two consecutive Δ≈0 iterations terminate NO_PROGRESS;
  // the §33 SKIP consumes no execution; the T11 contract gap is an honest FAILED.
  const grp=gCreateEvaluationResult({ expected:G_MIN_EXPECTED, actual:gBuildActualState(rsDoc, rsCtx),
    deviations:[{ id:'dev-f-grp', category:'structure', property:'structure.grouping', expected:true, actual:false, delta:null, tolerance:null, severity:'error', objectId:D_OBJ1, targetRef:'$doc:obj-1', message:'objects not grouped' }],
    evaluated:['structure'], metadata:{} });
  const target=dTarget({ category:'STRUCTURE', metric:'structure.grouping', objectIds:[D_OBJ1, D_OBJ2], observedValue:1, targetValue:undefined, severity:'MEDIUM' });
  const { request }=eRequest({ records:[grp, grp, grp], targets:[target], policyOverrides:{ maxIterations:5 } });
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'streak 2 => §17 NO_PROGRESS (E-7 cite)');
  eq(done.executedAttempts, 2, 'T10 executed; the SKIPped T10 left only T11 for iteration 2');
  deepEq(done.session.corrections.map(a=>a.status), ['NO_EFFECT','FAILED'], 'the same arc E-7 proved, re-proven');
  eq(done.noProgressStreak, 2, 'both iterations netted zero');
  // (b) the authority records the loop consumed are valid LIVE §12 records —
  // the convergence judgment rides records the live §12 validator accepts.
  eq(liveValidateEvaluationResult(grp).valid, true, 'the no-progress authority record is a FULL §12-valid record');
  // (c) E-9's SKIP-exhaustion arc re-run: one executed attempt, the rest SKIPped.
  const { request: req2 }=eRequest({ records:[D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE, D_EVAL_BEFORE], policyOverrides:{ maxIterations:5 } });
  const done2=CorrectionEngine.run(CorrectionEngine.start(req2));
  eq(done2.terminationReason, 'NO_PROGRESS', 'the SKIP exhausts the single-recipe cursor (E-9 cite)');
  eq(done2.executedAttempts, 1, 'the §33 gate consumed NO substrate work in iteration 2');
  deepEq(done2.refusalLedger.map(r=>r.source), ['SKIP'], 'the skip is ledgered honestly');
  eq(done2.convergence.kind === 'NO_PROGRESS' || done2.terminationReason === 'NO_PROGRESS', true, 'the E-9 arc terminates NO_PROGRESS (the exhaustion verdict rides the §50 reason)');
  eq(done2.noProgressStreak, 2, 'iteration 1 (NO_EFFECT) + iteration 2 (SKIP) = two consecutive Δ≈0 iterations');
  // the E-9 arc's minimal fixture stays as E-9 recorded it (cited); its
  // §12-complete counterpart is validated here to bind the vocabulary.
  const before12=gCreateEvaluationResult({ expected:{ ...G_MIN_EXPECTED, structure:{ grouped:null } }, actual:gBuildActualState(rsDoc, rsCtx),
    deviations:[dDeviation()], evaluated:['geometry'], metadata:{} });
  eq(liveValidateEvaluationResult(before12).valid, true, 'the fixed-state authority record has a FULL §12-valid counterpart');
});

test('F-4 (§59-D): A -> B -> A oscillation — verify-and-cite (E-8) + the §31 evidence semantics on the live substrate', ()=>{
  // §12-complete authority records (the F-3 upgrade) over the E-8 arc.
  const rs=dSubstrate();
  const rsDoc={ objectStore:rs.objectStore, geometryStore:rs.geometryStore, appearanceStore:rs.appearanceStore, sceneGraph:rs.sceneGraph };
  const rsCtx={ targets:[{ objectId:D_OBJ1, targetRef:'$doc:obj-1' }] };
  const G_MIN_EXPECTED=Object.freeze({ status:'requested', geometry:{ width:null, height:null, rx:null, ry:null, area:null, symmetric:null }, spatial:{ aligned:null, centered:null, bbox:null }, appearance:{ fill:null, stroke:null, opacity:null }, constraint:{ satisfied:null }, structure:{ grouped:null } });
  const fEvalX=(x)=> gCreateEvaluationResult({ expected:G_MIN_EXPECTED, actual:gBuildActualState(rsDoc, rsCtx),
    deviations: x===0 ? [] : [eDev({ id:'dev-e-px-' + String(x).replace('.','_'), actual:x, delta:x, message:`position.x at ${x}` })],
    evaluated:['geometry'], metadata:{} });
  const records=[fEvalX(5), fEvalX(3), fEvalX(5), fEvalX(3), fEvalX(5)];
  const { request }=eRequest({ records, policyOverrides:{ maxIterations:8, maximumRegression:1000 } });
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'OSCILLATION_DETECTED', '§17 oscillation (E-8 cite)');
  eq(done.executedAttempts, 2, 'detected at the second re-evaluation — well before the budget');
  eq(done.convergence.evidence.oscillation.firstIndex, 0, 'first A index');
  eq(done.convergence.evidence.oscillation.repeatedIndex, 2, 'gap-2 recurrence (adjacent dups are the streak\'s business)');
  const fp=done.fingerprintTrail;
  eq(fp.length, 3, 'the trail carries post-ATTEMPT fingerprints only (disclosure 40)');
  eq(fp[0], fp[2], 'the trail returned to state A');
  expect(fp[0] !== fp[1], 'B differs from A');
  for (const r of records) eq(liveValidateEvaluationResult(r).valid, true, 'the oscillation authority records are FULL §12-valid records');
});

test('F-5 (§59-E): Linear History Invariant — the golden pipeline\'s HistoryManager stays a flat linear undo stack through creation, error injection, correction, and rollback', async ()=>{
  const g=await gGolden();
  const err=g.introduceError(12);
  const critic=g.gCritic();
  const done=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({ critic, targets:[g.gPositionTarget(104, 92)] })));
  const rollbacks=done.session.corrections.filter(a=>a.status==='ROLLED_BACK').length;
  const h=g.historyManager;
  const all=h.getAll();
  expect(Array.isArray(all), 'flat array — no DAG structure (invariant 13, D-18 cite)');
  const ids=all.map(t=>t.id);
  expect(new Set(ids).size===ids.length, 'unique transaction ids — no duplicated history entries');
  expect(all.every(t=>t.status==='committed'), 'every history entry is a committed transaction');
  // the LATEST attempt transaction survives; the undone predecessor was
  // TRUNCATED by the retry's push — the linear-stack signature (an undone
  // transaction is never re-pushed beside its successor).
  const lastAttempt=done.session.corrections[done.session.corrections.length-1];
  expect(ids.includes(lastAttempt.transactionId), 'the surviving attempt transaction sits in the linear history: '+lastAttempt.transactionId);
  const firstAttempt=done.iterationLedger[0].attempt;
  if (firstAttempt.transactionId !== lastAttempt.transactionId){
    expect(!ids.includes(firstAttempt.transactionId), 'the undone predecessor was truncated by the retry push — the stack never branches');
  }
  eq(rollbacks, 2, 'the scenario rolled both attempts back');
  eq(h.current().id, err.tx.id, 'the undo pointer sits at the error transaction — every rollback unwound exactly one entry');
  // invariant 13: a push after the undos truncates the redo tail (linear, not branched)
  const idxBefore=h.getCurrentIndex();
  const sizeBefore=h.size();
  const probe=new TransactionBuilder().begin({ source:'fixture', description:'post-rollback push' })
    .addCommand(transactionNS.createMoveObjectCommand({ objectId:g.objectIds[0], dx:1, dy:0 })).build();
  g.transactionManager.execute(probe);
  eq(h.getCurrentIndex(), h.size() - 1, 'the pointer rides the new top after the truncating push');
  expect(h.size() <= sizeBefore, 'the push truncated the undone tail (the stack never grew past the pre-push size)');
  expect(h.getAll().map(t=>t.id).includes(probe.id), 'the probe transaction is the new top of the linear stack');
});

// ---- §60 Property Tests -----------------------------------------------------

test('F-6 (§60-P1): Correction must never mutate without a transaction — every store transition is attributable to committed history entries (+ D-4/D-6/D-7 cite)', async ()=>{
  // (a) the VERIFIED arc: the store changed and the change is exactly the one
  // pushed attempt transaction.
  const g=await gGolden(); const critic=g.gCritic();
  g.introduceError(12);
  const preIds=new Set(g.historyManager.getAll().map(t=>t.id));
  const preStore=g.storeSnapshot();
  const done=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({ critic, targets:[g.gPositionTarget(80, 92)] })));
  const fresh=g.historyManager.getAll().filter(t=>!preIds.has(t.id));
  eq(fresh.length, done.executedAttempts, 'exactly one new history entry per executed attempt');
  for (const e of done.iterationLedger){
    expect(fresh.some(t=>t.id===e.attempt.transactionId), 'the attempt\'s mutations are transaction-attributed');
  }
  expect(preStore !== g.storeSnapshot(), 'the store changed (the correction landed)');
  // (b) the REGRESSION arc: the net store is unchanged (every mutation was
  // transaction-attributed AND undone through the substrate's own inverse).
  const g2=await gGolden(); const critic2=g2.gCritic();
  g2.introduceError(12);
  const preIds2=new Set(g2.historyManager.getAll().map(t=>t.id));
  const preStore2=g2.storeSnapshot();
  const done2=CorrectionEngine.run(CorrectionEngine.start(g2.gRequest({ critic:critic2, targets:[g2.gPositionTarget(104, 92)] })));
  const fresh2=g2.historyManager.getAll().filter(t=>!preIds2.has(t.id));
  const rollbacks2=done2.session.corrections.filter(a=>a.status==='ROLLED_BACK').length;
  eq(fresh2.length, done2.executedAttempts - rollbacks2 + 1, 'the SURVIVING attempt transaction is the only new entry — the undone predecessor was truncated by the retry push (invariant 13)');
  eq(g2.storeSnapshot(), preStore2, 'the net store is unchanged — the mutations were undone via the transactions\' own inverses');
});

test('F-7 (§60-P2): Rollback must restore pre-correction state — byte-exact restoration on every rollback path (+ D-8/D-9 cite)', async ()=>{
  // (a) engine-driven rollbacks (the F-2 arc): post-run store === pre-run store.
  const g=await gGolden(); const critic=g.gCritic();
  g.introduceError(12);
  const preRun=g.storeSnapshot();
  const done=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({ critic, targets:[g.gPositionTarget(104, 92)] })));
  expect(done.session.corrections.every(a=>a.status==='ROLLED_BACK'), 'the scenario rolled every attempt back');
  eq(g.storeSnapshot(), preRun, 'the undo restored the pre-correction state byte-exactly');
  // (b) the manual command-inverse path (D-8) on the golden doc: a T05 attempt
  // rolled back through rollbackCorrectionAttempt restores byte-exactly.
  const g2=await gGolden();
  const session=createCorrectionLoopSession({ rootIntentId:'intent-f7', rootTransactionId:'tx-f7', maxIterations:5, initialEvaluation:D_EVAL_BEFORE });
  const target=bTarget({ category:'POSITION', objectIds:[g2.objectIds[0]], metric:'position.x', observedValue:40, targetValue:80, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'METRIC', source:'evaluation', objectIds:[g2.objectIds[0]], value:40 }] });
  const strategy=createCorrectionStrategy({ name:'f7-translate', applicableTo:['POSITION_ERROR'],
    commands:[{ kind:'MoveObject', toolId:'T05', input:{ objectIds:[g2.objectIds[0]], delta:{ x:40, y:0 } } }],
    expectedEffect:{ metric:'position.x', direction:'TOWARD_TARGET' }, risk:'LOW', reversible:true, confidence:1 });
  const diagnosis=createCorrectionDiagnosis({ targetId:target.id, rootCause:'POSITION_ERROR', confidence:0.9, affectedObjects:[...target.objectIds], recommendedStrategies:[strategy] });
  const plan=createCorrectionPlan({ sessionId:session.id, diagnosis, strategy,
    commands:[{ kind:'MoveObject', toolId:'T05', input:{ objectIds:[g2.objectIds[0]], delta:{ x:40, y:0 } } }],
    expectedImprovement:{ metric:'position.x', from:40, to:80, delta:40, direction:'TOWARD_TARGET' },
    riskAssessment:{ level:'LOW', reversible:true, scope:'LOCAL', secondaryObjectCount:0 },
    preconditions:[{ kind:'objects-exist', objectIds:[...target.objectIds] }],
    postconditions:[{ kind:'metric-moves-toward-target', metric:'position.x', from:40, to:80 }] });
  const pre=g2.storeSnapshot();
  const exec=executeCorrectionAttempt({ session, target, plan, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:g2.substrate });
  eq(exec.status, 'EXECUTED', 'the T05 attempt executed');
  expect(pre !== g2.storeSnapshot(), 'the attempt mutated the store');
  const rb=rollbackCorrectionAttempt({ attempt:exec.attempt, substrate:g2.substrate });
  eq(rb.attempt.status, 'ROLLED_BACK', 'the rollback stage recorded');
  eq(g2.storeSnapshot(), pre, 'the command-inverse undo restored the pre-correction state byte-exactly');
  // (c) the snapshot-fallback path (D-9) on the golden doc: a T07 appearance
  // attempt (non-invertible) rolls back through the substrate's snapshot inverse.
  const g3=await gGolden();
  const session3=createCorrectionLoopSession({ rootIntentId:'intent-f7c', rootTransactionId:'tx-f7c', maxIterations:5, initialEvaluation:D_EVAL_BEFORE });
  const target3=bTarget({ category:'APPEARANCE', objectIds:[g3.objectIds[0]], metric:'appearance.opacity', observedValue:1, targetValue:0.5, severity:'MEDIUM', confidence:0.9,
    evidence:[{ type:'METRIC', source:'evaluation', objectIds:[g3.objectIds[0]], value:1 }] });
  const strategy3=createCorrectionStrategy({ name:'f7-style', applicableTo:['STYLE_ERROR'],
    commands:[{ kind:'UpdateAppearance', toolId:'T07', input:{ objectIds:[g3.objectIds[0]], opacity:0.5 } }],
    expectedEffect:{ metric:'appearance.opacity', direction:'TOWARD_TARGET' }, risk:'LOW', reversible:true, confidence:1 });
  const diagnosis3=createCorrectionDiagnosis({ targetId:target3.id, rootCause:'STYLE_ERROR', confidence:0.9, affectedObjects:[...target3.objectIds], recommendedStrategies:[strategy3] });
  const plan3=createCorrectionPlan({ sessionId:session3.id, diagnosis:diagnosis3, strategy:strategy3,
    commands:[{ kind:'UpdateAppearance', toolId:'T07', input:{ objectIds:[g3.objectIds[0]], opacity:0.5 } }],
    expectedImprovement:{ metric:'appearance.opacity', from:1, to:0.5, delta:-0.5, direction:'TOWARD_TARGET' },
    riskAssessment:{ level:'LOW', reversible:true, scope:'LOCAL', secondaryObjectCount:0 },
    preconditions:[{ kind:'objects-exist', objectIds:[...target3.objectIds] }],
    postconditions:[{ kind:'metric-moves-toward-target', metric:'appearance.opacity', from:1, to:0.5 }] });
  const pre3=g3.storeSnapshot();
  const exec3=executeCorrectionAttempt({ session:session3, target:target3, plan:plan3, iteration:1, beforeEvaluation:D_EVAL_BEFORE, substrate:g3.substrate });
  eq(exec3.status, 'EXECUTED', 'the T07 attempt executed');
  const rb3=rollbackCorrectionAttempt({ attempt:exec3.attempt, substrate:g3.substrate });
  eq(rb3.attempt.status, 'ROLLED_BACK', 'the snapshot-fallback rollback recorded');
  eq(g3.storeSnapshot(), pre3, 'the snapshot inverse restored the pre-correction state byte-exactly');
});

test('F-8 (§60-P3): Renderer must never mutate document state — the golden document renders identically across FRESH builders with byte-identical canonical stores (cite: tests/renderer.test.mjs:552/:355)', async ()=>{
  const g=await gGolden();
  const pre=g.storeSnapshot();
  // FRESH builders per build (the builder carries its own version counter —
  // the render content over the same canonical stores is what must agree).
  const r1=new RenderTreeBuilder({ objectStore:g.objectStore, geometryStore:g.geometryStore, appearanceStore:g.appearanceStore, sceneGraph:g.sceneGraph }).build();
  const mid=g.storeSnapshot();
  const r2=new RenderTreeBuilder({ objectStore:g.objectStore, geometryStore:g.geometryStore, appearanceStore:g.appearanceStore, sceneGraph:g.sceneGraph }).build();
  expect(JSON.stringify(r1.tree)===JSON.stringify(r2.tree), 'the render tree is deterministic across fresh builds over the same canonical stores');
  expect(r1.tree.nodes.length >= 3, 'the golden row renders (the three rects + their hierarchy)');
  eq(mid, pre, 'canonical stores byte-identical after the first render');
  eq(g.storeSnapshot(), pre, 'canonical stores byte-identical after the second render');
});

test('F-9 (§60-P4): Hard constraints must not be violated — a required constraint on a mutated axis blocks the correction; an orthogonal required constraint holds numerically (+ C-era KILL-C2 battery, D-15 cite)', async ()=>{
  // (a) REJECT face: a required alignTop constraint over the TARGET object
  // pins y — the T05 y-translation mutates y, so the plan is refused and the
  // loop terminates CONSTRAINT_BLOCKED without ever touching the substrate.
  const g=await gGolden(); const critic=g.gCritic();
  g.introduceError(12);
  const sizeAfterError=g.historyManager.size();
  const snapAfterError=g.storeSnapshot();
  const blocked=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({
    critic, targets:[g.gPositionTarget(80, 92)],
    planningContext:{ constraints:[ gConstraint({ id:'con-top', type:'alignTop', objectIds:[g.objectIds[2]], strength:'required', enabled:true }) ] } })));
  eq(blocked.status, 'TERMINATED', 'terminated');
  eq(blocked.terminationReason, 'CONSTRAINT_BLOCKED', 'the §35 hard-constraint refusal exhausts to CONSTRAINT_BLOCKED');
  eq(blocked.executedAttempts, 0, 'no execution — the gate refused the plan before the substrate was touched');
  eq(blocked.session.state, 'IDLE', 'the no-cycle rule: nothing was attempted, the machine never engages');
  eq(g.historyManager.size(), sizeAfterError, 'zero substrate work');
  eq(g.storeSnapshot(), snapAfterError, 'the pinned state is exactly as the error left it — the constraint holds');
  // (b) PRESERVED face: the same required constraint over a NON-target object
  // is orthogonal to the correction; the plan executes and the pinned object
  // is numerically untouched.
  const g2=await gGolden(); const critic2=g2.gCritic();
  g2.introduceError(12);
  const pinnedBefore=JSON.stringify(g2.geomParamsOf(g2.objectIds[1]));
  const ok=CorrectionEngine.run(CorrectionEngine.start(g2.gRequest({
    critic:critic2, targets:[g2.gPositionTarget(80, 92)],
    planningContext:{ constraints:[ gConstraint({ id:'con-b-top', type:'alignTop', objectIds:[g2.objectIds[1]], strength:'required', enabled:true }) ] } })));
  eq(ok.terminationReason, 'VERIFIED', 'the orthogonal hard constraint does not block the correction');
  eq(JSON.stringify(g2.geomParamsOf(g2.objectIds[1])), pinnedBefore, 'the pinned object is numerically untouched by the correction');
  eq(g2.geomParamsOf(g2.objectIds[2]).y, 80, 'the correction still landed');
});

test('F-10 (§60-P5): The loop must ALWAYS terminate — a deterministic live-substrate grid ends, within budget, with a §50 reason and a valid session (cite: E-18, the 48-seed property battery)', async ()=>{
  // targetValues: 80 verifies in one attempt; 104 regresses (rollback arc);
  // 92 is agenda-satisfied from the start (the ruling-35 agenda scope over a
  // document that still carries a live deviation); 60 overshoots into the
  // zero-delta no-progress arc.
  for (const tv of [80, 104, 92, 60]){
    const g=await gGolden(); const critic=g.gCritic();
    g.introduceError(12);
    const req=g.gRequest({ critic, targets:[g.gPositionTarget(tv, 92)], policyOverrides:{ maxIterations:4 } });
    const done=CorrectionEngine.run(CorrectionEngine.start(req));
    eq(done.status, 'TERMINATED', 'grid tv='+tv+': terminated');
    expect(CORRECTION_TERMINATION_REASONS.includes(done.terminationReason), 'grid tv='+tv+': a §50 reason — '+done.terminationReason);
    expect(done.executedAttempts <= 4, 'grid tv='+tv+': within the hard budget');
    eq(done.executedAttempts, done.session.iteration, 'grid tv='+tv+': the budget ledger is consistent');
    eq(validateCorrectionLoopSession(done.session).valid, true, 'grid tv='+tv+': the session re-validates as §4');
    const rollbacks=done.session.corrections.filter(a=>a.status==='ROLLED_BACK').length;
    eq(done.request.critic.calls.length, 1 + done.executedAttempts + rollbacks, 'grid tv='+tv+': §22 call accounting — one evaluation per attempt plus one CONFIRMATION per rollback (disclosure 36)');
  }
});

test('F-11 (§60-P6): HistoryManager must remain linear — the invariant-13 property swept across the F scenarios (+ D-18 cite)', async ()=>{
  for (const scenario of ['verified', 'regression']){
    const g=await gGolden(); const critic=g.gCritic();
    g.introduceError(12);
    const done=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({ critic,
      targets:[g.gPositionTarget(scenario==='verified' ? 80 : 104, 92)] })));
    const h=g.historyManager;
    const all=h.getAll();
    expect(Array.isArray(all), scenario+': flat array');
    const ids=all.map(t=>t.id);
    expect(new Set(ids).size===ids.length, scenario+': unique ids');
    expect(all.every(t=>t.status==='committed'), scenario+': committed only');
    expect(h.getCurrentIndex() >= -1 && h.getCurrentIndex() <= all.length - 1, scenario+': the pointer is in range');
    expect(h.canUndo() === (h.getCurrentIndex() >= 0), scenario+': canUndo mirrors the pointer');
    // the truncation-on-push property: move the pointer back, execute a real
    // transaction (the executor pushes), and the tail must truncate exactly to
    // the pointer (linear, never branched).
    const before=h.size();
    h.moveBack();
    const idx=h.getCurrentIndex();
    const probeTx=new TransactionBuilder().begin({ source:'fixture', description:'linearity probe' })
      .addCommand(transactionNS.createMoveObjectCommand({ objectId:g.objectIds[0], dx:1, dy:0 })).build();
    g.transactionManager.execute(probeTx);
    eq(h.getCurrentIndex(), h.size() - 1, scenario+': the pointer rides the new top after the truncating push');
    expect(h.size() <= before, scenario+': the stack never grew past the pre-probe size when a redo tail existed');
    expect(h.getAll().map(t=>t.id).includes(probeTx.id), scenario+': the probe transaction is the new top');
  }
});

test('F-12 (§60-P7): CorrectionLoopSession may retain iteration metadata WITHOUT modifying canonical HistoryManager topology (+ D-18 cite)', async ()=>{
  const g=await gGolden(); const critic=g.gCritic();
  g.introduceError(12);
  // the topology projection: the history's OWN structural fields only
  const topology=()=>JSON.stringify(g.historyManager.getAll().map(t=>({ id:t.id, parentId:t.parentId||null, status:t.status, source:t.metadata && t.metadata.source })));
  const done=CorrectionEngine.run(CorrectionEngine.start(g.gRequest({ critic, targets:[g.gPositionTarget(80, 92)] })));
  expect(done.session.corrections.length >= 1, 'the session retains its §6 iteration trail');
  expect(done.session.iteration >= 1, 'the session retains the iteration counter');
  // the host builds the §47 metadata for each attempt — session-local records
  for (const a of done.session.corrections){
    const meta=buildCorrectionHistoryMetadata(done.session, a);
    deepEq(Object.keys(meta), ['source','sessionId','attemptId','transactionId','iteration','attemptStatus'], 'the exact §47 metadata shape');
    eq(meta.source, 'correction', 'the §47 source marker');
    eq(meta.sessionId, done.session.id, 'the session binding');
    eq(meta.attemptId, a.id, 'the attempt binding');
    eq(meta.transactionId, a.transactionId, 'the transaction binding');
    eq(meta.attemptStatus, a.status, 'the final stage status');
  }
  // the canonical history topology: unchanged by the session's metadata
  // (exactly one new attempt transaction; no §47 metadata shape on any tx)
  const all=g.historyManager.getAll();
  for (const t of all){
    expect(!('sessionId' in t) && !('attemptId' in t) && !('attemptStatus' in t) && !('iteration' in t)
      && !(t.metadata && ('sessionId' in t.metadata || 'attemptId' in t.metadata || 'attemptStatus' in t.metadata || 'iteration' in t.metadata)),
      'no canonical transaction carries §47 session metadata: '+t.id);
  }
  for (const a of done.session.corrections){
    expect(all.some(t=>t.id===a.transactionId), 'the attempt transaction is in history (its own execution record, not §47 metadata)');
  }
  expect(topology().includes('"source":"correction"'), 'the attempt tx carries its own builder source (execution provenance, disclosure 25)');
});

// ---- §61 Golden Scenario ----------------------------------------------------

test('F-13 (§61): GOLDEN SCENARIO — 3 rectangles -> planner arrangement -> alignment error -> critic detects -> engine diagnoses -> align executes -> critic re-evaluates -> deviation decreases -> verification passes', async ()=>{
  // Steps 1–2 ran inside the fixture; their evidence is asserted here.
  const g=await gGolden();
  eq(g.rects.length, 3, 'step 1: three rectangles created through the real pipeline');
  for (let i=0;i<g.rects.length;i++){
    const r=g.rects[i];
    eq(r.expectedState.status, 'requested', 'step 1: the planner ExpectedState is a requested-state record');
    eq(g.geomParamsOf(r.objectId).x, [40,180,320][i], 'step 1: the planner placement landed (x)');
    eq(r.bbox.minY, G_ROW_Y, 'step 1: the planner-placed row (minY)');
  }
  eq(g.alignmentPlan.steps[0].input.axis, 'vertical', 'step 2: the planner arrangement statement (axis)');
  eq(g.alignmentPlan.steps[0].input.mode, 'top', 'step 2: the planner arrangement statement (mode)');
  eq(g.rects.every(r=>r.bbox.minY===g.rects[0].bbox.minY), true, 'step 2: the planner initial arrangement IS an aligned row');
  // Step 3: introduce the alignment error (a committed substrate transaction).
  const err=g.introduceError(12);
  eq(err.after, err.before + 1, 'step 3: the error is one committed transaction');
  eq(g.geomParamsOf(g.objectIds[2]).y, G_ROW_Y + 12, 'step 3: the third rect is displaced by 12');
  // Steps 4–9: the loop over the live authority.
  const critic=g.gCritic();
  const req=g.gRequest({ critic, targets:[g.gPositionTarget(80, 92)] });
  const started=CorrectionEngine.start(req);
  const initial=started.session.initialEvaluation;
  eq(initial.status, 'DEVIATION', 'step 4: the critic detected the alignment deviation');
  const ydev=initial.deviations.find(d=>d.property==='position.y');
  expect(ydev, 'step 4: the deviation is bridged to the house position metric (F-43)');
  eq(ydev.delta, 12, 'step 4: the alignment deviation is exactly the introduced 12px');
  eq(ydev.objectId, g.objectIds[2], 'step 4: on the displaced rect');
  expect(initial.deviations.some(d=>d.property==='bbox.maxY'), 'step 4: the unbridged live edge stays honestly visible');
  const done=CorrectionEngine.run(started);
  // step 5: the engine diagnosed and planned (ledger evidence)
  const entry=done.iterationLedger[0];
  eq(entry.plan.diagnosis.rootCause, 'POSITION_ERROR', 'step 5: the diagnosis');
  eq(entry.plan.commands[0].toolId, 'T05', 'step 5: the capability-grounded command');
  deepEq(entry.plan.commands[0].input.delta, { x:0, y:-12 }, 'step 5: the derived aligning delta');
  // step 5 counterfactual (F disclosure F-44): with the host's ALIGNMENT
  // bridge (the same live deviation bridged to the house alignment metric),
  // the engine resolves align-to-axis (T08) — and the plan REFUSES
  // INSUFFICIENT_EVIDENCE: T08 is rule-less (no axis/mode derivation,
  // disclosure 19), so the engine-driven T08 route is the DISCLOSED
  // capability-table boundary — surfaced deterministically, never patched.
  const g3=await gGolden();
  const critic3=g3.gCritic(d => d.property==='bbox.minY' ? { ...d, property:'alignment.deviation.px' } : d);
  g3.introduceError(12);
  const alignAgenda=CorrectionEngine.run(CorrectionEngine.start(g3.gRequest({ critic:critic3,
    targets:[bTarget({ category:'ALIGNMENT', objectIds:[g3.objectIds[2]], metric:'alignment.deviation.px',
      observedValue:12, targetValue:0, severity:'HIGH', confidence:0.9,
      evidence:[{ type:'METRIC', source:'evaluation', objectIds:[g3.objectIds[2]], value:12 }] })] })));
  eq(alignAgenda.status, 'TERMINATED', 'step 5c: the T08-boundary agenda terminates deterministically');
  eq(alignAgenda.terminationReason, 'UNFIXABLE', 'step 5c: the honest §28 refusal');
  deepEq(alignAgenda.refusalLedger.map(r=>r.reason), ['INSUFFICIENT_EVIDENCE'], 'step 5c: the rule-less tool plans from schema-complete carried inputs only');
  eq(alignAgenda.executedAttempts, 0, 'step 5c: nothing executed, nothing fabricated');
  // step 6: the aligning command executed on the live substrate
  eq(done.executedAttempts, 1, 'step 6: exactly one executed correction');
  eq(g.geomParamsOf(g.objectIds[2]).y, G_ROW_Y, 'step 6: the LIVE T05 translate re-aligned the row');
  eq(done.session.corrections[0].status, 'IMPROVED', 'step 6: the attempt was accepted');
  const all=g.historyManager.getAll().map(t=>t.id);
  expect(all.includes(done.session.corrections[0].transactionId), 'step 6: the attempt transaction sits in the linear history');
  // step 7: the critic re-evaluated — clean
  eq(critic.calls.length, 2, 'step 7: initial + one re-evaluation, all through the critic');
  const after=done.session.currentEvaluation;
  eq(after.status, 'PASS', 'step 7: the re-evaluation is clean');
  eq(after.deviations.length, 0, 'step 7: zero deviations');
  // step 8: the alignment deviation DECREASED (measured)
  eq(initial.deviations.length, 2, 'step 8: two live deviations before');
  eq(after.deviations.length, 0, 'step 8: zero after — 12 -> 0, strictly toward the target');
  eq(done.noProgressStreak, 0, 'step 8: the attempt made progress');
  // step 9: verification passes
  eq(done.status, 'TERMINATED', 'step 9: terminated');
  eq(done.terminationReason, 'VERIFIED', 'step 9: §17 VERIFIED');
  deepEq(done.session.visitedStates, ['IDLE','PLANNING','EXECUTING','EVALUATING','VERIFIED','TERMINATED'], 'step 9: the §3 choreography');
  eq(done.bestEvaluation, after, 'step 9: §16 best = the verified state');
  eq(done.convergence.kind, 'VERIFIED', 'step 9: the convergence verdict');
});

// ============================================================================
// PHASE 3.15 — CHECKPOINT G: ARCHITECTURE TESTS (spec §52/§66)
// ============================================================================
// Static architecture scans of src-js/correction.js — the FIRST counted source
// scans this module has ever had (the A-era zero-import/zero-entropy pins were
// probe/evidence-enforced; the G suite makes them counted regression guards).
// Precedents: tests/ai.test.mjs Checkpoint G (3.13, spec §26/§41-G),
// tests/evaluation-critic.test.mjs Checkpoint G (3.14, spec §52/§60), and the
// pre-embedding validation probe scripts/probe-3.15-checkpointG-scan.mjs
// (evidence scripts/phase3.15-evidence/3.15-G-probe.txt: zero false positives
// on the clean module, all positive controls fire, sanctioned forms clean,
// buffer==utf8 src/core manifest agreement).
//
// WHY A COMMENT/STRING-STRIPPING CODE-BODY SCAN (honesty note): correction.js
// legitimately CONTAINS forbidden words in prose — the module header says the
// code "executes transactions or touches stores" never (Checkpoint A scope),
// says the module "stays zero-import (pinned contract)", and error strings
// name request.document. A raw word scan would false-positive on all of them;
// §52/§66 forbid REACHING these surfaces from CODE, not naming them in
// documentation. The stripper (verbatim 3.13/3.14 copy) removes // and /* */
// comments and the TEXT of '…' / "…" / `…` literals while preserving ${…}
// interpolation code, keeping character and line counts 1:1 with the source.
// G-12 proves it cannot over-strip (code tokens survive) or under-strip (the
// documented comment/string occurrences vanish).
//
// EXECUTION-MODULE CALIBRATION (disclosure G-46 — the difference from 3.14-G):
// evaluation.js/critic.js are READ-ONLY modules, so 3.14-G could blanket-ban
// the whole mutation/tool surface. correction.js is the §11/§12 EXECUTION
// engine: the APPROVED substrate contract (disclosures 24–32, ratified through
// the F acceptance) sanctions a precise surface — tool.validate/tool.execute
// INSIDE the wrapper Command body (the Command -> Transaction -> WorkingCopy
// -> Validate -> Diff -> Commit pipeline, disclosure 26),
// transactionManager.execute/undo, TransactionBuilder.begin({id})/
// addCommand/build (via the local builder alias), registry.has/get/validate
// (read + schema gate), the WorkingCopy view mirror (wc.*), and the C-era
// read-only scan context (ctx.scene/constraints/semantic). The scans
// therefore pin RECEIVERS (allowlists probe-observed, here asserted) instead
// of blanket-banning forms: any tool execution outside the command body, any
// registry.execute, any second begin-receiver, any store/scene-mutation/
// history-write/renderer reach fails. Bare forms with NO sanctioned receiver
// (.write/.insert/.remove/.update/.commit/.rollback/.register/.unregister/
// .render/.invalidate) are banned outright. Bare .set(/.delete( are pinned to
// the three LOCAL Map bookkeeping bindings (seen/beforeByIdentity/
// afterByIdentity — the disclosed .push own-collection precedent class), so
// any NEW .set( receiver fails the scan.
//
// THE request.document CARVE-OUT (disclosure G-47): §25's
// CorrectionLoopRequest legitimately carries `document` as a plain-data FIELD
// (approved disclosure 33) — `request.critic.evaluate(request.document, …)`
// is the §23 consumer pass-through, not a DOM reach. The scan forbids
// `document` in GLOBAL-REACH FORM (bare identifier use) and carves out the
// property access .document; the sanctioned form is embedded as a counted
// negative control in G-2, and the alias-form control proves the carve-out
// does not blind the scan to `const d = document;`.
//
// §66 3.15-SPECIFIC OPERATIONALIZATION (disclosure G-48):
//   - no autonomous loop: setInterval/setTimeout/setImmediate/queueMicrotask/
//     addEventListener/requestAnimationFrame/import(/new Promise banned (the
//     loop is a synchronous pure-function chain driven by explicit engine ops);
//   - termination bounded by MAX_ITERATIONS: static face — exactly ONE while
//     loop (the engineRun AUTO loop), its region references policy.maxIterations
//     and the guard, the §17/§18 termination-invariant throw present in the
//     source, SINGLE_STEP's stepBudget check present, no while(true)/for(;;)/
//     do{ forms; dynamic face — cited (E-18 48-seed battery, F-10 grid);
//   - no direct HistoryManager manipulation beyond the substrate API: the
//     historyManager receiver is pinned to the single sanctioned READ
//     (getTransactionToUndo — the §32 top-of-history guard); the
//     HistoryManager type never appears in code (injected, never constructed);
//     dynamic invariant cited (D-18; F-5/F-11 truncation signature);
//   - no transaction-nesting API, no History DAG: every .begin( receiver is
//     the injected transactionBuilder; per-attempt transactions are SIBLINGS
//     joined by the disclosed parentId lineage (D-era disclosure 25), never
//     nested; nest/nesting/DAG vocabulary absent from code position.
//
// SRC/CORE FREEZE (G-11): the 178-file recursive hash manifest (aggregate
// sha256 137327739471ff095325854c296a82aa84afde0258b396ad6902b22de3e21e56 —
// byte-identical to the 3.14-G generation snapshot; buffer-hash == utf8-string
// hash agreement re-verified at probe time). The frozen files are NEVER
// modified for stub-kill purposes; aggregation sensitivity is proven in-test
// on synthetic trees (the 3.14-G-9 precedent).
//
// STUB-KILL surface: src-js/correction.js (every scan family killed via an
// appended never-invoked violation function, restored via sha256) and
// package.json (G-10, file-level run — the 3.14 KILL-4 precedent, with the
// cross-file documented-not-run note). src/core is not killed (frozen).
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

let g15HarnessMemo = null;
function g15Harness(){
  if (g15HarnessMemo === null){
    // Verbatim copy of the 3.13/3.14 Checkpoint G stripper (tests/ai.test.mjs:1351):
    // comments and string/template TEXT are replaced by same-length whitespace
    // placeholders; interpolation code (${…}), the code body, and all newlines
    // survive 1:1. Validated pre-embedding by scripts/probe-3.15-checkpointG-scan.mjs.
    function stripCommentsAndStrings(src){
      let out = '';
      let mode = 'code'; // code | line | block | squote | dquote | template
      const frames = []; // template-literal interpolation stack: {braceDepth}
      const n = src.length;
      let i = 0;
      while (i < n){
        const c = src[i];
        const d = i + 1 < n ? src[i + 1] : '';
        if (mode === 'code'){
          if (c === '/' && d === '/'){ mode = 'line'; out += '  '; i += 2; continue; }
          if (c === '/' && d === '*'){ mode = 'block'; out += '  '; i += 2; continue; }
          if (c === "'"){ mode = 'squote'; out += ' '; i += 1; continue; }
          if (c === '"'){ mode = 'dquote'; out += ' '; i += 1; continue; }
          if (c === '`'){ mode = 'template'; out += ' '; i += 1; continue; }
          if (frames.length > 0){
            if (c === '{'){ frames[frames.length - 1].braceDepth += 1; }
            else if (c === '}'){
              const f = frames[frames.length - 1];
              if (f.braceDepth === 0){ frames.pop(); mode = 'template'; out += ' '; i += 1; continue; }
              f.braceDepth -= 1;
            }
          }
          out += c; i += 1; continue;
        }
        if (mode === 'line'){
          if (c === '\n'){ mode = 'code'; out += '\n'; } else { out += ' '; }
          i += 1; continue;
        }
        if (mode === 'block'){
          if (c === '*' && d === '/'){ mode = 'code'; out += '  '; i += 2; }
          else { out += (c === '\n' ? '\n' : ' '); i += 1; }
          continue;
        }
        // string modes: squote / dquote / template-literal text
        if (c === '\\'){ out += '  '; i += 2; continue; }
        if (mode === 'squote' && c === "'"){ mode = 'code'; out += ' '; i += 1; continue; }
        if (mode === 'dquote' && c === '"'){ mode = 'code'; out += ' '; i += 1; continue; }
        if (mode === 'template'){
          if (c === '`'){ mode = 'code'; out += ' '; i += 1; continue; }
          if (c === '$' && d === '{'){ frames.push({ braceDepth: 0 }); mode = 'code'; out += '  '; i += 2; continue; }
          out += (c === '\n' ? '\n' : ' '); i += 1; continue;
        }
        // squote / dquote regular content char: placeholder + advance.
        out += (c === '\n' ? '\n' : ' '); i += 1;
      }
      return out;
    }
    // Import DECLARATIONS only (^\\s*import\\b on raw lines — a comment line
    // starts with '//', never a declaration); the from-clause must share the
    // line (true for every src-js module — single-line house style).
    function importDeclarations(src){
      const specs = [];
      for (const line of src.split('\n').filter(l => /^\s*import\b/.test(l))){
        const m = line.match(/from\s*['"]([^'"]+)['"]/) || line.match(/import\s+['"]([^'"]+)['"]/);
        if (m) specs.push(m[1]);
      }
      return specs;
    }
    const corrSrc = readFileSync(new URL('../src-js/correction.js', import.meta.url), 'utf-8');
    const H = {
      corrSrc,
      corrStripped: stripCommentsAndStrings(corrSrc),
      strip: stripCommentsAndStrings,
      // capability vocabulary (bare word-boundary form = alias-aware); `document`
      // is scanned separately in global-reach form (disclosure G-47)
      CAP_WORDS: ['window','fetch','eval','Function','globalThis','process','fs','localStorage','require'],
      // receiver-less mutation-method surface (§52/§66 minus the receiver-pinned
      // forms: .set/.delete are pinned to the local Map bindings in G-3;
      // .execute/.commit on sanctioned receivers in G-6)
      MUT_BARE: /\.(write|insert|remove|update|commit|rollback|register|unregister|render|invalidate)\s*\(/g,
      // autonomous/deferred execution forms (§66)
      ASYNC_RES: [[/\bsetInterval\s*\(/g,'setInterval('], [/\bsetTimeout\s*\(/g,'setTimeout('], [/\bsetImmediate\s*\(/g,'setImmediate('], [/\bqueueMicrotask\s*\(/g,'queueMicrotask('], [/\baddEventListener\s*\(/g,'addEventListener('], [/\brequestAnimationFrame\s*\(/g,'requestAnimationFrame('], [/\bimport\s*\(/g,'import('], [/\bnew\s+Promise\b/g,'new Promise']],
      // unbounded loop forms (§66)
      UNB_RES: [[/\bwhile\s*\(\s*true\b/g,'while(true)'], [/\bfor\s*\(\s*;\s*;\s*\)/g,'for(;;)'], [/\bdo\s*\{/g,'do{']],
      // the WorkingCopy view mirror surface (probe-observed, D-era disclosure 25)
      WC_VIEW: ['deleteAppearance','deleteGeometry','deleteNode','deleteObject','getAppearance','getGeometry','getNode','getNodes','getObject','hasObject','loadNode','nodes','setAppearance','setGeometry','setNode','setObject'],
      wordHits(text, w){ return text.match(new RegExp('\\b' + w + '\\b', 'g')) || []; },
      callHits(text, re){ return text.match(new RegExp(re.source, 'g')) || []; },
      allowProps(text, word){ const out = new Set(); const re = new RegExp('\\b' + word + '\\s*\\.\\s*(\\w+)', 'g'); let m; while ((m = re.exec(text)) !== null) out.add(m[1]); return [...out].sort(); },
      callReceivers(text, re){ const out = new Set(); const r = new RegExp(re.source, 'g'); let m; while ((m = r.exec(text)) !== null) out.add(m[1]); return [...out].sort(); },
      importDeclarations,
      engineRunRegion(){ const i = H.corrStripped.indexOf('function engineRun'); const j = H.corrStripped.indexOf('\nfunction ', i + 1); return H.corrStripped.slice(i, j < 0 ? undefined : j); },
      pkg: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')),
      srcJsFiles(){ return readdirSync(new URL('../src-js/', import.meta.url)).filter(f => f.endsWith('.js')); },
      readSrcJs(f){ return readFileSync(new URL('../src-js/' + f, import.meta.url), 'utf-8'); },
      // path-sorted "relpath:sha256(content)" manifest -> aggregate sha256
      aggregateManifest(entries){
        const sha = (s) => createHash('sha256').update(s).digest('hex');
        const sorted = [...entries].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        return sha(sorted.map(([p, c]) => p + ':' + sha(c)).join('\n'));
      },
      coreManifest(){
        const rootUrl = new URL('../src/core/', import.meta.url);
        const entries = [];
        (function walk(dirUrl, prefix){
          for (const e of readdirSync(dirUrl, { withFileTypes: true })){
            const rel = prefix ? prefix + '/' + e.name : e.name;
            if (e.isDirectory()) walk(new URL(e.name + '/', dirUrl), rel);
            else entries.push(['src/core/' + rel, readFileSync(new URL(e.name, dirUrl), 'utf-8')]);
          }
        })(rootUrl, '');
        return { count: entries.length, aggregate: H.aggregateManifest(entries), topEntries: readdirSync(rootUrl).sort() };
      }
    };
    g15HarnessMemo = H;
  }
  return g15HarnessMemo;
}

console.log('\n=== PHASE 3.15 Checkpoint G: Architecture Tests (spec §52/§66) ===');

test('G-1: correction.js forbidden-import surface — the import contract is EXACTLY ZERO imports (the A-era pin), no dynamic module-escape call (require( / import() exists in the code body, and no node: builtin or bare npm specifier can therefore exist (§52/§66)', ()=>{
  const H=g15Harness();
  eq(H.importDeclarations(H.corrSrc).length, 0, 'the zero-import pin (module header; Checkpoint A): correction.js declares NO imports — an added specifier (fs, node:*, npm, or even a substrate module) breaks the pin');
  const dyn=[...H.callHits(H.corrStripped, /\brequire\s*\(/g), ...H.callHits(H.corrStripped, /\bimport\s*\(/g)];
  eq(dyn.join(','), '', `no dynamic module-escape call in the code body (require( / import( — got ${JSON.stringify(dyn)})`);
});

test('G-2: correction.js code body reaches no browser/DOM global, no network, no dynamic-code or Node escape hatch — window, fetch, eval, Function, require, globalThis, process, fs, localStorage scanned ALIAS-FORM-AWARE on the stripped body; document scanned in GLOBAL-REACH form with the sanctioned §25 request.document property access carved out (disclosure G-47) (§52/§66)', ()=>{
  const H=g15Harness();
  for(const w of H.CAP_WORDS){
    eq(H.wordHits(H.corrStripped, w).join(','), '', `correction.js code body must not reference ${w} (§52/§66)`);
  }
  eq(H.wordHits(H.corrStripped.replace(/\.document\b/g,''), 'document').join(','), '', 'bare document (global reach) is FORBIDDEN — only the §25 request.document FIELD access is sanctioned');
  // sanctioned negative control (counted): the §23 consumer pass-through shape
  eq(H.wordHits('request.critic.evaluate(request.document, ctx)'.replace(/\.document\b/g,''), 'document').length, 0, 'sanctioned-form control: the request.document property access does not fire the scan');
  // alias-form controls + the paren-scan contrast (the 3.13 G KILL-2 discovery,
  // here made a permanent counted regression guard; the document alias proves
  // the G-47 carve-out does not blind the scan to bare global reach)
  const alias='const evalAlias = eval; const fnAlias = Function; const fetchAlias = fetch; const winAlias = window; const docAlias = document; void evalAlias; void fnAlias; void fetchAlias; void winAlias; void docAlias;';
  const contrasts=[['eval', /\beval\s*\(/], ['fetch', /\bfetch\s*\(/], ['Function', /\bnew\s+Function\b/], ['document', /\bdocument\s*\.\s*\w+\s*\(/]];
  for(const [w, parenRe] of contrasts){
    eq(H.wordHits(alias, w).length, 1, `alias-form control: the word-boundary scan must catch the bare capability reference 'const x = ${w};'`);
    expect(!parenRe.test(alias), `contrast: the paren-based form ${parenRe} cannot see the '${w}' alias — the G word scan can (3.13 G KILL-2 tradition)`);
  }
});

test('G-3: correction.js reaches NO store and NO renderer surface and carries no receiver-less mutation method — store/stores/Store/Stores absent (the substrate shape has no stores, disclosure 24), render/renderer/RenderTree/invalidate absent (the loop never renders), bare .write/.insert/.remove/.update/.commit/.rollback/.register/.unregister/.render/.invalidate call forms absent, and every bare .set(/.delete( receiver is a pinned local Map binding (§52/§66; disclosure G-46)', ()=>{
  const H=g15Harness();
  for(const w of ['store','stores','Store','Stores']){
    eq(H.wordHits(H.corrStripped, w).join(','), '', `correction.js must not reference the store surface (${w}) — no store object is reachable through the disclosed substrate shape`);
  }
  for(const w of ['render','renderer','Renderer','RenderTree','RenderTreeBuilder','invalidate']){
    eq(H.wordHits(H.corrStripped, w).join(','), '', `correction.js must not reference the renderer surface (${w}) — the correction loop never renders (§52/§66)`);
  }
  const mut=H.callHits(H.corrStripped, H.MUT_BARE);
  eq(mut.join(','), '', `receiver-less mutation-method calls are FORBIDDEN (§52/§66) — matched ${JSON.stringify(mut)}`);
  const coll=H.callReceivers(H.corrStripped, /\b(\w+)\s*\.\s*(?:set|delete)\s*\(/g);
  eq(JSON.stringify(coll), JSON.stringify(['afterByIdentity','beforeByIdentity','seen']), 'every bare .set(/.delete( receiver must be a pinned local Map binding (own-collection bookkeeping — the .push precedent class, disclosure G-46)');
});

test('G-4: correction.js scene-graph boundary — the injected scene graph is reachable ONLY through the read-only projection: every sceneGraph./scene. property access is findNodeByObjectId, the substrate shape carries exactly {registry, transactionManager, transactionBuilder, sceneGraph}, and the SceneGraph type is never referenced or constructed (§52/§66: no direct SceneGraph mutation)', ()=>{
  const H=g15Harness();
  eq(JSON.stringify(H.allowProps(H.corrStripped,'sceneGraph')), JSON.stringify(['findNodeByObjectId']), 'substrate.sceneGraph is pinned to the read-only findNodeByObjectId projection (§52/§66)');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'scene')), JSON.stringify(['findNodeByObjectId']), 'ctx.scene (the C-era dependency-scan context) is pinned to the same read-only projection');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'substrate')), JSON.stringify(['registry','sceneGraph','transactionBuilder','transactionManager']), 'the substrate duck-type shape is pinned to disclosure 24 exactly — no stores, no renderer, no history object on it');
  eq(H.wordHits(H.corrStripped, 'SceneGraph').join(','), '', 'the SceneGraph TYPE is never referenced in code — injected duck-typed, never imported or constructed');
});

test('G-5: correction.js HistoryManager boundary — the ONLY sanctioned history reach is the §32 top-of-history READ: every historyManager. property access is getTransactionToUndo, the HistoryManager type never appears in code, and no push/write/insert/reorder form exists anywhere (§66: no direct manipulation beyond the existing substrate API; the linear-history invariant is cited dynamically — D-18, F-5/F-11)', ()=>{
  const H=g15Harness();
  eq(JSON.stringify(H.allowProps(H.corrStripped,'historyManager')), JSON.stringify(['getTransactionToUndo']), 'historyManager is pinned to the single sanctioned READ (the §32 top-of-history guard) — push/write/insert/reorder are structurally impossible');
  eq(H.wordHits(H.corrStripped, 'HistoryManager').join(','), '', 'the HistoryManager TYPE is never referenced in code — the linear history belongs to the substrate, never to the loop');
});

test('G-6: correction.js mutates ONLY through the sanctioned transaction pipeline — transactionManager {execute,undo,historyManager}, transactionBuilder {begin,addCommand,build} + the builder alias {addCommand,build}, registry {get,has,validate} (read + schema gate), execute-receivers {tool,transactionManager}, begin-receivers {transactionBuilder}, the WorkingCopy view mirror wc.* pinned, ctx pinned to {constraints,scene,semantic,workingCopy}, and NO substrate machinery constructed (§52/§66; disclosure G-46)', ()=>{
  const H=g15Harness();
  eq(JSON.stringify(H.allowProps(H.corrStripped,'transactionManager')), JSON.stringify(['execute','historyManager','undo']), 'transactionManager surface = the §11 pipeline call + the §32 undo + the history read — nothing else');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'transactionBuilder')), JSON.stringify(['addCommand','begin','build']), 'transactionBuilder surface = begin/addCommand/build (the begin call + the duck-type guard reads)');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'builder')), JSON.stringify(['addCommand','build']), 'the local builder alias (the begin({id}) return) only adds commands and builds');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'registry')), JSON.stringify(['get','has','validate']), 'the registry surface is read + schema gate — registry.execute is structurally impossible');
  eq(JSON.stringify(H.callReceivers(H.corrStripped, /\b(\w+)\s*\.\s*execute\s*\(/g)), JSON.stringify(['tool','transactionManager']), 'execute( is reached ONLY as tool.execute INSIDE the wrapper Command body (disclosure 26) and transactionManager.execute (the pipeline)');
  eq(JSON.stringify(H.callReceivers(H.corrStripped, /\b(\w+)\s*\.\s*begin\s*\(/g)), JSON.stringify(['transactionBuilder']), 'every .begin( is the injected transactionBuilder — no second builder exists');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'tool')), JSON.stringify(['deterministic','execute','validate']), 'the tool surface = the deterministic-flag read + validate + execute inside the Command body');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'wc')), JSON.stringify(H.WC_VIEW), 'the WorkingCopy view mirror is pinned to the substrate\'s own tool-hosting API (the makeSubstrateWorkingCopy mirror, D-era disclosure 25)');
  eq(JSON.stringify(H.allowProps(H.corrStripped,'ctx')), JSON.stringify(['constraints','scene','semantic','workingCopy']), 'ctx = the C-era read-only scan context (scene/constraints/semantic) + the command-execution workingCopy');
  const news=H.callHits(H.corrStripped, /\bnew\s+(?:SceneGraph|HistoryManager|TransactionBuilder|TransactionExecutor|ToolRegistry|WorkingCopy)\b/g);
  eq(news.join(','), '', `substrate machinery is INJECTED, never constructed — matched ${JSON.stringify(news)}`);
});

test('G-7: correction.js runs NO autonomous or deferred execution — setInterval, setTimeout, setImmediate, queueMicrotask, addEventListener, requestAnimationFrame, dynamic import(, and new Promise are all absent from the code body; the loop is a synchronous pure-function chain driven by explicit engine operations (§66)', ()=>{
  const H=g15Harness();
  for(const [re, id] of H.ASYNC_RES){
    eq(H.callHits(H.corrStripped, re).join(','), '', `no autonomous/deferred execution form (${id}) — §66`);
  }
});

test('G-8: loop termination is bounded by MAX_ITERATIONS (§66/§17/§18) — static face: EXACTLY ONE while loop exists (the engineRun AUTO loop), its region references policy.maxIterations and the guard, the §17/§18 termination-invariant throw is present in the source, SINGLE_STEP carries its stepBudget check, and no unbounded form (while(true)/for(;;)/do{) exists; dynamic face cited (E-18 48-seed battery, F-10 termination grid)', ()=>{
  const H=g15Harness();
  eq(H.callHits(H.corrStripped, /\bwhile\s*\(/g).length, 1, 'exactly ONE while loop in the whole module — the engineRun AUTO loop');
  const region=H.engineRunRegion();
  expect(region.includes('policy.maxIterations'), 'the AUTO loop is bounded by policy.maxIterations (the §18 hard budget)');
  expect(region.includes('guard'), 'the loop carries the guard counter whose breach throws the termination-invariant error');
  expect(H.corrSrc.includes('exceeded the iteration bound'), 'the §17/§18 violation message is present — the guard BITES (dynamically proven by E-18/F-10)');
  expect(H.corrStripped.includes('CORRECTION_MODE_DISPATCH.SINGLE_STEP.stepBudget'), 'SINGLE_STEP is bounded by its one-attempt step budget (§26)');
  for(const [re, id] of H.UNB_RES){
    eq(H.callHits(H.corrStripped, re).join(','), '', `no unbounded loop form (${id}) — §66`);
  }
});

test('G-9: no transaction-nesting API and no History DAG (§66) — the nesting/DAG vocabulary is absent from the code body, every .begin( receiver is the injected transactionBuilder (per-attempt transactions are SIBLINGS joined by the disclosed parentId lineage, D-era disclosure 25 — never nested), and the linear-history invariant is cited dynamically (D-18; F-5/F-11: the undo-truncation signature proves linearity is honest)', ()=>{
  const H=g15Harness();
  const nest=H.callHits(H.corrStripped, /\b(?:nested|nesting|DAG|dag)\b/g);
  eq(nest.join(','), '', `no nesting/DAG vocabulary in code position (§66) — matched ${JSON.stringify(nest)}`);
  eq(JSON.stringify(H.callReceivers(H.corrStripped, /\b(\w+)\s*\.\s*begin\s*\(/g)), JSON.stringify(['transactionBuilder']), 'the only .begin( is the injected transactionBuilder — no nested-transaction builder exists');
});

test('G-10: zero npm dependencies — package.json declares no dependency fields and EVERY src-js runtime module imports only relative specifiers with no dynamic escape (§52/§66 project rule; the 3.13 G-5 / 3.14 G-8 whole-tree sweeps re-proven for the 3.15 module)', ()=>{
  const H=g15Harness();
  for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
    const v=H.pkg[field];
    expect(v===undefined || (typeof v==='object' && v!==null && Object.keys(v).length===0), `package.json .${field} must be absent/empty (zero npm dependencies, §52/§66) — got ${JSON.stringify(v)}`);
  }
  const files=H.srcJsFiles();
  for(const need of ['correction.js','ai.js','evaluation.js','critic.js','tools.js','dsl.js','transaction.js']){
    expect(files.includes(need), `anti-vacuity: src-js/${need} present in the sweep (${files.length} files scanned)`);
  }
  for(const f of files){
    const src=H.readSrcJs(f);
    for(const s of H.importDeclarations(src)){
      expect(s.startsWith('./')||s.startsWith('../'), `src-js/${f} imports '${s}' — a non-relative (npm package / node builtin) specifier would add a dependency`);
    }
    const dyn=[...H.callHits(H.strip(src), /\brequire\s*\(/g), ...H.callHits(H.strip(src), /\bimport\s*\(/g)];
    eq(dyn.join(','), '', `src-js/${f} carries a dynamic module-escape call in code position (require( / import( — got ${JSON.stringify(dyn)})`);
  }
});

test('G-11: src/core/ is FROZEN — the recursive 178-file hash manifest is byte-identical to the frozen generation snapshot (aggregate sha256, re-verified at probe time with buffer==utf8 agreement); the manifest aggregation is proven deterministic and change-sensitive on synthetic input, and the frozen files themselves are never touched (§52/§66)', ()=>{
  const H=g15Harness();
  const m=H.coreManifest();
  eq(m.count, 178, 'src/core file count matches the frozen snapshot');
  eq(m.aggregate, '137327739471ff095325854c296a82aa84afde0258b396ad6902b22de3e21e56', 'src/core aggregate manifest sha256 matches the frozen snapshot — any modification, addition, or deletion flips it');
  eq(JSON.stringify(m.topEntries), JSON.stringify(['README.md','appearance','constraints','dsl','errors','events','geometry','ids','interaction','math','renderer','scenegraph','semantic','stores','tools','transaction','validation']), 'the 17 top-level entries are unchanged');
  // sensitivity + order-stability controls (synthetic trees; the frozen tree is never modified)
  const t1=H.aggregateManifest([['a','x'],['b','y']]);
  const t2=H.aggregateManifest([['a','x'],['b','y']]);
  const t3=H.aggregateManifest([['a','x!'],['b','y']]);
  const t4=H.aggregateManifest([['b','y'],['a','x']]);
  eq(t1, t2, 'control: the manifest aggregation is deterministic');
  eq(t1, t4, 'control: the manifest aggregation is order-stable (path-sorted)');
  expect(t1!==t3, 'control: a one-byte content change flips the aggregate — the freeze check is sensitive');
});

test('G-12: scan-harness sanity (anti-vacuity) — the stripper demonstrably preserves code AND removes comment/string occurrences on correction.js with 1:1 char/line mapping, so G-2..G-10 cannot pass vacuously (§60; the 3.13 G-6 / 3.14 G-7 precedent)', ()=>{
  const H=g15Harness();
  // code survives stripping (an over-stripping scanner would make every pattern scan vacuously green)
  for(const t of ['executeCorrectionAttempt','acceptCorrectionAttempt','rollbackCorrectionAttempt','detectCorrectionRegression','detectCorrectionConvergence','CorrectionEngine','validateCorrectionLoopRequest','correctionCommandFor','executionPreflightRefusal','substrateWorkingCopyView','engineRun','CORRECTION_MODE_DISPATCH']){
    expect(H.corrStripped.includes(t), `correction.js stripped body must still contain '${t}'`);
  }
  // the documented comment/string occurrences are gone from the code body (REAL occurrences in the clean module)
  expect(H.corrSrc.includes('executes transactions or touches stores'), 'control is real: the phrase exists in RAW correction.js (header comment)');
  expect(!H.corrStripped.includes('executes transactions or touches stores'), 'header comment text must be stripped before scanning');
  expect(H.corrSrc.includes('the loop never self-evaluates'), 'control is real: the phrase exists in RAW correction.js (§23 error-string literal)');
  expect(!H.corrStripped.includes('the loop never self-evaluates'), 'string-literal text must be stripped before scanning');
  expect(H.wordHits(H.corrSrc, 'disclosure').length >= 5, 'control is real: RAW correction.js comments carry the disclosure vocabulary');
  eq(H.wordHits(H.corrStripped, 'disclosure').join(','), '', 'the stripped body contains NO disclosure word — the scans cannot false-positive on comments');
  // 1:1 char/line mapping (placeholder-preserving stripper — line accounting stays exact)
  eq(H.corrStripped.length, H.corrSrc.length, 'stripped output is char-count-identical to the source');
  eq(H.corrStripped.split('\n').length, H.corrSrc.split('\n').length, 'stripped output is line-count-identical to the source');
});

Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
