// ============================================================================
// src-js/semantic-correction.js — SEMANTIC CORRECTION DIAGNOSIS (PHASE 3.18)
// ============================================================================
// ZERO-IMPORT PIN (the semantic-inference.js header discipline, its BD-7):
// this module declares NO imports of any kind. The diagnosis selector is
// PURE: it reads no store of any kind, holds no substrate references,
// touches no globals, owns no session state, and never mutates its inputs.
// The caller (host) reads the object facts from the document BEFORE calling
// — this module only compares those facts against the frozen capability
// contract.
//
// SCOPE (PHASE 3.18 Checkpoint D — DIAGNOSIS ONLY): the C-approved data
// model (Checkpoint C report, scripts/phase3.18-evidence/3.18-C-DATA-MODEL.md,
// sections C1-C4 — the four typedefs below are copied VERBATIM from it), the
// frozen capability registry (C2: exactly ONE entry — shape <-> background
// via T06), and the static selector diagnoseSemanticDeviation. There is
// deliberately NO role-write surface here (the D-10 posture carries forward).
//// CHECKPOINT E ADDENDUM (approved Checkpoint E prompt): the proposal builder
// buildSemanticCorrectionProposal and the execution path
// executeSemanticCorrectionAttempt join HERE — still ZERO-IMPORT (the pin
// above stands: the substrate is INJECTED, duck-typed, and never imported;
// the T06 tool is reached exclusively through the injected registry). The
// execution path runs ONE attempt = ONE content-derived transaction through
// the substrate's own executor pipeline; stores are never touched directly.
//
// CHECKPOINT F ADDENDUM (approved Checkpoint F prompt): the verification path
// verifySemanticCorrectionAttempt and the semantic role provider
// createSemanticRoleProvider join HERE — still ZERO-IMPORT (the pin above
// stands: the T20 tool is reached exclusively through the injected registry,
// over the committed-state read surface the substrate carries). Verification
// is REAL post-commit re-inference (the B9 contract) with NO false
// verification (spec §40); the provider is the ONLY bridge to the evaluation
// arm's semantic side and is INJECTED into an evaluation context, never
// imported by it.
//
// CHECKPOINT G ADDENDUM (approved Checkpoint G prompt): the regression
// detector, the §32 rollback surface, the convergence detector, and the
// §50/§51 loop-bridge agenda join HERE — the module now carries the COMPLETE
// 3.18 semantic-correction surface. Spec §50/§51 compliance is structural:
// NO new loop states are added, NO engine file is touched, the state machine
// is the existing engine's and is only ever OBSERVED from outside (the agenda
// is a frozen data record the HOST feeds into the existing engine; a
// non-CORRECTABLE diagnosis yields null so the host falls through to the
// existing SEMANTIC_ERROR -> NO_CAPABILITY -> UNFIXABLE terminal). The
// recipe wiring into the engine remains Checkpoint H (host/engine territory,
// NOT this module).
//
// CHECKPOINT H ADDENDUM (approved Checkpoint H prompt — Final Green +
// Integration): the §50 recipe-wiring plan builder buildSemanticCorrectionPlan
// joins HERE as the TWELFTH export — still ZERO-IMPORT, and the engine is
// still untouched. The recipe for SEMANTIC_ERROR is wired by INJECTION (the
// host converts an actionable agenda into an executable proposal through this
// pure builder and then drives the existing surfaces with it), NOT by editing
// correction.js: the attribution table keeps mapping SEMANTIC ->
// SEMANTIC_ERROR (correction.js:1305-1317) and the capability table keeps its
// ZERO SEMANTIC_ERROR recipes (correction.js:1328-1347), so a host that never
// injects this layer keeps the honest NO_CAPABILITY terminal. The G addendum's
// "host territory" note is thereby resolved: the ONE wiring step that lives in
// this module is the pure agenda->proposal conversion — no loop state, no
// engine call, no engine file change (spec §50/§51).
//
// DESIGN DECISIONS (pinned here and in tests/semantic-correction.test.mjs):
//
//   SD-1  Zero imports: fnv1a32 and stableStringify are reimplemented
//         locally, VERBATIM per the Checkpoint D prompt's pinned house
//         reference (semantic-inference.js:171-188); the 'sct-' id derives
//         exactly like the house 'smr-' convention (:190-193) over the C1
//         input set {objectId, currentRole, targetRole, source} with
//         source = deviation.id (C6 worked example: dev-8305da82 ->
//         sct-86f52be0, computed by scripts/phase3.18-c-hashes.mjs and
//         pinned by test A-16).
//
//   SD-2  The registry is a module-level deepFreeze([...]) array with
//         EXACTLY ONE entry (C2): id 'cap-shape-background', sourceRoles
//         ['shape','background'], targetRoles ['background','shape'],
//         toolIds ['T06'], evidenceKeys ['size'], scope 'LOCAL', risk
//         'MEDIUM', reversible true, deterministic true, and preconditions
//         = the C8 encoding of the B-approved eligibility constraints:
//         {geometryTypes:['rect'], areaGrowThreshold:100000,
//         areaShrinkThreshold:5000, areaMargin:0.05,
//         maxChildCountForShrink:2, matrixForm:'UNIFORM_SCALE'}. Static
//         literals — nothing content-derived, nothing per-session (the
//         CORRECTION_CAPABILITY_RECIPES static-side pattern,
//         correction.js:1328-1347).
//
//   SD-3  Validation posture — exactly the two prompt refusal classes:
//         (i) INVALID_DEVIATION: not a plain object; any of the 11 §13 keys
//         missing as own-properties; category !== 'semantic'; property
//         !== 'role'; unusable id/objectId (both must be non-empty strings:
//         id is the targetId source input, objectId feeds
//         affectedObjectIds — the evaluation arm guarantees a real objectId
//         for semantic deviations, evaluation.js:1257); currentRole/
//         targetRole (deviation.actual/deviation.expected) outside the
//         7-role T20 emission vocabulary (such records cannot come from the
//         arm, which refuses out-of-vocabulary roles BEFORE creating a
//         deviation, evaluation.js:1288-1291 — the C1 guard posture).
//         (ii) INVALID_OBJECT_FACTS: not a plain object; any of the three
//         required keys missing; geometryType not a non-empty string;
//         childCount not a finite number; worldArea neither null nor a
//         finite number ("non-finite numbers where required"). Deeper
//         content checks (severity vocabulary, targetRef shape, message
//         text) remain the producer's contract — createDeviation already
//         validated them upstream; this layer validates exactly what it
//         consumes. A fractional/negative childCount is NOT refused here:
//         it flows into the deterministic (b) comparison below.
//
//   SD-4  Verdict order is the Checkpoint D algorithm, in order: derive
//         targetId -> positional (sourceRoles[i], targetRoles[i]) pair
//         search -> ROLE_PAIR_UNSUPPORTED when no capability matches ->
//         (a) rect-gate else GEOMETRY_TYPE_NOT_ELIGIBLE -> grow direction
//         (shape->background): worldArea finite AND positive else
//         STRICT_CROSSING_UNACHIEVABLE -> shrink direction
//         (background->shape): childCount <= maxChildCountForShrink else
//         CONTAINER_OVERRIDE_WOULD_INTERCEPT -> CORRECTABLE (reason null,
//         capabilityId set). The grow/shrink direction is pinned to the ONE
//         capability's two positional pairs: every pair this frozen
//         registry can match is one of the two, so the if/else below is
//         exhaustive over the matchable surface.
//
//   SD-5  UNSUPPORTED_TRANSITION vs NO_CAPABILITY (the B-approved
//         distinction, C3 table): the selector NEVER constructs a
//         NO_CAPABILITY verdict — that status belongs to the existing
//         correction-engine terminal record (correction.js:1397-1404, reason
//         ENGINE_RESOLUTION_NO_CAPABILITY) and is referenced, not redefined.
//         The static selector's refusals are always UNSUPPORTED_TRANSITION
//         with a machine reason. The third C3 status value therefore appears
//         in the typedef below as documentation only — no code path here
//         emits it.
//
//   SD-6  The output is the C3/C6 five-key frozen record {targetId, status,
//         capabilityId, reason, affectedObjectIds} — affectedObjectIds a
//         fresh frozen array (scope LOCAL: exactly the one object; T06
//         touches nothing else, tools.js:335-342). Same input ->
//         byte-identical record; no RNG, no wall clock anywhere (spec §19).
//
//   SD-7  Input immutability + check layering: inputs are never written and
//         never frozen by this module (the BD-6 caller-ownership
//         discipline). The worldArea finiteness/positivity check (grow
//         direction) is a DIAGNOSIS-time check per the Checkpoint D
//         algorithm; C8 places the margin arithmetic itself (the s = sqrt
//         matrix computation and its predictedWorldArea landing spot) at
//         PROPOSAL CONSTRUCTION — Checkpoint E carries it. The shrink
//         direction's area adequacy is likewise a proposal-construction
//         concern, not a diagnosis-time check.
// ============================================================================

/**
 * @typedef {Object} SemanticCorrectionTarget
 * @property {string} id
 *   Content-derived 'sct-<8-hex>' = 'sct-' + fnv1a32(stableStringify({
 *     objectId, currentRole, targetRole, source
 *   })). Deterministic and stable: the same deviation re-derived in a later
 *   iteration yields the SAME id (iteration is deliberately NOT an input —
 *   the attempt transaction, not the target, is the per-iteration record).
 * @property {string} objectId
 *   The corrected object's id, copied VERBATIM from the upstream record
 *   (deviation.objectId / expectation record objectId). Never re-derived,
 *   never remapped.
 * @property {string} currentRole
 *   The ACTUAL role at derivation time (the deviation's `actual` / the
 *   provider-observed role). MUST be in T20's 7-role emission vocabulary
 *   (semantic-inference.js:152-155; guard per normalizeProposal :229-231).
 * @property {string} targetRole
 *   The EXPECTED role (the deviation's `expected` / the agenda record's
 *   role). Same vocabulary + guard.
 * @property {number|null} confidence
 *   Verbatim-or-null copy of the upstream belief (the semanticResults entry
 *   confidence — evaluation.js:1287/:1289 — or the agenda record's
 *   confidence). NO fabrication: never synthesized, never clamped, never
 *   defaulted. null when upstream has none.
 * @property {ReadonlyArray<{signal: string, description: string, weight: number}>} evidence
 *   Frozen CLONE of the upstream evidence rows (cloneData pattern,
 *   semantic-inference.js:196-204/:236); defaults [] when upstream has none.
 *   Provenance only — never executed, never validated against stores.
 * @property {string} source
 *   Deterministic pointer to WHERE the target came from, in house id space:
 *   'dev-<8-hex>' when derived from a semantic deviation (engine path), or
 *   'smr-<8-hex>' when derived directly from an agenda expectation record
 *   (host path). Exactly one upstream record exists per target; `source`
 *   names it without holding a reference to it.
 */

/**
 * @typedef {Object} SemanticCorrectionCapability
 * @property {string} id
 *   Frozen static literal: 'cap-shape-background'. NOT content-derived — the
 *   capability is a MODULE-LEVEL CONSTANT description (like the recipe names
 *   'scale-to-target-size', correction.js:1331), identical for every session.
 * @property {ReadonlyArray<string>} sourceRoles
 *   Frozen ['shape', 'background'] — the emitted roles this capability can
 *   correct FROM (T20 vocabulary, semantic-inference.js:152-155).
 * @property {ReadonlyArray<string>} targetRoles
 *   Frozen ['background', 'shape'] — the roles it can correct TO, positionally
 *   paired with sourceRoles (shape->background, background->shape).
 * @property {ReadonlyArray<string>} toolIds
 *   Frozen ['T06'] — the ONLY registered mutation tool that can move the role
 *   (Checkpoint B §B5; transform_objects, tools.js:327-345).
 * @property {ReadonlyArray<string>} evidenceKeys
 *   Frozen ['size'] — the ONLY role-bearing AND mutation-reachable evidence
 *   key (Checkpoint B §B2; semantic.js:167-176).
 * @property {string} scope
 *   'LOCAL' — house scope vocabulary (CORRECTION_TOOL_SCOPE T06: 'LOCAL',
 *   correction.js:1356; weights :1362; ranks :1363). Single-object mutation;
 *   T06 is local-only (B5).
 * @property {string} risk
 *   'MEDIUM' — house risk vocabulary CORRECTION_STRATEGY_RISKS
 *   (correction.js:689: LOW|MEDIUM|HIGH). Matches the TWO existing T06
 *   recipes' risk ('scale-to-target-size' :1332, 'normalize-transform'
 *   :1334 — both risk:'MEDIUM', reversible:true): a T06 resize moves the
 *   object and resizes rx/ry as side effects; it is not a LOW-risk
 *   translation-style write.
 * @property {boolean} reversible
 *   true — snapshot inverse path (transaction.js:211-218, :288-349; B8
 *   reversibility proof).
 * @property {boolean} deterministic
 *   true — B3 determinism proof (pure threshold + pure tool + content ids).
 * @property {SemanticCapabilityPreconditions} preconditions
 *   Frozen sub-object carrying the B-approved eligibility constraints (the
 *   C8 encoding — the ONE design extension beyond the §16 list, disclosed
 *   in C9 #2):
 *   { geometryTypes: frozen ['rect'],            // (a) rect-gate
 *     areaGrowThreshold: 100000,                 // (c) strict >
 *     areaShrinkThreshold: 5000,                 // (c) strict <
 *     areaMargin: 0.05,                          // (c) margin policy (design constant)
 *     maxChildCountForShrink: 2,                 // (b) container-override precondition
 *     matrixForm: 'UNIFORM_SCALE' }              // (d) no shear
 */

/**
 * @typedef {Object} SemanticCorrectionDiagnosis
 * @property {string} targetId
 *   The 'sct-<8-hex>' SemanticCorrectionTarget id (C1). NOT the 'ctarget-'
 *   id of the §7 CorrectionTarget (correction.js:772) — different id space,
 *   different layer.
 * @property {'CORRECTABLE'|'UNSUPPORTED_TRANSITION'|'NO_CAPABILITY'} status
 *   The three-value verdict (see vocabulary below).
 * @property {string|null} capabilityId
 *   'cap-shape-background' IFF status === 'CORRECTABLE'; null otherwise.
 *   A non-null capabilityId on a non-CORRECTABLE diagnosis is a
 *   construction breach.
 * @property {string|null} reason
 *   Deterministic machine string (SCREAMING_SNAKE, the
 *   'EXPECTED_ROLE_UNSUPPORTED' style — evaluation.js:1289-1305); null when
 *   CORRECTABLE (the compared-pair reason:null convention, evaluation.js
 *   :1310/:1313).
 * @property {ReadonlyArray<string>} affectedObjectIds
 *   Frozen plain array of object ids whose derivation the correction touches.
 *   For the ONE capability: exactly [target.objectId] (scope LOCAL — the
 *   mutation is confined to the target object; T06 touches nothing else,
 *   tools.js:335-342).
 */

/**
 * @typedef {Object} SemanticCorrectionProposal
 * @property {string} id
 *   Content-derived 'scp-<8-hex>' = 'scp-' + fnv1a32(stableStringify({
 *     targetId, capabilityId, mutation, expectedSemanticEffect, confidence,
 *     provenance
 *   })). Iteration is NOT an input (same plan re-derived -> same id; the
 *   per-iteration identity is the atx- transaction, correction.js:2530).
 * @property {string} targetId
 *   The 'sct-' target this proposal corrects (C1).
 * @property {string} capabilityId
 *   The static capability that grounds the proposal — always
 *   'cap-shape-background' in 3.18. A proposal without a registry capability
 *   id is a construction breach.
 * @property {ReadonlyArray<string>} objectIds
 *   Frozen ['<objectId>'] — exactly the target's object (single-object,
 *   scope LOCAL). Every id MUST equal target's objectId; the proposal never
 *   widens the mutation surface (§40 scope containment discipline,
 *   correction.js:1996-1998/:1915-1941).
 * @property {SemanticCorrectionMutation} mutation
 *   Frozen single-command descriptor (see below). The uniform-scale T06 form
 *   is REQUIRED.
 * @property {SemanticExpectedEffect} expectedSemanticEffect
 *   Frozen { role: {from, toward}, predictedWorldArea: number } — the
 *   EXPECTED role transition. An expectation, NOT a guarantee, NOT a claim:
 *   verification is post-commit re-derivation only (B9, spec §40). The
 *   from/toward keys mirror the house expected-effect direction semantics
 *   (expectedEffectFor -> direction 'TOWARD_TARGET', correction.js:1374-1378)
 *   at role granularity.
 * @property {number|null} confidence
 *   Verbatim-or-null copy of the target's confidence (C1) — the upstream
 *   belief, never synthesized.
 * @property {SemanticCorrectionProvenance} provenance
 *   Frozen { source: 'semantic-correction'          // constant
 *            deviationId: 'dev-...'|null             // engine path origin
 *            expectationRecordId: 'smr-...'|null     // host path origin
 *            evidence: ReadonlyArray<...> }          // frozen clone of the
 *                                                    // target's evidence rows
 *   Exactly one of deviationId/expectationRecordId is non-null (the same
 *   invariant as target.source).
 */
// NOTE (Checkpoint D posture): the C4 nested descriptor typedef
// (SemanticCorrectionMutation) and the two inline C4 property shapes
// (SemanticExpectedEffect, SemanticCorrectionProvenance) were NOT repeated in
// the Checkpoint D module — the D prompt pinned exactly FOUR typedefs and
// constructed NO proposal. Per that pinned posture, the mutation descriptor
// joins THIS checkpoint (E), where the proposal builder makes it load-bearing
// (documentation copied VERBATIM from the approved C report §C4):

/**
 * @typedef {Object} SemanticCorrectionMutation
 * @property {'transform'} kind — prompt-pinned value ('transform'); kind is
 *   INERT at execution (correctionCommandFor binds by toolId, :2418, and
 *   carries kind verbatim :2421-2422). Vocabulary layering disclosed in C9 #1.
 * @property {'T06'} toolId — the ONE grounding tool (B5).
 * @property {{objectIds: ReadonlyArray<string>, transform: {a: number, b: 0, c: 0,
 *            d: number, tx: number, ty: number}}} input
 *   The T06 input contract (tools.js:328/:333): objectIds non-empty;
 *   transform with ALL SIX numeric keys, det = a*d - b*c, |det| >= 1e-12.
 *   The MATRIX FORM is constrained by the capability's matrixForm
 *   'UNIFORM_SCALE': b === 0, c === 0, a === d === s, with
 *   tx = cx*(1-s), ty = cy*(1-s) for the chosen fixed point (cx, cy) —
 *   NO shear (B5(d)). s is computed from the CURRENT world area A and the
 *   direction: s = sqrt((threshold*(1+margin))/A) to grow,
 *   s = sqrt((threshold*(1-margin))/A) to shrink (margin = preconditions.areaMargin).
 */

// ---- 0. Vocabulary ----------------------------------------------------------

const ERR_INVALID_DEVIATION = 'INVALID_DEVIATION';
const ERR_INVALID_OBJECT_FACTS = 'INVALID_OBJECT_FACTS';
// Checkpoint E refusal surface (the prompt's Part 1/Part 2 codes + the two
// C8-pinned machine reasons).
const ERR_INVALID_TARGET = 'INVALID_TARGET';
const ERR_INVALID_CAPABILITY = 'INVALID_CAPABILITY';
const ERR_INVALID_PROPOSAL = 'INVALID_PROPOSAL';
const ERR_INVALID_SUBSTRATE = 'INVALID_SUBSTRATE';
const ERR_PREDICTED_AREA_INSIDE_THRESHOLD = 'PREDICTED_AREA_INSIDE_THRESHOLD';
const ERR_NON_UNIFORM_SCALE_REJECTED = 'NON_UNIFORM_SCALE_REJECTED';
const ERR_TOOLS_UNAVAILABLE = 'TOOLS_UNAVAILABLE';
const ERR_EXECUTION_ERROR = 'EXECUTION_ERROR';

const PROPOSAL_SOURCE = 'semantic-correction';
const ATTEMPT_SOURCE = 'correction';
const ATTEMPT_DESCRIPTION = 'semantic correction attempt';
const ATTEMPT_ITERATION = 1; // ONE attempt per proposal in this checkpoint (spec §31: ONE transaction per attempt)

const STATUS_CORRECTABLE = 'CORRECTABLE';
const STATUS_UNSUPPORTED_TRANSITION = 'UNSUPPORTED_TRANSITION';

const REASON_ROLE_PAIR_UNSUPPORTED = 'ROLE_PAIR_UNSUPPORTED';
const REASON_GEOMETRY_TYPE_NOT_ELIGIBLE = 'GEOMETRY_TYPE_NOT_ELIGIBLE';
const REASON_CONTAINER_OVERRIDE_WOULD_INTERCEPT = 'CONTAINER_OVERRIDE_WOULD_INTERCEPT';
const REASON_STRICT_CROSSING_UNACHIEVABLE = 'STRICT_CROSSING_UNACHIEVABLE';

/**
 * The T20 7-role emission vocabulary (semantic-inference.js:152-155, the
 * evaluation-side twin at evaluation.js:1252) — LOCAL and frozen, the house
 * localization pattern (no import from semantic-inference.js or
 * evaluation.js; the zero-import pin above).
 */
const DIAGNOSIS_ROLES = Object.freeze([
  'text', 'heading', 'background', 'shape', 'icon', 'container', 'unknown'
]);

/** The 11 §13 deviation keys (the createDeviation output shape, evaluation.js:459-479). */
const DEVIATION_KEYS = Object.freeze([
  'id', 'category', 'property', 'expected', 'actual', 'delta', 'tolerance',
  'severity', 'objectId', 'targetRef', 'message'
]);

// ---- 1. Local deterministic helpers (semantic-inference.js:159-193 VERBATIM) -

function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isNonEmptyString(v){ return typeof v === 'string' && v.length > 0; }

function deepFreeze(value){
  if (isPlainObject(value) || Array.isArray(value)){
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

/** Key-sorted canonical serialization (semantic-inference.js:171-178 verbatim). */
function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 32-bit FNV-1a over a canonical string, hex-padded (semantic-inference.js:181-188 verbatim). */
function fnv1a32(str, offsetBasis){
  let h = offsetBasis >>> 0;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** C1 identity: 'sct-' + 8 hex digits of FNV-1a over canonical content (the :190-193 shape). */
function deriveTargetId(content){
  return 'sct-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

// ---- 2. Error surface (the house error-class pattern, evaluation.js:64-71) --

/**
 * The Checkpoint D refusal surface. Deterministic messages only — no caller
 * data beyond the offending field name/value rendering.
 */
export class SemanticCorrectionError extends Error {
  constructor(code, message, details){
    super(message);
    this.name = 'SemanticCorrectionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// ---- 3. The frozen capability registry (C2, SD-2) ---------------------------

/**
 * The static capability registry — EXACTLY ONE entry (Checkpoint A4 §11: the
 * ONE real/safe/reversible route; Checkpoint B §B10 matrix). Frozen AND
 * enumerable (array iteration/filter is the lookup; the house static-registry
 * pattern, correction.js:1328-1347). No map, no registry class, no mutation
 * path.
 */
export const SEMANTIC_CORRECTION_CAPABILITIES = deepFreeze([
  {
    id: 'cap-shape-background',
    sourceRoles: Object.freeze(['shape', 'background']),
    targetRoles: Object.freeze(['background', 'shape']),
    toolIds: Object.freeze(['T06']),
    evidenceKeys: Object.freeze(['size']),
    scope: 'LOCAL',
    risk: 'MEDIUM',
    reversible: true,
    deterministic: true,
    preconditions: deepFreeze({
      geometryTypes: Object.freeze(['rect']),   // (a) rect-gate
      areaGrowThreshold: 100000,                // (c) strict > (semantic.js:167)
      areaShrinkThreshold: 5000,                // (c) strict < (semantic.js:172)
      areaMargin: 0.05,                         // (c) margin policy (design constant, C9 #5)
      maxChildCountForShrink: 2,                // (b) container-override precondition
      matrixForm: 'UNIFORM_SCALE'               // (d) no shear
    })
  }
]);

// ---- 4. Validation (SD-3) ---------------------------------------------------

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function deviationError(d){
  if (!isPlainObject(d)){
    return 'diagnoseSemanticDeviation requires a plain-object §13 semantic deviation record';
  }
  for (const k of DEVIATION_KEYS){
    if (!Object.prototype.hasOwnProperty.call(d, k)){
      return `diagnosis requires the 11-key §13 deviation record; missing key '${k}' (deterministic construction, no hidden defaults)`;
    }
  }
  if (d.category !== 'semantic'){
    return `diagnosis requires a deviation with category 'semantic' (observed: ${JSON.stringify(d.category)})`;
  }
  if (d.property !== 'role'){
    return `diagnosis requires a deviation with property 'role' (observed: ${JSON.stringify(d.property)})`;
  }
  if (!isNonEmptyString(d.id)){
    return "deviation.id must be a non-empty string (the 'dev-' content id — the targetId source input, C1)";
  }
  if (!isNonEmptyString(d.objectId)){
    return 'deviation.objectId must be a non-empty string (the corrected object; the evaluation arm guarantees it for semantic deviations, evaluation.js:1257)';
  }
  if (!isNonEmptyString(d.actual) || !DIAGNOSIS_ROLES.includes(d.actual)){
    return `deviation.actual (currentRole) must be a T20-emitted role — one of ${DIAGNOSIS_ROLES.join('/')}`;
  }
  if (!isNonEmptyString(d.expected) || !DIAGNOSIS_ROLES.includes(d.expected)){
    return `deviation.expected (targetRole) must be a T20-emitted role — one of ${DIAGNOSIS_ROLES.join('/')}`;
  }
  return null;
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function objectFactsError(f){
  if (!isPlainObject(f)){
    return 'diagnoseSemanticDeviation requires a plain-object objectFacts record';
  }
  for (const k of ['geometryType', 'childCount', 'worldArea']){
    if (!Object.prototype.hasOwnProperty.call(f, k)){
      return `objectFacts requires '${k}' explicitly (deterministic construction, no hidden defaults)`;
    }
  }
  if (!isNonEmptyString(f.geometryType)){
    return 'objectFacts.geometryType must be a non-empty string';
  }
  if (!(typeof f.childCount === 'number' && Number.isFinite(f.childCount))){
    return 'objectFacts.childCount must be a finite number';
  }
  if (f.worldArea !== null && !(typeof f.worldArea === 'number' && Number.isFinite(f.worldArea))){
    return 'objectFacts.worldArea must be null or a finite number';
  }
  return null;
}

// ---- 5. The static selector (SD-4/SD-5/SD-6) --------------------------------

/**
 * Diagnose ONE §13 semantic role deviation against the frozen capability
 * registry and the caller-supplied object facts. PURE: reads nothing but its
 * two arguments; writes nothing; throws SemanticCorrectionError only on
 * malformed inputs (a well-formed deviation + facts ALWAYS get a frozen
 * verdict record).
 *
 * @param {Object} deviation An 11-key §13 semantic deviation record
 *   (createDeviation output shape, evaluation.js:459-479; the semantic arm's
 *   construction at :1314-1325) with category='semantic', property='role'.
 * @param {Object} objectFacts { geometryType: string, childCount: number,
 *   worldArea: number|null } — the FACTS the selector needs, read by the
 *   caller (host) from the document BEFORE this call.
 * @returns {SemanticCorrectionDiagnosis} The frozen five-key verdict record
 *   (C3/C6 #6 shape).
 */
export function diagnoseSemanticDeviation(deviation, objectFacts){
  const devMsg = deviationError(deviation);
  if (devMsg) throw new SemanticCorrectionError(ERR_INVALID_DEVIATION, devMsg);
  const factsMsg = objectFactsError(objectFacts);
  if (factsMsg) throw new SemanticCorrectionError(ERR_INVALID_OBJECT_FACTS, factsMsg);

  // C1: currentRole = the deviation's ACTUAL role; targetRole = the EXPECTED role.
  const currentRole = deviation.actual;
  const targetRole = deviation.expected;
  const objectId = deviation.objectId;
  // C1/C6 id derivation: {objectId, currentRole, targetRole, source},
  // source = the deviation's own 'dev-' id. Derived FIRST so every verdict
  // arm (including refusals) carries the same stable handle (prompt step 3).
  const targetId = deriveTargetId({ objectId, currentRole, targetRole, source: deviation.id });

  const finish = (status, capabilityId, reason) =>
    deepFreeze({ targetId, status, capabilityId, reason, affectedObjectIds: [objectId] });

  // Positional (sourceRoles[i], targetRoles[i]) pair match (C2 selector design).
  let matched = null;
  for (const cap of SEMANTIC_CORRECTION_CAPABILITIES){
    const i = cap.sourceRoles.indexOf(currentRole);
    if (i !== -1 && cap.targetRoles[i] === targetRole){ matched = cap; break; }
  }

  // No registry capability covers this transition (prompt step 3 / C6 #7).
  if (!matched){
    return finish(STATUS_UNSUPPORTED_TRANSITION, null, REASON_ROLE_PAIR_UNSUPPORTED);
  }

  // (a) rect-gate: the threshold derivation lives in the rect branch only
  // (semantic.js:156-194), so non-rect geometry is ineligible by construction.
  if (!matched.preconditions.geometryTypes.includes(objectFacts.geometryType)){
    return finish(STATUS_UNSUPPORTED_TRANSITION, null, REASON_GEOMETRY_TYPE_NOT_ELIGIBLE);
  }

  if (currentRole === 'shape' && targetRole === 'background'){
    // (c) grow direction: without a finite, positive current world area the
    // strict threshold crossing (areaMargin over areaGrowThreshold) is
    // unachievable for this instance.
    if (!(typeof objectFacts.worldArea === 'number' && Number.isFinite(objectFacts.worldArea) && objectFacts.worldArea > 0)){
      return finish(STATUS_UNSUPPORTED_TRANSITION, null, REASON_STRICT_CROSSING_UNACHIEVABLE);
    }
  } else {
    // (b) shrink direction (background->shape): the container override would
    // intercept any shrink past childCount 2 (semantic.js:218-224, C8 row (b)).
    if (!(objectFacts.childCount <= matched.preconditions.maxChildCountForShrink)){
      return finish(STATUS_UNSUPPORTED_TRANSITION, null, REASON_CONTAINER_OVERRIDE_WOULD_INTERCEPT);
    }
  }

  // All eligibility constraints hold: the capability authorizes a proposal.
  return finish(STATUS_CORRECTABLE, matched.id, null);
}

// ==== Checkpoint E — design decisions (pinned here and in the B/C/D tests) ===
//
//   SE-1  The builder is PURE: it imports nothing, reads no store, and never
//         mutates its inputs (the D posture stands). The host reads the
//         object's facts — including its current WORLD CENTER — from the
//         document BEFORE calling; objectFacts therefore gains ONE optional
//         key over the D shape: center: {x, y} (both finite numbers when
//         present; validated, then read — never aliased into the output).
//
//   SE-2  FIXED FALLBACK CENTER (documented per the prompt's step 4): when
//         objectFacts.center is absent, the builder scales about the WORLD
//         ORIGIN (cx = cy = 0, hence tx = ty = 0). Deterministic and
//         content-independent; predictedWorldArea does not depend on the
//         fixed point (uniform scale), so the eligibility arithmetic is
//         center-neutral. The host supplies the real center for
//         role-preserving geometry placement (the golden scenario uses
//         (200,150) — C6 #4).
//
//   SE-3  The scale factor s follows the prompt's step 4 EXACTLY (the C6
//         worked example is this arithmetic, bit-for-bit: s =
//         2.29128784747792, tx = -258.257569495584, ty = -193.693177121688,
//         predictedWorldArea = 105000): grow s = sqrt((areaGrowThreshold *
//         (1 + areaMargin)) / worldArea), shrink s = sqrt((areaShrinkThreshold
//         * (1 - areaMargin)) / worldArea); predictedWorldArea = worldArea *
//         (s * s) (the prompt's step 5 — equals |det| × current world area,
//         the C4 design note, because det = s² for the uniform form).
//
//   SE-4  Builder validation classes (INVALID_TARGET / INVALID_CAPABILITY /
//         INVALID_OBJECT_FACTS): the target must be a plain C1 record (id,
//         objectId, vocabulary roles, confidence number|null, evidence
//         array, source matching /^(dev|smr)-[0-9a-f]{8}$/ — the C4 invariant
//         "exactly one of deviationId/expectationRecordId is non-null"); the
//         capability must be THE registered entry (content equality via
//         stableStringify against SEMANTIC_CORRECTION_CAPABILITIES[0]); the
//         target's (currentRole, targetRole) must be one of the capability's
//         positional pairs (else INVALID_TARGET — the target is not serviceable
//         by this capability); objectFacts must satisfy the D fact classes
//         PLUS: worldArea a finite POSITIVE number (the builder DIVIDES by
//         it — a null-area shrink target cannot reach a proposal: the D
//         algorithm carries no shrink-side diagnosis gate, so this layer is
//         where the degenerate area refuses; C8 "degenerate/non-finite
//         area"), and the optional center validated when present. A
//         non-finite computed s (only reachable via denormal worldArea) is
//         refused as INVALID_OBJECT_FACTS — no real matrix exists.
//
//   SE-5  Proposal id (the prompt's Part 1 header): 'scp-' +
//         fnv1a32(stableStringify({targetId, capabilityId, mutation,
//         expectedSemanticEffect, confidence, provenance})) — EXACTLY the C6
//         #5 input set; the golden chain reproduces byte-for-byte
//         (dev-8305da82 -> sct-86f52be0 -> scp-f09b1135, tests B-2/D-4).
//
//   SE-6  Defense-in-depth layering (C8 rows (c)/(d)): the builder checks its
//         OWN arithmetic — strict crossing first (PREDICTED_AREA_INSIDE_
//         THRESHOLD), then the uniform form (NON_UNIFORM_SCALE_REJECTED),
//         the prompt's step 6/7 order. Both are UNREACHABLE through the
//         builder's public inputs by construction (the prediction is ANCHORED
//         at threshold*(1±margin) — a 5% buffer against ~1-ulp FP noise;
//         b/c are literal zeros and a and d are the same s). The checks guard
//         the layer that ACCEPTS HANDED records: executeSemanticCorrection-
//         Attempt re-validates every handed proposal (shape, uniform form,
//         declared-prediction crossing) BEFORE any transaction exists — T06's
//         own validator alone accepts shears (any |det| >= 1e-12,
//         tools.js:333), so the 3.18 refusal is MANDATORY (C8 row (d)).
//         Tests B-10/B-11 exercise exactly that handed-record surface.
//
//   SE-7  Execution posture (the prompt's Part 2): the substrate is the
//         correction.js injected shape {registry, transactionBuilder,
//         transactionManager} (duck-typed, :243-245/:2519-2524); ONE attempt
//         = ONE transaction (spec §31) whose id is content-derived
//         'atx-' + fnv1a32(stableStringify({proposalId, capabilityId,
//         iteration: 1})) and passed EXPLICITLY through begin({id}) (the
//         house disclosure-25 pattern, correction.js:2528-2537); ONE command
//         (the house correctionCommandFor pattern :2417-2459: the LIVE tool
//         is obtained from the injected registry, validated and executed
//         against a working-copy VIEW — correction.js:2388-2412 verbatim —
//         so the tool writes into the journaled WorkingCopy, never into the
//         stores); getInverse: null -> the executor's SNAPSHOT inverse path
//         (transaction.js:211-218 — B8); events publish AFTER commit and
//         history grows by one INSIDE the substrate's own pipeline
//         (invariants 16/13 — never re-implemented here). The attempt result
//         is the prompt's flat frozen record {status, transactionId,
//         inverseKind, diffCounts, error}; failure is atomic because the
//         executor commits only after all commands + validation succeed
//         (correction.js:2542-2544 posture).
//
//   SE-8  Scope: NO verification (post-commit re-derivation is Checkpoint F)
//         and NO top-level rollback function (Checkpoint G) — D-3's rollback
//         proof rides the substrate's OWN undo API directly in the tests.

// ---- 6. E-local helpers -----------------------------------------------------

/** Verbatim deep copy (the cloneData pattern, semantic-inference.js:196-204). */
function cloneData(value){
  if (Array.isArray(value)) return value.map(cloneData);
  if (isPlainObject(value)){
    const out = {};
    for (const k of Object.keys(value)) out[k] = cloneData(value[k]);
    return out;
  }
  return value;
}

/** C4 identity: 'scp-' over the six-key content (SE-5). */
function deriveProposalId(content){
  return 'scp-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

/** The per-attempt transaction id: 'atx-' over {proposalId, capabilityId, iteration} (SE-7). */
function deriveAttemptTransactionId(content){
  return 'atx-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

/** The attempt command id: 'ccmd-' over {proposalId, commandIndex, toolId} (the correction.js:2421 shape). */
function deriveCommandId(content){
  return 'ccmd-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function proposalTargetError(t){
  if (!isPlainObject(t)){
    return 'buildSemanticCorrectionProposal requires a plain-object SemanticCorrectionTarget (C1)';
  }
  for (const k of ['id', 'objectId', 'currentRole', 'targetRole', 'confidence', 'evidence', 'source']){
    if (!Object.prototype.hasOwnProperty.call(t, k)){
      return `buildSemanticCorrectionProposal requires target.'${k}' explicitly (the C1 record; deterministic construction, no hidden defaults)`;
    }
  }
  if (!isNonEmptyString(t.id)){
    return "target.id must be a non-empty string (the 'sct-' handle this proposal names)";
  }
  if (!isNonEmptyString(t.objectId)){
    return 'target.objectId must be a non-empty string (the corrected object; scope LOCAL)';
  }
  if (!isNonEmptyString(t.currentRole) || !DIAGNOSIS_ROLES.includes(t.currentRole)){
    return `target.currentRole must be a T20-emitted role — one of ${DIAGNOSIS_ROLES.join('/')}`;
  }
  if (!isNonEmptyString(t.targetRole) || !DIAGNOSIS_ROLES.includes(t.targetRole)){
    return `target.targetRole must be a T20-emitted role — one of ${DIAGNOSIS_ROLES.join('/')}`;
  }
  if (t.confidence !== null && !(typeof t.confidence === 'number' && Number.isFinite(t.confidence))){
    return 'target.confidence must be null or a finite number (the verbatim-or-null C1 belief; never synthesized)';
  }
  if (!Array.isArray(t.evidence)){
    return 'target.evidence must be an array (the frozen evidence rows; [] when upstream has none)';
  }
  if (!isNonEmptyString(t.source) || !/^(dev|smr)-[0-9a-f]{8}$/.test(t.source)){
    return "target.source must name its ONE upstream record — 'dev-<8hex>' (engine path) or 'smr-<8hex>' (host path); the C4 invariant 'exactly one of deviationId/expectationRecordId is non-null' hangs on it";
  }
  return null;
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function registeredCapabilityError(c){
  if (!isPlainObject(c)){
    return 'buildSemanticCorrectionProposal requires a plain-object SemanticCorrectionCapability (C2)';
  }
  // The ONE registered entry, verified by CONTENT (any field drift — a forged
  // margin, an extra key, a renamed role — refuses). The registry entry is
  // plain frozen data, so the canonical serialization is exact.
  if (stableStringify(c) !== stableStringify(SEMANTIC_CORRECTION_CAPABILITIES[0])){
    return 'capability must be the ONE registered entry (cap-shape-background, from SEMANTIC_CORRECTION_CAPABILITIES) — content equality check failed';
  }
  return null;
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function proposalFactsError(f){
  const base = objectFactsError(f);
  if (base !== null) return base;
  // Builder-specific: the matrix arithmetic DIVIDES by worldArea, so the
  // D-valid fact worldArea: null (and zero/negative areas) cannot reach a
  // proposal (SE-4; C8 'degenerate/non-finite area').
  if (!(typeof f.worldArea === 'number' && Number.isFinite(f.worldArea) && f.worldArea > 0)){
    return 'objectFacts.worldArea must be a finite POSITIVE number for proposal construction (the uniform scale divides by it)';
  }
  // The optional host-provided world center (SE-1/SE-2).
  if (f.center !== undefined){
    if (!isPlainObject(f.center)
        || !Object.prototype.hasOwnProperty.call(f.center, 'x') || !Object.prototype.hasOwnProperty.call(f.center, 'y')
        || !(typeof f.center.x === 'number' && Number.isFinite(f.center.x))
        || !(typeof f.center.y === 'number' && Number.isFinite(f.center.y))){
      return 'objectFacts.center must be {x, y} with finite numbers (the object\'s current world center; omit it for the documented world-origin fallback)';
    }
  }
  return null;
}

// ---- 7. The proposal builder (Checkpoint E Part 1) --------------------------

/**
 * Build ONE frozen SemanticCorrectionProposal (C4) from a corrected target,
 * the ONE registered capability, and the caller-read object facts. PURE:
 * imports nothing, reads no store, mutates nothing (SE-1).
 *
 * @param {Object} target A SemanticCorrectionTarget (C1) — e.g. derived from
 *   a CORRECTABLE diagnosis of a §13 semantic role deviation.
 * @param {Object} capability The registered SemanticCorrectionCapability (C2)
 *   — content-verified against SEMANTIC_CORRECTION_CAPABILITIES.
 * @param {Object} objectFacts { geometryType, childCount, worldArea,
 *   center? } — the D facts PLUS the optional host-provided world center
 *   {x, y} (SE-1/SE-2).
 * @returns {SemanticCorrectionProposal} The frozen C4 record with the
 *   content-derived 'scp-<8hex>' id (SE-5).
 */
export function buildSemanticCorrectionProposal(target, capability, objectFacts){
  const tMsg = proposalTargetError(target);
  if (tMsg) throw new SemanticCorrectionError(ERR_INVALID_TARGET, tMsg);
  const cMsg = registeredCapabilityError(capability);
  if (cMsg) throw new SemanticCorrectionError(ERR_INVALID_CAPABILITY, cMsg);
  // Prompt step 3: the target's roles must match the capability's positional
  // (sourceRoles[i], targetRoles[i]) pairs — otherwise THIS capability cannot
  // serve the target (INVALID_TARGET).
  const pairIndex = capability.sourceRoles.indexOf(target.currentRole);
  if (pairIndex === -1 || capability.targetRoles[pairIndex] !== target.targetRole){
    throw new SemanticCorrectionError(ERR_INVALID_TARGET, 'target (currentRole, targetRole) must match the capability\'s positional (sourceRoles[i], targetRoles[i]) pairs');
  }
  const fMsg = proposalFactsError(objectFacts);
  if (fMsg) throw new SemanticCorrectionError(ERR_INVALID_OBJECT_FACTS, fMsg);

  // Direction is exhaustive over the ONE capability's matchable surface (the
  // SD-4 argument): the verified pairs are (shape->background) and
  // (background->shape) only.
  const direction = target.currentRole === 'shape' ? 'grow' : 'shrink';
  const pre = capability.preconditions;
  const marginTargetArea = direction === 'grow'
    ? pre.areaGrowThreshold * (1 + pre.areaMargin)
    : pre.areaShrinkThreshold * (1 - pre.areaMargin);
  const s = Math.sqrt(marginTargetArea / objectFacts.worldArea);
  if (!Number.isFinite(s)){
    throw new SemanticCorrectionError(ERR_INVALID_OBJECT_FACTS, `objectFacts.worldArea ${objectFacts.worldArea} yields a non-finite uniform scale — no real matrix exists for this instance (C8 'degenerate/non-finite area')`);
  }
  // SE-2: the host-provided center, else the documented world-origin fallback.
  const cx = objectFacts.center ? objectFacts.center.x : 0;
  const cy = objectFacts.center ? objectFacts.center.y : 0;
  const matrix = { a: s, b: 0, c: 0, d: s, tx: cx * (1 - s), ty: cy * (1 - s) };
  // Prompt step 5 (SE-3): equals |det| × worldArea for the uniform form (C4).
  const predictedWorldArea = objectFacts.worldArea * (s * s);
  // Prompt step 6 (SE-6): strict crossing BEFORE the form check.
  const crosses = direction === 'grow'
    ? predictedWorldArea > pre.areaGrowThreshold
    : predictedWorldArea < pre.areaShrinkThreshold;
  if (!crosses){
    throw new SemanticCorrectionError(ERR_PREDICTED_AREA_INSIDE_THRESHOLD, `predicted world area ${predictedWorldArea} does not land strictly beyond the ${direction} threshold (${direction === 'grow' ? pre.areaGrowThreshold : pre.areaShrinkThreshold}) — proposal-construction breach (C8 row (c))`);
  }
  // Prompt step 7 (SE-6): the uniform-scale form of the matrix the builder
  // itself computed (defense in depth; unreachable through public inputs).
  if (!(matrix.b === 0 && matrix.c === 0 && matrix.a === matrix.d)){
    throw new SemanticCorrectionError(ERR_NON_UNIFORM_SCALE_REJECTED, `computed matrix violates the UNIFORM_SCALE form (b=${matrix.b}, c=${matrix.c}, a=${matrix.a}, d=${matrix.d}) — proposal-construction breach (C8 row (d))`);
  }

  const mutation = {
    kind: 'transform',
    toolId: capability.toolIds[0], // the verified registry capability grounds the tool — 'T06'
    input: { objectIds: [target.objectId], transform: matrix },
  };
  const expectedSemanticEffect = {
    role: { from: target.currentRole, toward: target.targetRole },
    predictedWorldArea,
  };
  const provenance = {
    source: PROPOSAL_SOURCE,
    deviationId: target.source.startsWith('dev-') ? target.source : null,
    expectationRecordId: target.source.startsWith('smr-') ? target.source : null,
    evidence: cloneData(target.evidence),
  };
  // SE-5: EXACTLY the C6 #5 input set — key order is irrelevant to the
  // canonical serialization (stableStringify sorts).
  const id = deriveProposalId({
    targetId: target.id,
    capabilityId: capability.id,
    mutation,
    expectedSemanticEffect,
    confidence: target.confidence,
    provenance,
  });
  return deepFreeze({
    id,
    targetId: target.id,
    capabilityId: capability.id,
    objectIds: [target.objectId],
    mutation,
    expectedSemanticEffect,
    confidence: target.confidence,
    provenance,
  });
}

// ---- 8. The execution path (Checkpoint E Part 2) ----------------------------

/**
 * Local mirror of the substrate's own tool-hosting working-copy view
 * (correction.js:2388-2412, which mirrors tools.js makeSubstrateWorkingCopy):
 * mutation tools write through these calls, the WorkingCopy journals them,
 * the executor diffs and commits. The module never imports the substrate.
 */
function substrateWorkingCopyView(wc){
  return {
    wc,
    nodes: wc.nodes,
    createGeometry: (id, g) => wc.setGeometry(id, g),
    createAppearance: (id, a) => wc.setAppearance(a),
    createObject: o => wc.setObject(o),
    createNode: (childId, parentId) => wc.setNode({ id: childId, objectRef: childId, parent: parentId || null, children: [], localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } }),
    deleteObject: id => wc.deleteObject(id),
    setNode: n => wc.setNode(n),
    getObject: id => wc.getObject(id),
    hasObject: id => wc.hasObject(id),
    getGeometry: id => wc.getGeometry(id),
    getAppearance: id => wc.getAppearance(id),
    getNode: id => wc.getNode(id),
    getRootNodes: () => { const roots = []; for (const n of wc.getNodes().values()) if (!n.parent && !n.parentId) roots.push(n); return roots; },
    setGeometry: (id, g) => wc.setGeometry(id, g),
    setAppearance: a => wc.setAppearance(a),
    loadNode: (id, n) => wc.loadNode(id, n),
    deleteNode: id => wc.deleteNode(id),
    deleteGeometry: id => wc.deleteGeometry(id),
    deleteAppearance: id => wc.deleteAppearance(id),
    getNodes: () => wc.getNodes()
  };
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function proposalRecordError(p){
  if (!isPlainObject(p)){
    return 'executeSemanticCorrectionAttempt requires a plain-object SemanticCorrectionProposal (C4)';
  }
  for (const k of ['id', 'targetId', 'capabilityId', 'objectIds', 'mutation', 'expectedSemanticEffect', 'confidence', 'provenance']){
    if (!Object.prototype.hasOwnProperty.call(p, k)){
      return `executeSemanticCorrectionAttempt requires proposal.'${k}' explicitly (the C4 record; deterministic construction, no hidden defaults)`;
    }
  }
  if (!isNonEmptyString(p.id) || !/^scp-[0-9a-f]{8}$/.test(p.id)){
    return `proposal.id must be a content-derived 'scp-<8hex>' id (observed: ${JSON.stringify(p.id)})`;
  }
  if (!isNonEmptyString(p.targetId)){
    return 'proposal.targetId must be a non-empty string (the sct- target this proposal corrects)';
  }
  if (!isNonEmptyString(p.capabilityId) || !SEMANTIC_CORRECTION_CAPABILITIES.some(c => c.id === p.capabilityId)){
    return 'proposal.capabilityId must name a registered SEMANTIC_CORRECTION_CAPABILITIES entry (a proposal without a registry capability id is a construction breach, C4)';
  }
  if (!Array.isArray(p.objectIds) || p.objectIds.length === 0 || !p.objectIds.every(isNonEmptyString)){
    return 'proposal.objectIds must be a non-empty array of object-id strings (scope LOCAL: exactly the target object)';
  }
  const m = p.mutation;
  if (!isPlainObject(m) || m.kind !== 'transform' || m.toolId !== 'T06' || !isPlainObject(m.input)){
    return "proposal.mutation must be {kind:'transform', toolId:'T06', input:{objectIds, transform}} (the C4 descriptor; T06 is the ONE grounding tool)";
  }
  if (!Array.isArray(m.input.objectIds) || m.input.objectIds.length === 0 || !m.input.objectIds.every(isNonEmptyString)){
    return 'proposal.mutation.input.objectIds must be a non-empty array of object-id strings (the T06 input contract)';
  }
  const t = m.input.transform;
  if (!isPlainObject(t)
      || !['a', 'b', 'c', 'd', 'tx', 'ty'].every(k => Object.prototype.hasOwnProperty.call(t, k) && typeof t[k] === 'number' && Number.isFinite(t[k]))){
    return 'proposal.mutation.input.transform must carry all six finite numeric matrix keys a/b/c/d/tx/ty (the T06 input contract)';
  }
  const e = p.expectedSemanticEffect;
  if (!isPlainObject(e) || !isPlainObject(e.role)
      || !isNonEmptyString(e.role.from) || !DIAGNOSIS_ROLES.includes(e.role.from)
      || !isNonEmptyString(e.role.toward) || !DIAGNOSIS_ROLES.includes(e.role.toward)
      || !(typeof e.predictedWorldArea === 'number' && Number.isFinite(e.predictedWorldArea))){
    return 'proposal.expectedSemanticEffect must be {role:{from, toward}, predictedWorldArea: finite number} (an expectation, never a guarantee — C4)';
  }
  if (p.confidence !== null && !(typeof p.confidence === 'number' && Number.isFinite(p.confidence))){
    return 'proposal.confidence must be null or a finite number (the verbatim-or-null upstream belief)';
  }
  const pr = p.provenance;
  if (!isPlainObject(pr) || pr.source !== PROPOSAL_SOURCE
      || !(pr.deviationId === null || isNonEmptyString(pr.deviationId))
      || !(pr.expectationRecordId === null || isNonEmptyString(pr.expectationRecordId))
      || !Array.isArray(pr.evidence)
      || ((pr.deviationId === null) === (pr.expectationRecordId === null))){
    return "proposal.provenance must be {source:'semantic-correction', deviationId, expectationRecordId, evidence} with EXACTLY ONE of deviationId/expectationRecordId non-null (the C4 invariant)";
  }
  return null;
}

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function substrateError(s){
  if (!isPlainObject(s)
      || !isPlainObject(s.registry) || typeof s.registry.has !== 'function' || typeof s.registry.get !== 'function'
      || !isPlainObject(s.transactionManager) || typeof s.transactionManager.execute !== 'function'
      || !isPlainObject(s.transactionBuilder) || typeof s.transactionBuilder.begin !== 'function' || typeof s.transactionBuilder.addCommand !== 'function' || typeof s.transactionBuilder.build !== 'function'){
    return 'executeSemanticCorrectionAttempt requires an injected substrate {registry, transactionManager, transactionBuilder} (duck-typed; the module stays zero-import — the house disclosure-24 posture, correction.js:2519-2524)';
  }
  return null;
}

/**
 * Execute ONE semantic correction attempt: the proposal's single T06 mutation
 * as EXACTLY ONE content-derived transaction through the injected substrate's
 * own executor pipeline (SE-7). Reads no store directly; failure is atomic
 * (the substrate commits only after all commands and validation succeed).
 *
 * @param {Object} proposal A frozen SemanticCorrectionProposal (C4) — house-
 *   built or foreign; every handed record is re-validated (SE-6).
 * @param {Object} substrate { registry, transactionBuilder, transactionManager }
 *   — the correction.js injected-substrate shape; an optional sceneGraph is
 *   honored for node-scoped affected-id resolution (correction.js:2443-2448).
 * @returns {Object} The frozen flat record { status: 'EXECUTED'|'FAILED',
 *   transactionId, inverseKind, diffCounts, error }.
 */
export function executeSemanticCorrectionAttempt(proposal, substrate){
  // 1. Validate the handed proposal (shape + defense-in-depth SE-6), then the
  //    substrate presence — BEFORE any transaction exists.
  const pMsg = proposalRecordError(proposal);
  if (pMsg) throw new SemanticCorrectionError(ERR_INVALID_PROPOSAL, pMsg);
  const capability = SEMANTIC_CORRECTION_CAPABILITIES.find(c => c.id === proposal.capabilityId);
  const t = proposal.mutation.input.transform;
  // C8 row (d): the uniform-scale form is MANDATORY at this layer — T06's own
  // validator alone would accept shears (any |det| >= 1e-12, tools.js:333).
  if (!(t.b === 0 && t.c === 0 && t.a === t.d)){
    throw new SemanticCorrectionError(ERR_NON_UNIFORM_SCALE_REJECTED, `handed proposal ${proposal.id} carries a non-uniform transform (b=${t.b}, c=${t.c}, a=${t.a}, d=${t.d}) — the UNIFORM_SCALE form is required (C8 row (d))`);
  }
  const pairIndex = capability.sourceRoles.indexOf(proposal.expectedSemanticEffect.role.from);
  if (pairIndex === -1 || capability.targetRoles[pairIndex] !== proposal.expectedSemanticEffect.role.toward){
    throw new SemanticCorrectionError(ERR_INVALID_PROPOSAL, 'handed proposal declares a role transition no registered capability serves');
  }
  // C8 row (c): the DECLARED prediction must strictly cross (checkable at
  // construction time per C4; re-checked here for every handed record).
  const direction = proposal.expectedSemanticEffect.role.from === 'shape' ? 'grow' : 'shrink';
  const threshold = direction === 'grow'
    ? capability.preconditions.areaGrowThreshold
    : capability.preconditions.areaShrinkThreshold;
  const crosses = direction === 'grow'
    ? proposal.expectedSemanticEffect.predictedWorldArea > threshold
    : proposal.expectedSemanticEffect.predictedWorldArea < threshold;
  if (!crosses){
    throw new SemanticCorrectionError(ERR_PREDICTED_AREA_INSIDE_THRESHOLD, `handed proposal ${proposal.id} declares predictedWorldArea ${proposal.expectedSemanticEffect.predictedWorldArea}, which does not land strictly beyond the ${direction} threshold ${threshold} (C8 row (c))`);
  }
  const sMsg = substrateError(substrate);
  if (sMsg) throw new SemanticCorrectionError(ERR_INVALID_SUBSTRATE, sMsg);

  // 2. Preflight: the grounding tool must be REGISTERED (the prompt's Part-2
  //    step 2; the house TOOLS_UNAVAILABLE refusal, correction.js:2473-2477).
  //    proposalRecordError pinned mutation.toolId === 'T06'.
  if (!substrate.registry.has(proposal.mutation.toolId)){
    return deepFreeze({
      status: 'FAILED',
      transactionId: null,
      inverseKind: null,
      diffCounts: null,
      error: deepFreeze({ code: ERR_TOOLS_UNAVAILABLE, message: `Tool ${proposal.mutation.toolId} is not registered in the substrate registry (preflight)` }),
    });
  }

  // 3. Build the ONE transaction (spec §31): content-derived atx- id passed
  //    EXPLICITLY through begin({id}) (SE-7 / the house disclosure-25), one
  //    command bound to the LIVE tool (the correctionCommandFor pattern).
  const transactionId = deriveAttemptTransactionId({
    proposalId: proposal.id,
    capabilityId: proposal.capabilityId,
    iteration: ATTEMPT_ITERATION,
  });
  const tool = substrate.registry.get(proposal.mutation.toolId);
  const input = cloneData(proposal.mutation.input); // verbatim copy; never aliases the frozen proposal
  const command = {
    id: deriveCommandId({ proposalId: proposal.id, commandIndex: 0, toolId: proposal.mutation.toolId }),
    toolId: proposal.mutation.toolId,
    input,
    deterministic: tool.deterministic === true,
    execute(ctx){
      const view = substrateWorkingCopyView(ctx.workingCopy);
      const toolContext = { ...substrate, workingCopy: view };
      const check = tool.validate(input, toolContext);
      if (!check || check.valid !== true){
        const msg = check && Array.isArray(check.errors) && check.errors[0] && check.errors[0].message ? check.errors[0].message : 'tool validation failed';
        return { success: false, error: msg };
      }
      const result = tool.execute(input, toolContext);
      if (!result || result.success !== true){
        const msg = result && Array.isArray(result.errors) && result.errors[0] && result.errors[0].message ? result.errors[0].message : 'tool execution failed';
        return { success: false, error: msg };
      }
      return { success: true };
    },
    getAffectedIds(){
      // The prompt's Part-2 step 3: the proposal's own object surface
      // (proposal.objectIds); node ids resolve through the optional
      // substrate sceneGraph (correction.js:2440-2450 shape).
      const objects = Array.isArray(proposal.objectIds) ? proposal.objectIds.filter(isNonEmptyString) : [];
      const nodes = [];
      if (substrate.sceneGraph && typeof substrate.sceneGraph.findNodeByObjectId === 'function'){
        for (const oid of objects){
          const node = substrate.sceneGraph.findNodeByObjectId(oid);
          if (node && node.id) nodes.push(node.id);
        }
      }
      return { objects, nodes };
    },
    // T06 declares NO command inverse -> the executor's SNAPSHOT inverse path
    // (transaction.js:211-218; B8). Null is the prompt-literal declaration.
    getInverse: null,
  };
  const builder = substrate.transactionBuilder.begin({
    source: ATTEMPT_SOURCE,
    toolId: proposal.mutation.toolId,
    description: ATTEMPT_DESCRIPTION,
    parentId: null,
    id: transactionId,
  });
  builder.addCommand(command);
  const transaction = builder.build();

  // 4. Execute through the substrate's own pipeline; a failure is ATOMIC
  //    (stores untouched, nothing pushed — commit happens after all commands
  //    and validation succeed, correction.js:2542-2544 posture).
  let committed = null, failure = null;
  try { committed = substrate.transactionManager.execute(transaction); }
  catch (e){ failure = e; }
  if (failure !== null){
    return deepFreeze({
      status: 'FAILED',
      transactionId: transaction.id,
      inverseKind: null,
      diffCounts: null,
      error: deepFreeze({ code: ERR_EXECUTION_ERROR, message: failure && failure.message ? String(failure.message) : 'transaction execution failed' }),
    });
  }
  // 5. The committed record: inverseKind and diffCounts come from the
  //    substrate's own transaction record (never re-derived here).
  return deepFreeze({
    status: 'EXECUTED',
    transactionId: committed.id,
    inverseKind: committed.inverse && committed.inverse.type ? committed.inverse.type : null,
    diffCounts: deepFreeze({ added: committed.diff.added.length, removed: committed.diff.removed.length, modified: committed.diff.modified.length }),
    error: null,
  });
}

// ==== Checkpoint F — design decisions (pinned here and in the E/F tests) ====
//
//   SF-1  Verification is the B9 contract, mechanically: post-mutation
//         re-evaluation is REAL — the function calls the LIVE T20 tool
//         (registry.get('T20')) and validates+executes it against the CURRENT
//         committed document state, then compares the re-derived role with
//         target.targetRole (SATISFIED iff equal — the evaluation-arm mirror,
//         evaluation.js:1309-1311). There is NO shortcut: no cached role is
//         read from the proposal or the target, and no snapshot of the
//         pre-mutation state is consulted (E-8 proves liveness with an
//         interleaved second mutation). NO false verification (spec §40):
//         anything T20 cannot honestly deliver becomes UNVERIFIABLE with a
//         deterministic machine reason — never a guess, never a fabricated
//         SATISFIED.
//
//   SF-2  The local normalizer mirrors the house normalizer's contract
//         VERBATIM (normalizeProposal, semantic-inference.js:224-248): ONE raw
//         T20 proposal -> the 7-key frozen record { id: 'smr-' +
//         fnv1a32(stableStringify({objectId, role, confidence, evidence})),
//         objectId, role, confidence, evidence, source: 'T20', status:
//         'PROPOSED' } — or a refusal. The role-vocabulary guard is the
//         DIAGNOSIS_ROLES twin already localized above (= T20_EMITTED_ROLES,
//         semantic-inference.js:152-155); confidence is verbatim-or-null
//         (BD-3: a finite number is carried, anything else becomes null —
//         never coerced, never clamped); evidence is cloned verbatim, absent
//         -> [] (BD-4); refusals are MALFORMED / UNSUPPORTED_TYPE (BD-6
//         vocabulary). The record id is derived for contract fidelity — the
//         verification output never consumes it.
//
//   SF-3  The verification substrate shape (duck-typed): { registry,
//         objectStore, geometryStore, appearanceStore, sceneGraph } — the
//         registry PLUS the committed-state read surface T20 needs (tools.js
//         getGeomOf :144-150 reads the object/geometry stores when no
//         workingCopy is present; the appearance read :979-981; sceneGraph for
//         the node context and the world bbox :152-162). The toolContext
//         handed to T20 carries EXACTLY those four read keys — deliberately NO
//         workingCopy (the committed stores ARE the post-commit state) and NO
//         transaction surface (T20 is proposal-class; verification runs no
//         transaction).
//
//   SF-4  Honest refusal mapping (all three -> status 'UNVERIFIABLE',
//         actualRole/evidence/confidence null — nothing invented):
//           registry.has('T20') false, or a registry entry without the
//             validate/execute shape          -> 'T20_UNAVAILABLE' (preflight)
//           T20's validate refuses, execute throws or returns a non-success
//             envelope, or no proposal names the target object
//                                            -> 'T20_NO_PROPOSAL' (E-5's
//                                               object-missing case lands here
//                                               through validateObjectsExist,
//                                               tools.js:179-186)
//           a proposal EXISTS for the object but the normalizer's contract
//             refuses it (MALFORMED / UNSUPPORTED_TYPE)
//                                            -> 'T20_REFUSED'
//         The prompt's logic section names '(T20_FAILED / MALFORMED)' for the
//         refused arm; the failure-ENVELOPE shape the house normalizer wraps
//         as T20_FAILED (normalizeResult) is covered by the T20_NO_PROPOSAL
//         arm here, per the prompt's OWN E-5 pin ("T20 refuses (object
//         missing) returns UNVERIFIABLE with reason T20_NO_PROPOSAL") —
//         disclosed in the Checkpoint F report.
//
//   SF-5  Attempt validation is exactly the prompt's rule: only a plain
//         ExecutionResult record whose status === 'EXECUTED' can verify.
//         Anything else — a FAILED attempt (no commit happened; there is no
//         post-state of THIS attempt to re-derive), or a malformed record —
//         throws SemanticCorrectionError 'INVALID_ATTEMPT' BEFORE any tool
//         runs. The proposal and target are re-validated through the same
//         E-approved validators (the handed-record layer, the SE-6 posture);
//         the substrate through an F-specific duck-type check.
//
//   SF-6  On the measured pair, evidence and confidence are copied VERBATIM
//         from the normalized record — never synthesized, never defaulted
//         (null when the record has none). They ride OUTSIDE the comparison:
//         the verdict depends ONLY on (actualRole, targetRole).
//
//   SF-7  createSemanticRoleProvider is the ONLY bridge between the correction
//         layer and the evaluation arm's semantic side (DD-1,
//         evaluation.js:1205-1215): the factory validates the substrate ONCE
//         (loud INVALID_SUBSTRATE — wiring is construction, not per-call
//         honesty) and returns a function (objectId) => role string | null
//         that NEVER throws: every per-call failure (T20 unavailable,
//         refusal, no proposal, unusable objectId) returns null — the honest
//         INSUFFICIENT_EVIDENCE signal at the arm (evaluation.js:1298-1302).
//         No caching across calls: every invocation re-runs T20 against the
//         current committed state (the arm invokes the provider exactly once
//         per measurable expectation, in agenda order, never cached —
//         evaluation.js:1213-1214; F-3 proves liveness with an interleaved
//         mutation). The provider is INJECTED into an evaluation context
//         (evaluationContext.getActualRole) — evaluation.js never imports
//         this module (F-1 exercises the injection end-to-end).

// ---- 9. Checkpoint F — verification path + semantic role provider -----------

// The Checkpoint F refusal vocabulary (the prompt's Part 1 codes + the three
// UNVERIFIABLE machine reasons + the mismatch reason).
const ERR_INVALID_ATTEMPT = 'INVALID_ATTEMPT';
const VERIFY_TOOL_ID = 'T20';
const VERIFY_SOURCE = 'T20';
const VERIFY_STATUS = 'PROPOSED';
const VERIFY_NORMALIZER_MALFORMED = 'MALFORMED';
const VERIFY_NORMALIZER_UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE';
const UNVERIFIABLE_T20_UNAVAILABLE = 'T20_UNAVAILABLE';
const UNVERIFIABLE_T20_NO_PROPOSAL = 'T20_NO_PROPOSAL';
const UNVERIFIABLE_T20_REFUSED = 'T20_REFUSED';
const VERIFY_REASON_ROLE_MISMATCH = 'ROLE_MISMATCH';

/**
 * @typedef {Object} SemanticVerificationResult
 * @property {'SATISFIED'|'VIOLATED'|'UNVERIFIABLE'} status
 *   SATISFIED iff the re-derived role equals target.targetRole (B9); VIOLATED
 *   on an honest mismatch; UNVERIFIABLE when T20 cannot honestly deliver a
 *   role (spec §40 — no false verification).
 * @property {string|null} actualRole
 *   The re-derived role (the normalized record's role) on SATISFIED/VIOLATED;
 *   null on UNVERIFIABLE — never invented, never taken from the proposal or
 *   the target.
 * @property {string} targetRole
 *   The expectation, verbatim from target.targetRole.
 * @property {string|null} reason
 *   null on SATISFIED (the compared-pair convention, evaluation.js:1310);
 *   'ROLE_MISMATCH' on VIOLATED; 'T20_UNAVAILABLE' / 'T20_NO_PROPOSAL' /
 *   'T20_REFUSED' on UNVERIFIABLE (SF-4).
 * @property {ReadonlyArray<{signal: string, description: string, weight: number}>|null} evidence
 *   Verbatim frozen clone of the normalized record's evidence on the measured
 *   pair (absent rows -> []); null on UNVERIFIABLE. Never synthesized.
 * @property {number|null} confidence
 *   Verbatim-or-null copy of the normalized record's confidence (BD-3); null
 *   on UNVERIFIABLE. Never synthesized.
 */

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function verificationSubstrateError(s){
  if (!isPlainObject(s)
      || !isPlainObject(s.registry) || typeof s.registry.has !== 'function' || typeof s.registry.get !== 'function'
      || !isPlainObject(s.objectStore) || typeof s.objectStore.get !== 'function'
      || !isPlainObject(s.geometryStore) || typeof s.geometryStore.get !== 'function'
      || !isPlainObject(s.appearanceStore) || typeof s.appearanceStore.get !== 'function'
      || !isPlainObject(s.sceneGraph) || typeof s.sceneGraph.findNodeByObjectId !== 'function'){
    return 'semantic correction verification requires an injected substrate {registry, objectStore, geometryStore, appearanceStore, sceneGraph} (duck-typed; the module stays zero-import — the T20 tool through the registry, the committed-state read surface through the store keys)';
  }
  return null;
}

/**
 * Local mirror of the house normalizer's contract (normalizeProposal,
 * semantic-inference.js:224-248 — SF-2): ONE raw T20 proposal -> the 7-key
 * frozen record, or a refusal.
 * @returns {{record: Object}|{refusal: string}}
 */
function normalizeT20Proposal(raw){
  if (!isPlainObject(raw) || !isNonEmptyString(raw.objectId) || typeof raw.proposedRole !== 'string'){
    return { refusal: VERIFY_NORMALIZER_MALFORMED };
  }
  const role = raw.proposedRole;
  if (!DIAGNOSIS_ROLES.includes(role)){
    return { refusal: VERIFY_NORMALIZER_UNSUPPORTED_TYPE };
  }
  // BD-3: verbatim-or-null; only a genuinely numeric confidence is carried.
  const confidence = (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) ? raw.confidence : null;
  // BD-4: evidence copied verbatim (+ frozen via the record's deepFreeze);
  // absent evidence normalizes to [].
  const evidence = Array.isArray(raw.evidence) ? cloneData(raw.evidence) : [];
  const content = { objectId: raw.objectId, role, confidence, evidence };
  const record = {
    id: 'smr-' + fnv1a32(stableStringify(content), 0x811c9dc5),
    objectId: raw.objectId,
    role,
    confidence,
    evidence,
    source: VERIFY_SOURCE,
    status: VERIFY_STATUS,
  };
  return { record: deepFreeze(record) };
}

/**
 * Run ONE real T20 inference for ONE object against the CURRENT committed
 * document state carried by the injected substrate (SF-1/SF-3). Reads only;
 * the live tool comes exclusively from the injected registry. Exceptions from
 * a hostile tool are caught and mapped to the honest no-delivery reasons —
 * the provider built on top must never throw (SF-7).
 * @returns {{ok: true, record: Object}|{ok: false, reason: string}}
 */
function runT20Inference(substrate, objectId){
  // Preflight (the prompt's Part-1 step 2).
  if (!substrate.registry.has(VERIFY_TOOL_ID)){
    return { ok: false, reason: UNVERIFIABLE_T20_UNAVAILABLE };
  }
  const tool = substrate.registry.get(VERIFY_TOOL_ID);
  if (!isPlainObject(tool) || typeof tool.validate !== 'function' || typeof tool.execute !== 'function'){
    return { ok: false, reason: UNVERIFIABLE_T20_UNAVAILABLE };
  }
  const input = { objectIds: [objectId] };
  // SF-3: EXACTLY the committed-state read surface — no workingCopy (the
  // stores ARE the post-commit state), no transaction surface.
  const toolContext = {
    objectStore: substrate.objectStore,
    geometryStore: substrate.geometryStore,
    appearanceStore: substrate.appearanceStore,
    sceneGraph: substrate.sceneGraph,
  };
  let check = null;
  try { check = tool.validate(input, toolContext); }
  catch (e){ return { ok: false, reason: UNVERIFIABLE_T20_NO_PROPOSAL }; }
  if (!isPlainObject(check) || check.valid !== true){
    return { ok: false, reason: UNVERIFIABLE_T20_NO_PROPOSAL };
  }
  let result = null;
  try { result = tool.execute(input, toolContext); }
  catch (e){ return { ok: false, reason: UNVERIFIABLE_T20_NO_PROPOSAL }; }
  if (!isPlainObject(result) || result.success !== true
      || !isPlainObject(result.output) || !Array.isArray(result.output.proposals)){
    return { ok: false, reason: UNVERIFIABLE_T20_NO_PROPOSAL };
  }
  const raw = result.output.proposals.find(p => isPlainObject(p) && p.objectId === objectId);
  if (!raw){
    return { ok: false, reason: UNVERIFIABLE_T20_NO_PROPOSAL };
  }
  const normalized = normalizeT20Proposal(raw);
  if (!normalized.record){
    return { ok: false, reason: UNVERIFIABLE_T20_REFUSED };
  }
  return { ok: true, record: normalized.record };
}

// ---- 10. The verification path (Checkpoint F Part 1) ------------------------

/**
 * Verify ONE executed semantic correction attempt by re-deriving the object's
 * role with the LIVE T20 tool over the CURRENT committed document state (B9,
 * SF-1). Reads only; throws only on malformed handed records; never fabricates
 * a verdict (spec §40).
 *
 * @param {Object} attempt An ExecutionResult from executeSemanticCorrectionAttempt
 *   (the E-approved flat frozen record). Only status === 'EXECUTED' verifies.
 * @param {Object} proposal The SemanticCorrectionProposal that was executed
 *   (C4; re-validated as a handed record, the SE-6 posture).
 * @param {Object} target The SemanticCorrectionTarget naming the expectation (C1).
 * @param {Object} substrate { registry, objectStore, geometryStore,
 *   appearanceStore, sceneGraph } (SF-3).
 * @returns {SemanticVerificationResult} The frozen six-key record.
 */
export function verifySemanticCorrectionAttempt(attempt, proposal, target, substrate){
  // 1. Only a committed attempt can verify (SF-5) — BEFORE anything else runs.
  if (!isPlainObject(attempt) || !Object.prototype.hasOwnProperty.call(attempt, 'status') || attempt.status !== 'EXECUTED'){
    throw new SemanticCorrectionError(ERR_INVALID_ATTEMPT, "verifySemanticCorrectionAttempt requires an ExecutionResult with status 'EXECUTED' — a FAILED attempt carried no commit, so there is no post-state of this attempt to re-derive");
  }
  const pMsg = proposalRecordError(proposal);
  if (pMsg) throw new SemanticCorrectionError(ERR_INVALID_PROPOSAL, pMsg);
  const tMsg = proposalTargetError(target);
  if (tMsg) throw new SemanticCorrectionError(ERR_INVALID_TARGET, tMsg);
  const sMsg = verificationSubstrateError(substrate);
  if (sMsg) throw new SemanticCorrectionError(ERR_INVALID_SUBSTRATE, sMsg);
  // 2-3. REAL T20 re-inference over the CURRENT committed state (SF-1); every
  //      non-delivery is an honest UNVERIFIABLE (SF-4) — never a guess.
  const run = runT20Inference(substrate, target.objectId);
  if (!run.ok){
    return deepFreeze({
      status: 'UNVERIFIABLE',
      actualRole: null,
      targetRole: target.targetRole,
      reason: run.reason,
      evidence: null,
      confidence: null,
    });
  }
  // 4-5. The comparison (B9: SATISFIED iff actualRole === targetRole — the
  //      evaluation-arm mirror, evaluation.js:1309-1311) with verbatim copies
  //      from the normalized record (SF-6).
  const record = run.record;
  const satisfied = record.role === target.targetRole;
  return deepFreeze({
    status: satisfied ? 'SATISFIED' : 'VIOLATED',
    actualRole: record.role,
    targetRole: target.targetRole,
    reason: satisfied ? null : VERIFY_REASON_ROLE_MISMATCH,
    evidence: record.evidence,
    confidence: record.confidence,
  });
}

// ---- 11. The semantic role provider (Checkpoint F Part 2) -------------------

/**
 * Build the semantic role provider — the ONLY bridge between the correction
 * layer and the evaluation arm's semantic side (DD-1, SF-7). The returned
 * function is INJECTED into an evaluation context as
 * evaluationContext.getActualRole; evaluation.js never imports this module.
 *
 * @param {Object} substrate { registry, objectStore, geometryStore,
 *   appearanceStore, sceneGraph } (SF-3) — validated ONCE, here (loud
 *   INVALID_SUBSTRATE: wiring is construction).
 * @returns {(objectId: string) => string|null} The DD-1 provider: the live
 *   re-derived role for the object, or null on ANY per-call failure (T20
 *   unavailable, refusal, no proposal, unusable objectId) — the honest
 *   INSUFFICIENT_EVIDENCE signal at the arm (evaluation.js:1298-1302). NEVER
 *   throws; NEVER caches (every call re-runs T20 against the current
 *   committed state, the DD-1 semantics of evaluation.js:1213-1214).
 */
export function createSemanticRoleProvider(substrate){
  const sMsg = verificationSubstrateError(substrate);
  if (sMsg) throw new SemanticCorrectionError(ERR_INVALID_SUBSTRATE, sMsg);
  return function getActualRole(objectId){
    if (!isNonEmptyString(objectId)) return null;
    const run = runT20Inference(substrate, objectId);
    return run.ok ? run.record.role : null;
  };
}

// ==== Checkpoint G — design decisions (pinned here and in the G/H/I/J tests) ==
//
//   SG-1  Regression comparison is EXACTLY the prompt's table: pre
//         UNVERIFIABLE-or-VIOLATED + post SATISFIED -> IMPROVED; pre === post
//         -> NO_CHANGE (all three statuses, null actualRole comparable);
//         pre SATISFIED + post VIOLATED -> REGRESSED; otherwise -> UNKNOWN.
//         The two UNKNOWN arms carry deterministic machine reasons
//         ('NO_BASELINE' for a null preVerification — the first attempt has
//         no baseline and is NEVER reported IMPROVED; 'UNMAPPED_STATUS_
//         TRANSITION' for the otherwise arm); the mapped verdicts carry
//         reason null (the compared-pair convention). preStatus/postStatus/
//         preRole/postRole are VERBATIM copies — never synthesized. The
//         VerificationResult inputs are vocabulary-guarded (plain object,
//         own 'status' in {SATISFIED, VIOLATED, UNVERIFIABLE}, own
//         'actualRole' key — the F output shape); refusals throw
//         INVALID_VERIFICATION.
//
//   SG-2  Rollback mirrors the house §32 pattern VERBATIM in shape
//         (rollbackCorrectionAttempt, correction.js:2675-2713) with the G
//         prompt's record-not-throw substrate arms: the top-of-history
//         ownership guard reads THROUGH the transactionManager
//         (transactionManager.historyManager.getTransactionToUndo() — the
//         real executor publishes the history manager as its own property,
//         transaction.js:189; the house duck-type, disclosure 32) and refuses
//         a foreign transaction BEFORE any undo runs ('NOT_TOP_OF_HISTORY' —
//         the engine never undoes a foreign transaction, correction.js:2691-
//         2694 posture); the substrate's OWN undo is then called EXACTLY
//         ONCE (never re-implemented, never bypassed, no snapshot
//         manipulation here — the restore is the executor's snapshot-inverse
//         path, transaction.js:231-263). An undo throw or falsy return maps
//         to REFUSED/'UNDO_FAILED' with a MACHINE-ONLY reason (no substrate
//         message leakage — H-6 determinism). Validation throws:
//         INVALID_ATTEMPT (the prompt's H-4 "(or throw INVALID_ATTEMPT)"
//         option, chosen for consistency with verifySemanticCorrectionAttempt's
//         attempt guard) and INVALID_SUBSTRATE (the construction-breach
//         posture, the E/F precedent). The refusal records carry the
//         attempt's own transactionId (identifies what was refused — never
//         invented).
//
//   SG-3  Convergence order is EXACTLY the prompt's: empty trail ->
//         TERMINATED/'EMPTY_TRAIL'; last SATISFIED -> VERIFIED/reason null
//         (wins over the budget — converged is converged); iterationCount >=
//         maxIterations -> MAX_ITERATIONS; the trailing noProgressThreshold
//         window sharing one (status, actualRole) pair -> NO_PROGRESS (null
//         roles comparable — repeated UNVERIFIABLE is honest no-progress);
//         an A -> B -> A role recurrence (there exist i < j < k with
//         role[i] === role[k] !== role[j], the §31 posture) -> OSCILLATION;
//         otherwise TERMINATED/'NO_CONVERGENCE_PATH'. The verdicts the prompt
//         leaves unpinned carry machine reasons ('MAX_ITERATIONS_REACHED',
//         'NO_PROGRESS_THRESHOLD_REACHED', 'ROLE_RECURRENCE'). Policy
//         defaults {maxIterations: 5, noProgressThreshold: 2}; a PRESENT
//         policy must be a plain object carrying BOTH numbers (finite, >= 1)
//         — no hidden defaults (the SD-3 discipline); refusals throw
//         INVALID_TRAIL / INVALID_POLICY. Pure: same trail + same policy ->
//         the same frozen verdict.
//
//   SG-4  The agenda is the §50/§51 BRIDGE and nothing more: it adds NO loop
//         states, NO engine state, NO transition table, NO engine import.
//         buildSemanticCorrectionAgenda re-validates through the D selector
//         (which owns the deviation/facts validation) and returns NULL for
//         every non-CORRECTABLE diagnosis — the host treats null as the
//         existing SEMANTIC_ERROR -> NO_CAPABILITY -> UNFIXABLE terminal
//         (correction.js:1397-1404, :3034-3036); J-2 pins all four refusal
//         reasons. A CORRECTABLE diagnosis yields the frozen record {target,
//         diagnosis, isActionable: true, refusalReason: null}; isActionable/
//         refusalReason are the prompt-pinned host contract (redundant today
//         by the null posture — the host never needs to re-derive trust).
//         Agenda-specific gates for what THIS layer consumes: the deviation
//         id is gated to the house 'dev-<8hex>'/'smr-<8hex>' id space (the C1
//         target.source contract — the agenda's target must be serviceable by
//         the E proposal builder, J-1 proves the byte-for-byte bridge) and
//         OPTIONAL belief enrichment (deviation.confidence / deviation.
//         evidence) is validated when present and copied verbatim-or-null/[]
//         (the C1 "never synthesized" posture; validate-what-you-consume,
//         SD-3). The constructed target is a plain frozen C1 record — no
//         store handles, no functions (J-6).

// ---- 12. Checkpoint G — regression, rollback, convergence, loop bridge ------

const ERR_INVALID_VERIFICATION = 'INVALID_VERIFICATION';
const ERR_INVALID_TRAIL = 'INVALID_TRAIL';
const ERR_INVALID_POLICY = 'INVALID_POLICY';
const VERIFICATION_STATUSES = Object.freeze(['SATISFIED', 'VIOLATED', 'UNVERIFIABLE']);
const REGRESSION_NO_BASELINE = 'NO_BASELINE';
const REGRESSION_UNMAPPED = 'UNMAPPED_STATUS_TRANSITION';
const ROLLBACK_NOT_TOP_OF_HISTORY = 'NOT_TOP_OF_HISTORY';
const ROLLBACK_UNDO_FAILED = 'UNDO_FAILED';
const CONVERGENCE_EMPTY_TRAIL = 'EMPTY_TRAIL';
const CONVERGENCE_NO_PATH = 'NO_CONVERGENCE_PATH';
const CONVERGENCE_MAX_ITERATIONS = 'MAX_ITERATIONS_REACHED';
const CONVERGENCE_NO_PROGRESS = 'NO_PROGRESS_THRESHOLD_REACHED';
const CONVERGENCE_OSCILLATION = 'ROLE_RECURRENCE';
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_NO_PROGRESS_THRESHOLD = 2;

/**
 * @typedef {Object} SemanticRegressionReport
 * @property {'IMPROVED'|'NO_CHANGE'|'REGRESSED'|'UNKNOWN'} status
 *   The comparison verdict (SG-1). UNKNOWN on a null baseline (first attempt)
 *   or an unmapped status transition — honest, never optimistic.
 * @property {string|null} reason
 *   null on the mapped verdicts; 'NO_BASELINE' (null preVerification) or
 *   'UNMAPPED_STATUS_TRANSITION' on UNKNOWN.
 * @property {string|null} preStatus
 *   The pre verification's status, verbatim; null on the null-baseline arm.
 * @property {string} postStatus
 *   The post verification's status, verbatim.
 * @property {string|null} preRole
 *   The pre verification's actualRole, verbatim; null on the null-baseline arm.
 * @property {string|null} postRole
 *   The post verification's actualRole, verbatim.
 */

/**
 * @typedef {Object} SemanticRollbackResult
 * @property {'ROLLED_BACK'|'REFUSED'} status
 *   ROLLED_BACK when the substrate's own undo completed for the attempt's
 *   transaction; REFUSED on a top-of-history refusal or an undo failure.
 * @property {string|null} reason
 *   null on ROLLED_BACK; 'NOT_TOP_OF_HISTORY' or 'UNDO_FAILED' on REFUSED
 *   (machine-only strings — deterministic, no substrate message leakage).
 * @property {string|null} transactionId
 *   The attempt's own transactionId on both arms (identifies the transaction
 *   that was rolled back or refused — never invented).
 */

/**
 * @typedef {Object} SemanticConvergenceVerdict
 * @property {'VERIFIED'|'NO_PROGRESS'|'OSCILLATION'|'MAX_ITERATIONS'|'TERMINATED'} verdict
 *   The convergence verdict (SG-3 order).
 * @property {string|null} reason
 *   null on VERIFIED; a deterministic machine string otherwise ('EMPTY_TRAIL',
 *   'MAX_ITERATIONS_REACHED', 'NO_PROGRESS_THRESHOLD_REACHED',
 *   'ROLE_RECURRENCE', 'NO_CONVERGENCE_PATH').
 * @property {number} iterationCount
 *   The trail length (the iteration count the verdict was computed over).
 */

/**
 * @typedef {Object} SemanticCorrectionAgenda
 * @property {SemanticCorrectionTarget} target
 *   The frozen C1 target (id = the diagnosis targetId; belief enrichment
 *   copied verbatim-or-null/[]).
 * @property {SemanticCorrectionDiagnosis} diagnosis
 *   The frozen C3 verdict (CORRECTABLE on a non-null agenda).
 * @property {boolean} isActionable
 *   true (the prompt-pinned host contract; a non-CORRECTABLE diagnosis
 *   returns null instead of a non-actionable agenda).
 * @property {string|null} refusalReason
 *   null (the diagnosis reason rides on the diagnosis record itself).
 */

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function verificationRecordError(v){
  if (!isPlainObject(v)){
    return 'a VerificationResult (Checkpoint F shape) is required — a plain object with status/actualRole';
  }
  if (!Object.prototype.hasOwnProperty.call(v, 'status') || !VERIFICATION_STATUSES.includes(v.status)){
    return `a VerificationResult status must be one of ${VERIFICATION_STATUSES.join('/')} (observed: ${JSON.stringify(v.status)})`;
  }
  if (!Object.prototype.hasOwnProperty.call(v, 'actualRole')){
    return "a VerificationResult must carry its 'actualRole' key (string|null — the F output shape)";
  }
  return null;
}

/** The §31 role recurrence: there exist i < j < k with role[i] === role[k] !== role[j]. */
function hasRoleRecurrence(roles){
  for (let i = 0; i < roles.length; i++){
    for (let j = i + 1; j < roles.length; j++){
      if (roles[j] === roles[i]) continue; // the middle must DIFFER
      for (let k = j + 1; k < roles.length; k++){
        if (roles[k] === roles[i]) return true;
      }
    }
  }
  return false;
}

// ---- 13. The regression detector (Checkpoint G Part 1) ----------------------

/**
 * Compare the pre-attempt and post-attempt verification verdicts and report
 * whether the correction improved, changed nothing, or regressed the semantic
 * state. PURE and deterministic (SG-1).
 *
 * @param {Object|null} preVerification The VerificationResult from BEFORE the
 *   attempt (null on the first attempt — no baseline).
 * @param {Object} postVerification The VerificationResult from AFTER the attempt.
 * @returns {SemanticRegressionReport} The frozen six-key record.
 */
export function detectSemanticRegression(preVerification, postVerification){
  const postMsg = verificationRecordError(postVerification);
  if (postMsg) throw new SemanticCorrectionError(ERR_INVALID_VERIFICATION, postMsg);
  if (preVerification !== null){
    const preMsg = verificationRecordError(preVerification);
    if (preMsg) throw new SemanticCorrectionError(ERR_INVALID_VERIFICATION, preMsg);
  }
  const postStatus = postVerification.status;
  const postRole = typeof postVerification.actualRole === 'string' ? postVerification.actualRole : null;
  if (preVerification === null){
    // The first attempt has no baseline: honest UNKNOWN, never IMPROVED.
    return deepFreeze({ status: 'UNKNOWN', reason: REGRESSION_NO_BASELINE, preStatus: null, postStatus, preRole: null, postRole });
  }
  const preStatus = preVerification.status;
  const preRole = typeof preVerification.actualRole === 'string' ? preVerification.actualRole : null;
  const improved = (preStatus === 'UNVERIFIABLE' || preStatus === 'VIOLATED') && postStatus === 'SATISFIED';
  const noChange = preStatus === postStatus;
  const regressed = preStatus === 'SATISFIED' && postStatus === 'VIOLATED';
  const status = improved ? 'IMPROVED' : (noChange ? 'NO_CHANGE' : (regressed ? 'REGRESSED' : 'UNKNOWN'));
  const reason = status === 'UNKNOWN' ? REGRESSION_UNMAPPED : null;
  return deepFreeze({ status, reason, preStatus, postStatus, preRole, postRole });
}

// ---- 14. The rollback surface (Checkpoint G Part 2, the §32 posture) --------

/**
 * Roll back ONE executed semantic correction attempt through the substrate's
 * OWN undo API, behind the house top-of-history ownership guard (SG-2 — the
 * correction.js:2675-2713 pattern; the engine never undoes a foreign
 * transaction). The substrate enforces the restore (snapshot inverse,
 * transaction.js:231-263); this function never re-implements undo and never
 * touches snapshots.
 *
 * @param {Object} attempt The ExecutionResult that was executed — only
 *   status 'EXECUTED' with a non-empty transactionId rolls back.
 * @param {Object} substrate { transactionManager } whose transactionManager
 *   carries undo() AND a historyManager with getTransactionToUndo() (the
 *   duck-typed top-of-history reader, disclosure 32).
 * @returns {SemanticRollbackResult} The frozen three-key record.
 */
export function rollbackSemanticCorrectionAttempt(attempt, substrate){
  // 1. Only a committed attempt with a named transaction can roll back.
  if (!isPlainObject(attempt)
      || !Object.prototype.hasOwnProperty.call(attempt, 'status') || attempt.status !== 'EXECUTED'
      || !Object.prototype.hasOwnProperty.call(attempt, 'transactionId') || !isNonEmptyString(attempt.transactionId)){
    throw new SemanticCorrectionError(ERR_INVALID_ATTEMPT, "rollbackSemanticCorrectionAttempt requires an ExecutionResult with status 'EXECUTED' and a non-empty transactionId — a FAILED attempt carried no commit, there is nothing to roll back");
  }
  // 2. The substrate must expose the undo AND the top-of-history reader (the
  //    house duck-type, correction.js:2686-2689).
  if (!isPlainObject(substrate)
      || !isPlainObject(substrate.transactionManager)
      || typeof substrate.transactionManager.undo !== 'function'
      || !isPlainObject(substrate.transactionManager.historyManager)
      || typeof substrate.transactionManager.historyManager.getTransactionToUndo !== 'function'){
    throw new SemanticCorrectionError(ERR_INVALID_SUBSTRATE, 'rollbackSemanticCorrectionAttempt requires an injected substrate whose transactionManager carries undo() and a historyManager with getTransactionToUndo() (duck-typed top-of-history check — the house disclosure-32 posture)');
  }
  // 3. Top-of-history ownership (correction.js:2691-2694): refuse a foreign
  //    transaction BEFORE any undo runs — a record here, not a throw (the
  //    prompt's REFUSED arm).
  const toUndo = substrate.transactionManager.historyManager.getTransactionToUndo();
  if (!toUndo || toUndo.id !== attempt.transactionId){
    return deepFreeze({ status: 'REFUSED', reason: ROLLBACK_NOT_TOP_OF_HISTORY, transactionId: attempt.transactionId });
  }
  // 4. The substrate's OWN undo, exactly once. A throw or a falsy return is a
  //    REFUSED record with a machine-only reason (H-6 determinism).
  let undone = null;
  let failure = null;
  try { undone = substrate.transactionManager.undo(); }
  catch (e){ failure = e; }
  if (failure !== null || !undone){
    return deepFreeze({ status: 'REFUSED', reason: ROLLBACK_UNDO_FAILED, transactionId: attempt.transactionId });
  }
  return deepFreeze({ status: 'ROLLED_BACK', reason: null, transactionId: attempt.transactionId });
}

// ---- 15. The convergence detector (Checkpoint G Part 3) ---------------------

/**
 * Read a chronological trail of verification verdicts and decide whether the
 * semantic correction loop has converged, stalled, oscillated, or exhausted
 * its budget. PURE and deterministic (SG-3).
 *
 * @param {Array<Object>} verificationTrail VerificationResult records in
 *   chronological order (may be empty).
 * @param {Object} [policy] { maxIterations: number, noProgressThreshold:
 *   number } — both required when present (finite, >= 1); defaults {5, 2}.
 * @returns {SemanticConvergenceVerdict} The frozen three-key record.
 */
export function detectSemanticConvergence(verificationTrail, policy){
  if (!Array.isArray(verificationTrail)){
    throw new SemanticCorrectionError(ERR_INVALID_TRAIL, 'detectSemanticConvergence requires an array of VerificationResult records (chronological order; possibly empty)');
  }
  for (let i = 0; i < verificationTrail.length; i++){
    const vMsg = verificationRecordError(verificationTrail[i]);
    if (vMsg) throw new SemanticCorrectionError(ERR_INVALID_TRAIL, `${vMsg} (trail[${i}])`);
  }
  let maxIterations = DEFAULT_MAX_ITERATIONS;
  let noProgressThreshold = DEFAULT_NO_PROGRESS_THRESHOLD;
  if (policy !== undefined){
    if (!isPlainObject(policy)
        || !Object.prototype.hasOwnProperty.call(policy, 'maxIterations') || !Object.prototype.hasOwnProperty.call(policy, 'noProgressThreshold')
        || !(typeof policy.maxIterations === 'number' && Number.isFinite(policy.maxIterations) && policy.maxIterations >= 1)
        || !(typeof policy.noProgressThreshold === 'number' && Number.isFinite(policy.noProgressThreshold) && policy.noProgressThreshold >= 1)){
      throw new SemanticCorrectionError(ERR_INVALID_POLICY, 'policy, when present, must be a plain object {maxIterations, noProgressThreshold} with both finite numbers >= 1 (no hidden defaults); omitted -> the {5, 2} defaults');
    }
    maxIterations = policy.maxIterations;
    noProgressThreshold = policy.noProgressThreshold;
  }
  const iterationCount = verificationTrail.length;
  if (iterationCount === 0){
    return deepFreeze({ verdict: 'TERMINATED', reason: CONVERGENCE_EMPTY_TRAIL, iterationCount });
  }
  const last = verificationTrail[iterationCount - 1];
  if (last.status === 'SATISFIED'){
    return deepFreeze({ verdict: 'VERIFIED', reason: null, iterationCount });
  }
  if (iterationCount >= maxIterations){
    return deepFreeze({ verdict: 'MAX_ITERATIONS', reason: CONVERGENCE_MAX_ITERATIONS, iterationCount });
  }
  if (iterationCount >= noProgressThreshold){
    const window = verificationTrail.slice(iterationCount - noProgressThreshold);
    const first = window[0];
    const same = window.every(v => v.status === first.status && v.actualRole === first.actualRole);
    if (same){
      return deepFreeze({ verdict: 'NO_PROGRESS', reason: CONVERGENCE_NO_PROGRESS, iterationCount });
    }
  }
  const roles = verificationTrail.map(v => (typeof v.actualRole === 'string' ? v.actualRole : null));
  if (hasRoleRecurrence(roles)){
    return deepFreeze({ verdict: 'OSCILLATION', reason: CONVERGENCE_OSCILLATION, iterationCount });
  }
  return deepFreeze({ verdict: 'TERMINATED', reason: CONVERGENCE_NO_PATH, iterationCount });
}

// ---- 16. The loop-bridge agenda (Checkpoint G Part 4, spec §50/§51) ---------

/**
 * Build the semantic correction agenda — the BRIDGE between this module and
 * the EXISTING correction engine (SG-4). Adds NO loop states and modifies no
 * engine file: a CORRECTABLE diagnosis yields a frozen data record the HOST
 * feeds into the existing engine; a non-CORRECTABLE diagnosis yields null so
 * the host falls through to the existing SEMANTIC_ERROR -> NO_CAPABILITY ->
 * UNFIXABLE terminal (correction.js:1397-1404, :3034-3036). The recipe wiring
 * into the engine is Checkpoint H (out of scope here).
 *
 * @param {Object} deviation An 11-key §13 semantic role deviation record (the
 *   D selector's input), optionally enriched with the host belief
 *   (confidence: number|null, evidence: array — validated when present,
 *   copied verbatim-or-null/[]).
 * @param {Object} objectFacts { geometryType, childCount, worldArea } — the
 *   caller-read facts (the D selector's input).
 * @returns {SemanticCorrectionAgenda|null} The frozen four-key record, or
 *   null when the diagnosis is NOT CORRECTABLE.
 */
export function buildSemanticCorrectionAgenda(deviation, objectFacts){
  const devMsg = deviationError(deviation);
  if (devMsg) throw new SemanticCorrectionError(ERR_INVALID_DEVIATION, devMsg);
  // The agenda's target must be serviceable by the E proposal builder: the C1
  // source contract is 'dev-<8hex>' (engine path) or 'smr-<8hex>' (host path).
  if (!/^(dev|smr)-[0-9a-f]{8}$/.test(deviation.id)){
    throw new SemanticCorrectionError(ERR_INVALID_DEVIATION, `deviation.id must be a content-derived 'dev-<8hex>' or 'smr-<8hex>' id for agenda construction (the C1 target.source contract; observed: ${JSON.stringify(deviation.id)})`);
  }
  // Optional belief enrichment (the C1 verbatim-or-null posture): validate
  // what this layer consumes, copy verbatim, never synthesize.
  let confidence = null;
  if (Object.prototype.hasOwnProperty.call(deviation, 'confidence')){
    const c = deviation.confidence;
    if (c !== null && !(typeof c === 'number' && Number.isFinite(c))){
      throw new SemanticCorrectionError(ERR_INVALID_DEVIATION, 'deviation.confidence, when present, must be null or a finite number (the verbatim-or-null C1 belief; never synthesized)');
    }
    confidence = c;
  }
  let evidence = [];
  if (Object.prototype.hasOwnProperty.call(deviation, 'evidence')){
    if (!Array.isArray(deviation.evidence)){
      throw new SemanticCorrectionError(ERR_INVALID_DEVIATION, 'deviation.evidence, when present, must be an array of evidence rows (the C1 frozen clone; defaults [] when upstream has none)');
    }
    evidence = cloneData(deviation.evidence);
  }
  // The D selector (validates both inputs; deterministic).
  const diagnosis = diagnoseSemanticDeviation(deviation, objectFacts);
  // NOT CORRECTABLE -> null: the host falls through to the existing engine
  // terminal. NO new loop state, NO engine modification (spec §50/§51).
  if (diagnosis.status !== STATUS_CORRECTABLE){
    return null;
  }
  const target = deepFreeze({
    id: diagnosis.targetId,
    objectId: deviation.objectId,
    currentRole: deviation.actual,
    targetRole: deviation.expected,
    confidence,
    evidence,
    source: deviation.id,
  });
  return deepFreeze({
    target,
    diagnosis,
    isActionable: true,
    refusalReason: null,
  });
}

// ==== Checkpoint H — design decisions (pinned here and in the K tests) =======
//
//   SH-1  The plan builder is the §50 recipe-wiring step, by INJECTION and
//         nothing more: correction.js is NOT touched (CATEGORY_TO_ROOT_CAUSE
//         keeps mapping SEMANTIC -> SEMANTIC_ERROR at correction.js:1305-1317
//         and CORRECTION_CAPABILITY_RECIPES keeps ZERO SEMANTIC_ERROR recipes
//         at correction.js:1328-1347 — the engine's honest NO_CAPABILITY
//         terminal stays the fall-through for every host that does not inject
//         the semantic layer). The host that DOES inject converts the
//         actionable agenda into an executable proposal HERE — one pure
//         function, no state machine change, no new loop states (spec §51),
//         no engine contact of any kind (the zero-import pin above stands).
//
//   SH-2  The plan id is content-derived 'scplan-<8hex>' = 'scplan-' +
//         fnv1a32(stableStringify({agendaId, proposalId})) over EXACTLY the
//         pair {agendaId: agenda.target.id, proposalId: proposal.id} — the
//         agenda's identity IS its target's sct- handle (the G record has no
//         other id), and the proposal id transitively binds the target, the
//         capability, the mutation, the prediction, the belief, and the
//         provenance (SE-5). Iteration is deliberately NOT an input (the
//         attempt transaction, not the plan, is the per-attempt record) —
//         the same agenda re-planned yields the SAME plan id.
//
//   SH-3  expectedRegression is the plan's DECLARED expectation, not a
//         measurement: a CORRECTABLE agenda's target carries currentRole !==
//         targetRole (the positional-pair match refuses coincident roles), so
//         the pre-state the deviation records is a measured VIOLATED baseline
//         and the proposal's declared effect is SATISFIED — the regression
//         table's IMPROVED arm (SG-1). IMPROVED is pinned {status:
//         'IMPROVED', reason: null}; the UNKNOWN arm ('NO_MEASURABLE_PRE_
//         DEVIATION') exists for a hostile handed agenda whose target roles
//         coincide — unreachable through the G agenda builder by construction,
//         reported honestly UNKNOWN rather than optimistically IMPROVED (the
//         SD-3 no-hidden-defaults posture). The REAL regression is measured
//         post-attempt by detectSemanticRegression — never assumed from the
//         plan.
//
//   SH-4  Validation layering: a malformed agenda refuses INVALID_AGENDA
//         (plain object + the four G keys + a non-empty string diagnosis.
//         capabilityId); a non-actionable agenda refuses NOT_ACTIONABLE (the
//         prompt's step-1 gate — a non-actionable agenda is the host's
//         fall-through signal, never a plan); an unknown capabilityId refuses
//         INVALID_CAPABILITY (the E registered-capability posture); the
//         handed target and facts are then re-validated by the E builder
//         itself (INVALID_TARGET / INVALID_OBJECT_FACTS surface unchanged —
//         the SE-6 handed-record posture). The output is the prompt-pinned
//         frozen four-key record; the agenda and the proposal ride VERBATIM
//         (both already frozen — no re-clone, no aliasing hazard: this layer
//         never writes).

// ---- 17. The plan builder (Checkpoint H Part 1, spec §50 integration) -------

const ERR_INVALID_AGENDA = 'INVALID_AGENDA';
const ERR_NOT_ACTIONABLE = 'NOT_ACTIONABLE';
const PLAN_UNKNOWN_PRE_DEVIATION = 'NO_MEASURABLE_PRE_DEVIATION';

/**
 * @typedef {Object} SemanticCorrectionPlan
 * @property {string} id
 *   Content-derived 'scplan-<8hex>' = 'scplan-' + fnv1a32(stableStringify({
 *     agendaId: agenda.target.id, proposalId: proposal.id
 *   })) (SH-2). Deterministic: the same agenda re-planned yields the SAME id.
 * @property {SemanticCorrectionAgenda} agenda
 *   The handed Checkpoint G agenda, VERBATIM (already frozen — this layer
 *   never writes).
 * @property {SemanticCorrectionProposal} proposal
 *   The frozen C4 proposal the E builder produced for the agenda's target —
 *   the ONE agenda->proposal conversion, and the execution path's direct
 *   input (executeSemanticCorrectionAttempt).
 * @property {{status: 'IMPROVED'|'UNKNOWN', reason: string|null}} expectedRegression
 *   The plan's DECLARED regression expectation (SH-3): IMPROVED for a
 *   measured deviation (VIOLATED-pre -> SATISFIED-post), UNKNOWN with
 *   'NO_MEASURABLE_PRE_DEVIATION' on the defensive coincident-roles arm.
 *   The REAL verdict is detectSemanticRegression's, post-attempt.
 */

/** @returns {string|null} a deterministic refusal message, or null when valid. */
function agendaRecordError(a){
  if (!isPlainObject(a)){
    return 'buildSemanticCorrectionPlan requires a plain-object SemanticCorrectionAgenda (the Checkpoint G record)';
  }
  for (const k of ['target', 'diagnosis', 'isActionable', 'refusalReason']){
    if (!Object.prototype.hasOwnProperty.call(a, k)){
      return `buildSemanticCorrectionPlan requires agenda.'${k}' explicitly (the G record; deterministic construction, no hidden defaults)`;
    }
  }
  if (!isPlainObject(a.diagnosis) || !isNonEmptyString(a.diagnosis.capabilityId)){
    return "agenda.diagnosis must carry a non-empty 'capabilityId' (the C3 verdict the plan grounds on)";
  }
  return null;
}

/** SH-2 identity: 'scplan-' over the {agendaId, proposalId} pair. */
function derivePlanId(content){
  return 'scplan-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

/**
 * Convert ONE actionable semantic correction agenda into ONE executable
 * SemanticCorrectionPlan — the spec §50 recipe-wiring step (Checkpoint H
 * Part 1, SH-1). The engine is never touched: the host that injects the
 * semantic layer calls this PURE function to obtain the proposal, then drives
 * the existing execution, verification, regression, rollback, and convergence
 * surfaces with it. correction.js keeps its ZERO SEMANTIC_ERROR recipes, so a
 * host without injection keeps the honest NO_CAPABILITY terminal.
 *
 * @param {Object} agenda The frozen SemanticCorrectionAgenda from
 *   buildSemanticCorrectionAgenda (the G record {target, diagnosis,
 *   isActionable, refusalReason}).
 * @param {Object} objectFacts { geometryType, childCount, worldArea,
 *   center? } — the caller-read facts (the E builder's input).
 * @returns {SemanticCorrectionPlan} The frozen four-key plan record.
 */
export function buildSemanticCorrectionPlan(agenda, objectFacts){
  const aMsg = agendaRecordError(agenda);
  if (aMsg) throw new SemanticCorrectionError(ERR_INVALID_AGENDA, aMsg);
  // Prompt step 1: only an actionable agenda may become a plan.
  if (agenda.isActionable !== true){
    throw new SemanticCorrectionError(ERR_NOT_ACTIONABLE, 'buildSemanticCorrectionPlan requires agenda.isActionable === true — a non-actionable agenda is the host fall-through signal, never a plan');
  }
  // Prompt step 2: look up the registered capability by the diagnosis'
  // capabilityId (the E registered-capability posture).
  const capability = SEMANTIC_CORRECTION_CAPABILITIES.find(c => c.id === agenda.diagnosis.capabilityId);
  if (!capability){
    throw new SemanticCorrectionError(ERR_INVALID_CAPABILITY, `no registered SEMANTIC_CORRECTION_CAPABILITIES entry named ${JSON.stringify(agenda.diagnosis.capabilityId)} — a plan without a registered capability is a construction breach`);
  }
  // Prompt step 3: the ONE agenda->proposal conversion. The E builder
  // re-validates the handed target and facts (INVALID_TARGET /
  // INVALID_OBJECT_FACTS surface unchanged — the SE-6 handed-record posture).
  const proposal = buildSemanticCorrectionProposal(agenda.target, capability, objectFacts);
  // SH-3: the declared regression expectation (never a measurement — the REAL
  // verdict is detectSemanticRegression's, post-attempt).
  const expectedRegression = agenda.target.currentRole !== agenda.target.targetRole
    ? { status: 'IMPROVED', reason: null }
    : { status: 'UNKNOWN', reason: PLAN_UNKNOWN_PRE_DEVIATION };
  // Prompt step 4: the frozen plan record (the agenda and the proposal ride
  // VERBATIM — both already frozen; this layer never writes).
  return deepFreeze({
    id: derivePlanId({ agendaId: agenda.target.id, proposalId: proposal.id }),
    agenda,
    proposal,
    expectedRegression,
  });
}
