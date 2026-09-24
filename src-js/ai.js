// ============================================================================
// src-js/ai.js — AI PLANNER + EXPECTED STATE (PHASE 3.13)
// ============================================================================
// CHECKPOINT A scope (spec §41-A): Intent / ExpectedState / Plan / PlanStep /
// PlanningContext types + validators + planning error codes, plus the
// mechanical builders the Planner core composes.
//
// CHECKPOINT B scope (spec §41-B): the deterministic
// Planner API — createExpectedState / createPlan / validatePlan /
// compilePlanToDSL — plus the create-intent planning rules A/B/C/D (spec
// §12/§17/§20) and the §24 Plan->DSL round-trip substrate mapping.
//
// CHECKPOINT C scope (spec §41-C, file section 7b): planning rules E/F/G/H —
// transform (T05/T06), appearance (T07), alignment (T08), structure (T10/
// T11) — over intents whose targets are EXISTING document objects resolved
// against the §13 snapshot (context.objects). Plan-level reference grammar
// gains its second kind: '$doc:<objectId>' beside '$stepId'.
//
// CHECKPOINT D scope (spec §41-D, file section 8): Tool Registry integration.
// Every PlanStep.toolId must resolve through the LIVE Tool Registry; tool
// category validation (read/proposal/mutation); step.input validation against
// the tool's DECLARED inputSchema; mutation tools may be planned but are
// NEVER executed during planning; the registry is READ-ONLY from the
// Planner's perspective.
//
// ARCHITECTURE BOUNDARY (spec R01/§13/§26):
//   - The module imports exactly ONE substrate module — createCoreToolRegistry
//     from src-js/tools.js — and reaches the registry only through a frozen
//     read-only projection {has, get, list}. register / unregister / execute /
//     validate are structurally ABSENT from the handle Planner code can
//     reach: the Planner can resolve and inspect tool metadata but can never
//     mutate the registry or execute a tool. The only mutation path stays:
//     Plan -> DSL/IR -> Tool Registry -> Mutation Tools -> Transaction ->
//     Commit (spec §01).
//   - No store references; no other mutation surface.
//   - PlanningContext is a deep-frozen plain-data snapshot; projections that
//     contain any function value are rejected at construction time, so the
//     context can never carry mutation methods.
//
// DETERMINISM (spec §16): this module contains no entropy sources of any kind.
// Plan and intent identifiers are content-derived: FNV-1a over a key-sorted
// canonical JSON serialization. Runtime IDs (objectIds, transactionIds) are
// allocated by the existing execution substrate, not by the Planner.
//
// House style: single-file module, compact functions, {valid, errors} result
// objects with {code, message, details?} error entries (mirrors dsl.js /
// tools.js validate functions).
// ============================================================================

// ---- 0. Live Tool Registry (read-only handle; spec §41-D) -------------------

// The single substrate import of this module. The core registry factory
// (tools.js:1001) returns a facade over the 20 deep-frozen tool definitions;
// creating it is deterministic and side-effect free.
import { createCoreToolRegistry } from './tools.js';

const LIVE_TOOL_REGISTRY = createCoreToolRegistry();

// The ONLY registry handle reachable from Planner code: a frozen read-only
// projection exposing has/get/list. execute / validate / register /
// unregister are structurally absent — the Planner resolves and inspects
// metadata, it never executes a tool and never mutates the registry
// (spec §41-D: "Mutation tools may be planned but MUST NOT execute during
// planning"; "Registry is read-only from the Planner's perspective").
const PLANNER_TOOL_REGISTRY = Object.freeze({
  has(id){ return LIVE_TOOL_REGISTRY.has(id); },
  get(id){ return LIVE_TOOL_REGISTRY.get(id); },
  list(){ return LIVE_TOOL_REGISTRY.list(); }
});

// Test/DI access to the read-only projection (also the default registry for
// validatePlan / createPlan). Callers may inject their own duck-typed
// {has, get, list} facade; the projection here stays immutable.
export function getPlannerRegistry(){ return PLANNER_TOOL_REGISTRY; }

// ---- 1. Planning error model (spec §14) ------------------------------------

export const PlanningErrorCodes = Object.freeze({
  INVALID_INTENT: 'INVALID_INTENT',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  UNSUPPORTED_OBJECT_TYPE: 'UNSUPPORTED_OBJECT_TYPE',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  NO_VALID_PLAN: 'NO_VALID_PLAN',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_INPUT_INVALID: 'TOOL_INPUT_INVALID',
  // Checkpoint D (§41-D), 12th code: a RESOLVED tool definition violates the
  // registry contract (unknown/missing category, missing/invalid declared
  // inputSchema, unsupported declared type). Unreachable with the live core
  // registry (all 20 definitions are well-formed); reachable via an injected
  // facade — fail loudly instead of validating against a broken contract.
  TOOL_REGISTRY_INVALID: 'TOOL_REGISTRY_INVALID',
  PLAN_INVALID: 'PLAN_INVALID',
  PLAN_NON_DETERMINISTIC: 'PLAN_NON_DETERMINISTIC',
  PLANNER_STATE_MUTATION: 'PLANNER_STATE_MUTATION'
});

export class PlanningError extends Error {
  constructor(code, message, details){
    super(message);
    this.name = 'PlanningError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function createError(code, message, details){
  const e = { code, message };
  if (details !== undefined) e.details = details;
  return e;
}

// ---- 2. Shared primitive guards + deterministic canonical form (§16) -------

function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNumber(v){ return typeof v === 'number' && Number.isFinite(v); }
function isNonEmptyString(v){ return typeof v === 'string' && v.length > 0; }
function isHexColor(v){ return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v); }

// Depth-first scan: returns the path of the first function value, or null.
function findFunctionPath(value, path){
  if (typeof value === 'function') return path || '(root)';
  if (Array.isArray(value)){
    for (let i = 0; i < value.length; i++){
      const hit = findFunctionPath(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)){
    for (const k of Object.keys(value)){
      const hit = findFunctionPath(value[k], `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function deepFreeze(value){
  if (isPlainObject(value) || Array.isArray(value)){
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

// Key-sorted serialization: identical logical content always yields an
// identical string, independent of property insertion order.
function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// FNV-1a, 32 bit. Pure integer arithmetic, no entropy, stable across engines.
function fnv1a32(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- 3. Intent model (spec §05/§07) -----------------------------------------

export const INTENT_CATEGORIES = Object.freeze(['create', 'transform', 'appearance', 'alignment', 'structure']);

// Canonical object types. The Intent surface uses the spec vocabulary
// ('rectangle' per §05/§07 examples); plan compilation later maps to the DSL
// create types 'rect' | 'ellipse' (dsl.js:365-372) and registry tools
// T01 create_rectangle / T02 create_ellipse (tools.js:227/:251, spec §11).
const OBJECT_TYPES = Object.freeze({ rectangle: 'rect', rect: 'rect', ellipse: 'ellipse' });

export function normalizeObjectType(objectType){
  return OBJECT_TYPES[objectType] || null;
}

const CREATE_RECT_KEYS = ['type', 'objectType', 'width', 'height', 'rx', 'ry', 'fill', 'opacity', 'placement', 'x', 'y'];
const CREATE_ELLIPSE_KEYS = ['type', 'objectType', 'rx', 'ry', 'fill', 'opacity', 'placement', 'x', 'y'];
const ALIGN_H = ['left', 'center', 'right'];
const ALIGN_V = ['top', 'middle', 'bottom'];

function rejectUnknownKeys(intent, keys, errors){
  for (const k of Object.keys(intent)){
    if (!keys.includes(k)) errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Unknown intent field ${k}`, { field: k }));
  }
}

function requirePositiveFinite(intent, field, errors){
  if (!(field in intent)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, `Intent field ${field} is required`, { field }));
    return;
  }
  const v = intent[field];
  if (!isFiniteNumber(v) || v <= 0){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field ${field} must be a finite number > 0`, { field, value: v }));
  }
}

function optionalNonNegativeFinite(intent, field, errors){
  if (!(field in intent)) return;
  const v = intent[field];
  if (!isFiniteNumber(v) || v < 0){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field ${field} must be a finite number >= 0`, { field, value: v }));
  }
}

function optionalFiniteCoord(intent, field, errors){
  if (!(field in intent)) return;
  if (!isFiniteNumber(intent[field])){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field ${field} must be a finite number`, { field, value: intent[field] }));
  }
}

function optionalColor(intent, field, errors){
  if (!(field in intent)) return;
  if (!isHexColor(intent[field])){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field ${field} must be a hex color like #RRGGBB or #RGB`, { field, value: intent[field] }));
  }
}

function optionalRatio(intent, field, errors){
  if (!(field in intent)) return;
  const v = intent[field];
  if (!isFiniteNumber(v) || v < 0 || v > 1){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field ${field} must be a finite number in [0,1]`, { field, value: v }));
  }
}

function requireTargets(intent, errors){
  if (!('targets' in intent) || intent.targets === undefined){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field targets is required', { field: 'targets' }));
    return;
  }
  if (!Array.isArray(intent.targets) || intent.targets.length === 0 || !intent.targets.every(isNonEmptyString)){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'Intent field targets must be a non-empty array of strings', { field: 'targets' }));
  }
}

function validateCreateIntent(intent, errors){
  const canonical = isNonEmptyString(intent.objectType) ? normalizeObjectType(intent.objectType) : null;
  rejectUnknownKeys(intent, canonical === 'ellipse' ? CREATE_ELLIPSE_KEYS : CREATE_RECT_KEYS, errors);
  if (!isNonEmptyString(intent.objectType)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field objectType is required', { field: 'objectType' }));
    return;
  }
  if (!canonical){
    errors.push(createError(PlanningErrorCodes.UNSUPPORTED_OBJECT_TYPE, `Unsupported objectType ${intent.objectType}`, { objectType: intent.objectType }));
    return;
  }
  if (canonical === 'rect'){
    requirePositiveFinite(intent, 'width', errors);
    requirePositiveFinite(intent, 'height', errors);
    optionalNonNegativeFinite(intent, 'rx', errors);
    optionalNonNegativeFinite(intent, 'ry', errors);
  } else {
    // ellipse: rx/ry are radii (T02 schema tools.js:251 requires rx/ry > 0)
    requirePositiveFinite(intent, 'rx', errors);
    requirePositiveFinite(intent, 'ry', errors);
  }
  optionalColor(intent, 'fill', errors);
  optionalRatio(intent, 'opacity', errors);
  if ('placement' in intent && !['center', 'origin'].includes(intent.placement)){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Intent field placement must be 'center' or 'origin'`, { field: 'placement', value: intent.placement }));
  }
  if (intent.placement === 'origin'){
    optionalFiniteCoord(intent, 'x', errors);
    optionalFiniteCoord(intent, 'y', errors);
  }
}

function validateTransformIntent(intent, errors){
  rejectUnknownKeys(intent, ['type', 'targets', 'operation', 'params'], errors);
  requireTargets(intent, errors);
  if (!isNonEmptyString(intent.operation)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field operation is required', { field: 'operation' }));
    return;
  }
  const p = intent.params;
  if (intent.operation === 'translate'){
    if (!isPlainObject(p) || !('x' in p) || !('y' in p)){
      errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'translate requires params {x, y}', { field: 'params' }));
      return;
    }
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'translate params x/y must be finite numbers', { params: p }));
    }
  } else if (intent.operation === 'scale'){
    if (!isPlainObject(p) || !('x' in p) || !('y' in p)){
      errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'scale requires params {x, y}', { field: 'params' }));
      return;
    }
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y) || p.x === 0 || p.y === 0){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'scale factors must be finite and non-zero', { params: p }));
    }
  } else if (intent.operation === 'rotate'){
    if (!isPlainObject(p) || !('degrees' in p)){
      errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'rotate requires params {degrees}', { field: 'params' }));
      return;
    }
    if (!isFiniteNumber(p.degrees)){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'rotate degrees must be a finite number', { params: p }));
    }
  } else if (intent.operation === 'matrix'){
    if (!isPlainObject(p)){
      errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'matrix requires params {a,b,c,d,tx,ty}', { field: 'params' }));
      return;
    }
    for (const f of ['a', 'b', 'c', 'd', 'tx', 'ty']){
      if (!isFiniteNumber(p[f])) errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `matrix.${f} must be a finite number`, { field: f }));
    }
    if ([p.a, p.b, p.c, p.d].every(isFiniteNumber) && Math.abs(p.a * p.d - p.b * p.c) < 1e-12){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'matrix is singular', { determinant: p.a * p.d - p.b * p.c }));
    }
  } else {
    errors.push(createError(PlanningErrorCodes.UNSUPPORTED_OPERATION, `Unsupported transform operation ${intent.operation}`, { operation: intent.operation }));
  }
}

function validateAppearanceIntent(intent, errors){
  rejectUnknownKeys(intent, ['type', 'targets', 'fill', 'opacity'], errors);
  requireTargets(intent, errors);
  if (!('fill' in intent) && !('opacity' in intent)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'appearance intent requires fill and/or opacity', { fields: ['fill', 'opacity'] }));
  }
  optionalColor(intent, 'fill', errors);
  optionalRatio(intent, 'opacity', errors);
}

function validateAlignmentIntent(intent, errors){
  rejectUnknownKeys(intent, ['type', 'targets', 'axis', 'mode'], errors);
  requireTargets(intent, errors);
  if (!isNonEmptyString(intent.axis)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field axis is required', { field: 'axis' }));
    return;
  }
  if (!['horizontal', 'vertical', 'both'].includes(intent.axis)){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Invalid alignment axis ${intent.axis}`, { axis: intent.axis }));
    return;
  }
  if (!isNonEmptyString(intent.mode)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field mode is required', { field: 'mode' }));
    return;
  }
  const modeOk = intent.axis === 'horizontal' ? ALIGN_H.includes(intent.mode)
    : intent.axis === 'vertical' ? ALIGN_V.includes(intent.mode)
    : ALIGN_H.concat(ALIGN_V).includes(intent.mode);
  if (!modeOk){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `Invalid alignment mode ${intent.mode} for axis ${intent.axis}`, { axis: intent.axis, mode: intent.mode }));
  }
}

function validateStructureIntent(intent, errors){
  rejectUnknownKeys(intent, ['type', 'operation', 'targets'], errors);
  if (!isNonEmptyString(intent.operation)){
    errors.push(createError(PlanningErrorCodes.MISSING_PARAMETER, 'Intent field operation is required', { field: 'operation' }));
    return;
  }
  if (!['group', 'ungroup'].includes(intent.operation)){
    errors.push(createError(PlanningErrorCodes.UNSUPPORTED_OPERATION, `Unsupported structure operation ${intent.operation}`, { operation: intent.operation }));
    return;
  }
  requireTargets(intent, errors);
}

// Validates a structured Intent (spec §07). Deterministic: identical input
// always yields an identical {valid, errors} result.
export function validateIntent(intent){
  if (!isPlainObject(intent)) return { valid: false, errors: [createError(PlanningErrorCodes.INVALID_INTENT, 'Intent must be a plain object')] };
  if (!isNonEmptyString(intent.type)) return { valid: false, errors: [createError(PlanningErrorCodes.INVALID_INTENT, 'Intent.type is required')] };
  if (!INTENT_CATEGORIES.includes(intent.type)){
    return { valid: false, errors: [createError(PlanningErrorCodes.UNSUPPORTED_OPERATION, `Unsupported intent type ${intent.type}`, { type: intent.type })] };
  }
  const errors = [];
  if (intent.type === 'create') validateCreateIntent(intent, errors);
  else if (intent.type === 'transform') validateTransformIntent(intent, errors);
  else if (intent.type === 'appearance') validateAppearanceIntent(intent, errors);
  else if (intent.type === 'alignment') validateAlignmentIntent(intent, errors);
  else validateStructureIntent(intent, errors);
  return { valid: errors.length === 0, errors };
}

// ---- 4. ExpectedState (spec §08/§09) ----------------------------------------

// Mechanical derivation of the REQUESTED state from a validated intent.
// §09: ExpectedState is descriptive, NOT canonical document state; the Planner
// must not pretend it is already true — hence the status marker below. The
// Critic (future phase) is the component that compares requested vs measured.
export function buildExpectedState(intent){
  const check = validateIntent(intent);
  if (!check.valid){
    throw new PlanningError(PlanningErrorCodes.INVALID_INTENT, 'buildExpectedState requires a valid intent', check.errors);
  }
  const intentId = 'intent-' + fnv1a32(stableStringify(intent));
  const es = {
    intentId,
    status: 'requested',
    geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
    spatial: { aligned: null, centered: null, bbox: null },
    appearance: { fill: null, stroke: null, opacity: null },
    constraint: { satisfied: null },
    structure: { grouped: null }
  };
  if (intent.type === 'create'){
    const canonical = normalizeObjectType(intent.objectType);
    if (canonical === 'rect'){
      es.geometry.width = intent.width;
      es.geometry.height = intent.height;
      es.geometry.rx = intent.rx ?? 0;
      es.geometry.ry = intent.ry ?? 0;
      es.geometry.area = intent.width * intent.height;
      es.geometry.symmetric = es.geometry.rx === es.geometry.ry;
    } else {
      es.geometry.rx = intent.rx;
      es.geometry.ry = intent.ry;
      es.geometry.area = Math.PI * intent.rx * intent.ry;
      es.geometry.symmetric = intent.rx === intent.ry;
    }
    es.spatial.centered = intent.placement === 'center';
    es.structure.grouped = false;
    es.appearance.fill = intent.fill ?? null;
    es.appearance.opacity = intent.opacity ?? null;
  } else if (intent.type === 'appearance'){
    es.appearance.fill = intent.fill ?? null;
    es.appearance.opacity = intent.opacity ?? null;
  } else if (intent.type === 'alignment'){
    es.spatial.aligned = true;
  } else if (intent.type === 'structure'){
    es.structure.grouped = intent.operation === 'group';
  }
  // transform: sections stay null — the geometry outcome depends on execution.
  return es;
}

const EXPECTED_STATE_SECTIONS = ['geometry', 'spatial', 'appearance', 'constraint', 'structure'];

export function validateExpectedState(state){
  const errors = [];
  if (!isPlainObject(state)) return { valid: false, errors: [createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState must be a plain object')] };
  const fnPath = findFunctionPath(state, 'state');
  if (fnPath) return { valid: false, errors: [createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState must be plain data; function value at ${fnPath}`)] };
  for (const section of EXPECTED_STATE_SECTIONS){
    if (!isPlainObject(state[section])){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.${section} section missing or invalid`, { section }));
    }
  }
  if (errors.length > 0) return { valid: false, errors };
  if (state.status !== 'requested' && state.status !== 'measured'){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.status must be 'requested' or 'measured'`, { status: state.status }));
  }
  if (state.intentId !== undefined && !isNonEmptyString(state.intentId)){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.intentId must be a non-empty string when present'));
  }
  const g = state.geometry;
  for (const f of ['width', 'height', 'rx', 'ry', 'area']){
    if (g[f] !== null && g[f] !== undefined && !isFiniteNumber(g[f])){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.geometry.${f} must be null or a finite number`, { field: f, value: g[f] }));
    }
  }
  if (g.symmetric !== null && g.symmetric !== undefined && typeof g.symmetric !== 'boolean'){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.geometry.symmetric must be null or boolean'));
  }
  const sp = state.spatial;
  for (const f of ['aligned', 'centered']){
    if (sp[f] !== null && sp[f] !== undefined && typeof sp[f] !== 'boolean'){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.spatial.${f} must be null or boolean`));
    }
  }
  if (sp.bbox !== null && sp.bbox !== undefined){
    if (!isPlainObject(sp.bbox)) errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.spatial.bbox must be null or a plain object'));
    else for (const f of ['minX', 'minY', 'maxX', 'maxY']){
      if (!isFiniteNumber(sp.bbox[f])) errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.spatial.bbox.${f} must be a finite number`));
    }
  }
  const ap = state.appearance;
  for (const f of ['fill', 'stroke']){
    if (ap[f] !== null && ap[f] !== undefined && !isHexColor(ap[f])){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, `ExpectedState.appearance.${f} must be null or a hex color`));
    }
  }
  if (ap.opacity !== null && ap.opacity !== undefined && (!isFiniteNumber(ap.opacity) || ap.opacity < 0 || ap.opacity > 1)){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.appearance.opacity must be null or a number in [0,1]'));
  }
  if (state.constraint.satisfied !== null && state.constraint.satisfied !== undefined){
    const satisfied = state.constraint.satisfied;
    // PHASE 3.16: the evaluable form is the compliance request
    // {records: [...], tolerance?} — the accepted constraint regime declared
    // as the desired state; a bare boolean stays the 3.14 unevaluated marker.
    const ok = typeof satisfied === 'boolean' ||
      (isPlainObject(satisfied) && Array.isArray(satisfied.records));
    if (!ok){
      errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.constraint.satisfied must be null, boolean, or a compliance request {records: [...], tolerance?}'));
    }
  }
  if (state.structure.grouped !== null && state.structure.grouped !== undefined && typeof state.structure.grouped !== 'boolean'){
    errors.push(createError(PlanningErrorCodes.INVALID_PARAMETER, 'ExpectedState.structure.grouped must be null or boolean'));
  }
  return { valid: errors.length === 0, errors };
}

// ---- 5. Plan / PlanStep (spec §10) ------------------------------------------

export function makePlanStep(id, toolId, input){
  return { id, toolId, input };
}

// Mechanical Plan assembly. Identifiers are content-derived (§16): the plan id
// hashes {intentId, steps, expectedState}; the intentId hashes the intent.
// Full rule-driven plan construction is Checkpoint B (spec §41-B).
export function makePlan({ intent, steps, expectedState, parentPlanId }){
  const resolvedIntentId = 'intent-' + fnv1a32(stableStringify(intent));
  return {
    id: 'plan-' + fnv1a32(stableStringify({ intentId: resolvedIntentId, steps, expectedState })),
    intentId: resolvedIntentId,
    steps,
    expectedState,
    deterministic: true,
    parentPlanId: parentPlanId ?? null
  };
}

export function validatePlanStep(step){
  const errors = [];
  if (!isPlainObject(step)) return { valid: false, errors: [createError(PlanningErrorCodes.PLAN_INVALID, 'PlanStep must be a plain object')] };
  if (findFunctionPath(step, 'step')) return { valid: false, errors: [createError(PlanningErrorCodes.PLAN_INVALID, 'PlanStep must be plain data')] };
  if (!isNonEmptyString(step.id)) errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'PlanStep.id must be a non-empty string', { field: 'id' }));
  if (!isNonEmptyString(step.toolId)) errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'PlanStep.toolId must be a non-empty string', { field: 'toolId' }));
  if (!isPlainObject(step.input)) errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'PlanStep.input must be a plain object', { field: 'input' }));
  return { valid: errors.length === 0, errors };
}

// STRUCTURAL plan validation (spec §18 subset assigned to Checkpoint A):
// Plan ID, Intent ID, step shape, ExpectedState shape, determinism flag.
// Tool existence / category / input-schema / dependency-reference validation
// arrives with Checkpoints B and D (spec §41-B/§41-D) via the real registry.
export function validatePlanStructure(plan){
  const errors = [];
  if (!isPlainObject(plan)) return { valid: false, errors: [createError(PlanningErrorCodes.PLAN_INVALID, 'Plan must be a plain object')] };
  if (findFunctionPath(plan, 'plan')) return { valid: false, errors: [createError(PlanningErrorCodes.PLAN_INVALID, 'Plan must be plain data')] };
  if (!isNonEmptyString(plan.id)) errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'Plan.id must be a non-empty string', { field: 'id' }));
  if (!isNonEmptyString(plan.intentId)) errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'Plan.intentId must be a non-empty string (§18: Intent ID)', { field: 'intentId' }));
  if (!Array.isArray(plan.steps) || plan.steps.length === 0){
    errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'Plan.steps must be a non-empty array (§10)', { field: 'steps' }));
  } else {
    for (let i = 0; i < plan.steps.length; i++){
      const s = validatePlanStep(plan.steps[i]);
      if (!s.valid){
        for (const e of s.errors) errors.push(createError(e.code, `step[${i}]: ${e.message}`, e.details));
      }
    }
  }
  if (plan.expectedState === undefined || !validateExpectedState(plan.expectedState).valid){
    errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'Plan.expectedState must be a valid ExpectedState (§08)', { field: 'expectedState' }));
  }
  if (plan.deterministic !== true){
    errors.push(createError(PlanningErrorCodes.PLAN_NON_DETERMINISTIC, 'Plan.deterministic must be true (§16)', { field: 'deterministic' }));
  }
  if (plan.parentPlanId !== null && plan.parentPlanId !== undefined && !isNonEmptyString(plan.parentPlanId)){
    errors.push(createError(PlanningErrorCodes.PLAN_INVALID, 'Plan.parentPlanId must be null or a non-empty string', { field: 'parentPlanId' }));
  }
  return { valid: errors.length === 0, errors };
}

// ---- 6. PlanningContext (spec §13) ------------------------------------------

// Read-only snapshot container. The projection MUST be plain data (plain
// objects / arrays / primitives). Any function value — including store methods
// such as write/execute/add — is rejected at construction time, so the context
// can never expose a mutation method to the Planner. The result is deep-frozen.
export function createPlanningContext(projection){
  if (!isPlainObject(projection)){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'PlanningContext projection must be a plain object');
  }
  const fnPath = findFunctionPath(projection, 'context');
  if (fnPath){
    throw new PlanningError(
      PlanningErrorCodes.INVALID_PARAMETER,
      `PlanningContext must be a plain-data read-only snapshot (§13); function value found at ${fnPath}`,
      { path: fnPath }
    );
  }
  return deepFreeze(JSON.parse(JSON.stringify(projection)));
}

// ---- 7. Planner core (spec §15/§16/§17/§18/§20/§23/§24; §41-B) --------------

// §13 enforcement at the API boundary: a provided context must be a deeply
// frozen plain-data snapshot (as produced by createPlanningContext). A plain
// mutable object is rejected so the Planner can never receive (or reach
// through) a live mutation surface. context === undefined is allowed at
// Checkpoint B; the registry-backed checkpoints (D) will consume it.
function isDeepFrozen(value){
  if (value === null || typeof value !== 'object') return true; // primitives are immutable
  if (!Object.isFrozen(value)) return false;
  for (const k of Object.keys(value)){
    if (!isDeepFrozen(value[k])) return false;
  }
  return true;
}

function requirePlanningContext(context){
  if (context === undefined) return null;
  if (!isPlainObject(context) || !isDeepFrozen(context)){
    throw new PlanningError(
      PlanningErrorCodes.INVALID_PARAMETER,
      'context must be a frozen read-only PlanningContext (spec §13); create it with createPlanningContext()'
    );
  }
  return context;
}

// The artboard is absent from the canonical stores today (user-approved
// deviation 3), so a placement:'center' intent takes its geometry from the
// context snapshot. Field names follow spec §20 vocabulary: centerX / centerY.
function readArtboardCenter(context){
  const artboard = context ? context.artboard : undefined;
  if (!isPlainObject(artboard)){
    throw new PlanningError(
      PlanningErrorCodes.MISSING_PARAMETER,
      "placement 'center' requires an artboard snapshot in the PlanningContext: context.artboard {width, height, centerX, centerY} (spec §20)",
      { field: 'artboard' }
    );
  }
  if (!isFiniteNumber(artboard.centerX) || !isFiniteNumber(artboard.centerY)){
    throw new PlanningError(
      PlanningErrorCodes.INVALID_PARAMETER,
      'context.artboard.centerX/centerY must be finite numbers',
      { centerX: artboard.centerX, centerY: artboard.centerY }
    );
  }
  return { x: artboard.centerX, y: artboard.centerY };
}

// placement 'origin' (or absent): explicit x/y with origin semantics.
function resolveOriginXY(intent){
  const x = intent.x ?? 0;
  const y = intent.y ?? 0;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)){
    throw new PlanningError(
      PlanningErrorCodes.INVALID_PARAMETER,
      'Intent x/y must be finite numbers',
      { x, y }
    );
  }
  return { x, y };
}

// Planning rules A/B/C/D for create intents (spec §12/§17/§20).
// Rule A: create supported primitives through the existing creation tools.
// Rule B: placement 'center' becomes an alignment operation (T08) AND is
//   resolved at plan time via artboard-aware coordinates (user-approved
//   deviation 3; deterministic + testable, Planner stays read-only).
// Rule C: create-with-fill decomposes T01 -> T07; the creation tool input is
//   GEOMETRY ONLY (no fill, no opacity key).
// Rule D: rounded-rectangle rx/ry pass through to the creation tool.
function buildCreatePlanSteps(intent, context){
  const canonical = normalizeObjectType(intent.objectType);
  let px, py;
  if (intent.placement === 'center'){
    if (intent.x !== undefined || intent.y !== undefined){
      throw new PlanningError(
        PlanningErrorCodes.INVALID_PARAMETER,
        "Intent x/y conflict with placement:'center' — the Planner computes placement from the artboard",
        { fields: ['x', 'y'] }
      );
    }
    const c = readArtboardCenter(context);
    // Anchor semantics follow the target creation tool: T01 rect x/y is the
    // top-left corner (geometry.js:18 rectBBox: maxX = x + width), T02
    // ellipse cx/cy is the center (geometry.js:27 ellipseBBox).
    if (canonical === 'rect'){
      px = c.x - intent.width / 2;
      py = c.y - intent.height / 2;
    } else {
      px = c.x;
      py = c.y;
    }
  } else {
    const o = resolveOriginXY(intent);
    px = o.x;
    py = o.y;
  }
  // Rule A/D — creation step, geometry only.
  const createStep = canonical === 'rect'
    ? makePlanStep('step-1', 'T01', { x: px, y: py, width: intent.width, height: intent.height, rx: intent.rx ?? 0, ry: intent.ry ?? 0 })
    : makePlanStep('step-1', 'T02', { cx: px, cy: py, rx: intent.rx, ry: intent.ry });
  const steps = [createStep];
  // Rule C — fill is delivered through T07 and NEVER inside the creation tool
  // input. The step input uses the real T07 contract (user-approved deviation
  // 1): {objectIds, fill:{kind:'solid', color}, opacity}. '$stepId' strings
  // are plan-internal dependency references ("output of step <stepId>");
  // compilePlanToDSL strips the '$' and the DSL layer resolves them to the
  // runtime object ids (dsl.js:591-594 binding + :547-564 resolution).
  if (intent.fill !== undefined){
    const fillInput = { objectIds: ['$step-1'], fill: { kind: 'solid', color: intent.fill } };
    if (intent.opacity !== undefined) fillInput.opacity = intent.opacity;
    steps.push(makePlanStep('step-2', 'T07', fillInput));
  } else if (intent.opacity !== undefined){
    // Honest refusal (spec §14): T07 opacity-only requires an existing fill
    // item on the target (tools.js:377) — on a freshly created object it can
    // never succeed, so emitting the plan would be a doomed plan.
    throw new PlanningError(
      PlanningErrorCodes.NO_VALID_PLAN,
      'create with opacity but no fill cannot produce an executable plan: T07 opacity-only requires an existing fill item on the fresh object',
      { toolId: 'T07' }
    );
  }
  // Rule B/G — the §20-mandated T08 alignment step for center placement.
  if (intent.placement === 'center'){
    steps.push(makePlanStep(`step-${steps.length + 1}`, 'T08', { objectIds: ['$step-1'], axis: 'both', mode: 'center' }));
  }
  return steps;
}

// ---- 7b. Planning rules E/F/G/H (spec §17-E..H; §41-C) ----------------------

// Checkpoint C target model: transform / appearance / alignment / structure
// intents operate on objects that ALREADY EXIST. The only honest source for
// those identities is the §13 PlanningContext snapshot. Minimal contract:
// context.objects is a plain object whose KEYS are the known object ids
// (values are read-only per-object projections the Planner never interprets).
// Plan steps reference such objects as '$doc:<objectId>' — the second kind of
// plan-level reference beside '$stepId' (output of an earlier step). The
// grammar stays uniform: EVERY objectIds entry is a '$'-reference; the prefix
// selects the kind. (Step ids named 'doc:*' are reserved by this convention.)

// The objects snapshot is required with own-property (prototype-safe) reads.
function objectsSnapshotOf(context, intentType){
  if (!context || !isPlainObject(context.objects)){
    throw new PlanningError(
      PlanningErrorCodes.MISSING_PARAMETER,
      `planning '${intentType}' intents requires a PlanningContext snapshot carrying context.objects (plain object map of known object ids; spec §13)`,
      { field: 'context.objects' }
    );
  }
  return context.objects;
}

// Resolve intent.targets to '$doc:' plan references. Deterministic and strict:
// an unknown target is INVALID_PARAMETER (the Planner never guesses object
// identities — §24 analog for existing objects), a duplicate target is
// INVALID_PARAMETER (it would double-apply the operation).
function resolveDocRefs(intent, context){
  const objects = objectsSnapshotOf(context, intent.type);
  const seen = new Set();
  const refs = [];
  for (const t of intent.targets){
    if (!isNonEmptyString(t) || !Object.prototype.hasOwnProperty.call(objects, t)){
      throw new PlanningError(
        PlanningErrorCodes.INVALID_PARAMETER,
        `intent target '${t}' not found in PlanningContext.objects — the Planner never guesses object identities (spec §13)`,
        { field: 'targets', value: t }
      );
    }
    if (seen.has(t)){
      throw new PlanningError(
        PlanningErrorCodes.INVALID_PARAMETER,
        `duplicate intent target '${t}' — a duplicated target would double-apply the operation`,
        { field: 'targets', value: t }
      );
    }
    seen.add(t);
    refs.push('$doc:' + t);
  }
  return refs;
}

// Rule E — Transform (§17-E: "Use existing transform-capable tools").
// translate -> T05 move_object (tools.js:308-325, parametric translation,
// delta must be a finite Vec2 per tools.js:312). scale / rotate / matrix ->
// T06 transform_objects (tools.js:327-345) with the affine matrix RESOLVED AT
// PLAN TIME, mirroring the substrate's own transform compilation exactly
// (dsl.js:415-433): scale -> diagonal matrix (dsl.js:420-424), rotate ->
// origin rotation with tx/ty = 0 (dsl.js:425-428). No invented transform
// semantics; determinism holds because the same expressions run on the same
// engine for identical inputs (§16).
function buildTransformPlanSteps(intent, context){
  const refs = resolveDocRefs(intent, context);
  const p = intent.params;
  let toolId, input;
  if (intent.operation === 'translate'){
    toolId = 'T05';
    input = { objectIds: refs, delta: { x: p.x, y: p.y } };
  } else {
    toolId = 'T06';
    let m;
    if (intent.operation === 'scale'){
      m = { a: p.x, b: 0, c: 0, d: p.y, tx: 0, ty: 0 };
    } else if (intent.operation === 'rotate'){
      const rad = (p.degrees * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      m = { a: c, b: s, c: -s, d: c, tx: 0, ty: 0 };
    } else {
      m = { a: p.a, b: p.b, c: p.c, d: p.d, tx: p.tx, ty: p.ty };
    }
    input = { objectIds: refs, transform: m };
  }
  return [makePlanStep('step-1', toolId, input)];
}

// Rule F — Appearance (§17-F: appearance tools, never appearance keys inside
// creation input). Fill/opacity go through T07 apply_fill (tools.js:347+).
// The T07 TOOL is array-capable, but the DSL appearance op is single-target
// (dsl.js:113-116 requires `target`), so a multi-target appearance intent
// decomposes into ONE T07 step PER target — the Plan->DSL mapping stays
// lossless. Opacity-only on an EXISTING object is plannable (unlike create:
// the T07 fill-item precondition, tools.js:377, is a tool-level check against
// live document state and CAN succeed here — approved decision (a) scope was
// create-only).
function buildAppearancePlanSteps(intent, context){
  const refs = resolveDocRefs(intent, context);
  return refs.map((ref, i) => {
    const input = { objectIds: [ref] };
    if (intent.fill !== undefined) input.fill = { kind: 'solid', color: intent.fill };
    if (intent.opacity !== undefined) input.opacity = intent.opacity;
    return makePlanStep(`step-${i + 1}`, 'T07', input);
  });
}

// Rule G — Alignment (§17-G: center/alignment operations resolve to T08
// align_objects, tools.js:389). One step for ALL targets: both the T08 tool
// (objectIds >= 1) and the DSL align op (targets >= 1, dsl.js:139-142/:281)
// are array-capable. Single-target align is the documented no-op success
// (tools.js:393-395). Axis/mode legality was enforced by validateIntent with
// the same tables as T08 validate (tools.js:399-402).
function buildAlignmentPlanSteps(intent, context){
  const refs = resolveDocRefs(intent, context);
  return [makePlanStep('step-1', 'T08', { objectIds: refs, axis: intent.axis, mode: intent.mode })];
}

// Rule H — Structure (§17-H: group/ungroup must resolve to the existing
// registry tools T10 group_objects (tools.js:488-513) / T11 ungroup_objects
// (tools.js:515+)). A group of fewer than 2 targets can never succeed (T10
// validate 'objectIds >=2' tools.js:490; DSL dsl.js:118/:278) -> NO_VALID_PLAN
// (user-approved decision (a): a plan that cannot succeed must not be
// produced). The DSL ungroup op is single-target (dsl.js:121/:279), so a
// multi-target ungroup intent decomposes into per-target T11 steps — lossless
// Plan->DSL mapping. T11 inputs are GROUP NODE ids (tools.js:517-525);
// node-level preconditions are tool-level (Checkpoint D / execution) — the
// Planner's snapshot contract is id-existence.
function buildStructurePlanSteps(intent, context){
  const refs = resolveDocRefs(intent, context);
  if (intent.operation === 'group'){
    if (refs.length < 2){
      throw new PlanningError(
        PlanningErrorCodes.NO_VALID_PLAN,
        `group with ${refs.length} target(s) cannot produce an executable plan: T10 requires objectIds >= 2 (tools.js:490)`,
        { toolId: 'T10', targets: intent.targets }
      );
    }
    return [makePlanStep('step-1', 'T10', { objectIds: refs })];
  }
  return refs.map((ref, i) => makePlanStep(`step-${i + 1}`, 'T11', { objectIds: [ref] }));
}

// [CHECKPOINT-C-DISPATCH] Rules E/F/G/H routing (spec §17/§41-C). Stub-kill
// anchor: neutering this function reverts createPlan to the Checkpoint B
// boundary (non-create -> UNSUPPORTED_OPERATION).
function dispatchNonCreateRules(intent, context){
  if (intent.type === 'transform') return buildTransformPlanSteps(intent, context);
  if (intent.type === 'appearance') return buildAppearancePlanSteps(intent, context);
  if (intent.type === 'alignment') return buildAlignmentPlanSteps(intent, context);
  return buildStructurePlanSteps(intent, context);
}

// §15 API — deterministic ExpectedState construction. Throws PlanningError
// (INVALID_INTENT) for an invalid intent; rejects a non-frozen context (§13).
export function createExpectedState(intent, context){
  const es = buildExpectedState(intent); // validates; PlanningError(INVALID_INTENT) on bad intent
  requirePlanningContext(context);
  return deepFreeze(es);
}

// §15 API — deterministic Plan construction. Same input + same context =>
// byte-identical Plan (§16): step ids are positional, dependency references
// are '$stepId'/'$doc:<id>' strings, and plan identity is content-derived
// (FNV-1a over key-sorted canonical JSON — zero entropy sources of any kind,
// §16).
// Checkpoint D (§41-D): optional third argument registry — a duck-typed
// read-only facade {has, get, list}; defaults to the live projection. A
// POST-CONDITION resolves every emitted toolId through it: a planning rule
// that emits an unregistered tool is a Planner bug and is refused loudly
// instead of producing an unexecutable plan. The registry is only consulted
// (never mutated, never executed) — see section 8.
export function createPlan(intent, context, registry){
  const expectedState = createExpectedState(intent, context); // validates intent + §13 context contract
  const steps = intent.type === 'create'
    ? buildCreatePlanSteps(intent, context)    // Rules A/B/C/D (spec §12/§17/§20; Checkpoint B)
    : dispatchNonCreateRules(intent, context); // Rules E/F/G/H (spec §17-E..H; Checkpoint C)
  const reg = registry === undefined ? PLANNER_TOOL_REGISTRY : requireRegistryFacade(registry);
  // [CHECKPOINT-D-POSTCOND] createPlan emitted-toolId resolution post-condition (stub-kill anchor)
  for (let i = 0; i < steps.length; i++){
    if (!reg.has(steps[i].toolId)){
      throw new PlanningError(
        PlanningErrorCodes.TOOL_NOT_FOUND,
        `createPlan post-condition (§41-D): emitted steps[${i}] references tool '${steps[i].toolId}' which does not resolve in the Tool Registry`,
        { toolId: steps[i].toolId, stepIndex: i }
      );
    }
  }
  return deepFreeze(makePlan({ intent, steps, expectedState, parentPlanId: null }));
}

// '$'-prefixed strings are plan-internal dependency references ('$step-1' =
// "output of step step-1"). Deep-scan a step input and collect them with their
// paths so violations can be reported precisely.
function collectDollarRefs(value, path, out){
  if (typeof value === 'string'){
    if (value.startsWith('$')) out.push({ ref: value.slice(1), path });
  } else if (Array.isArray(value)){
    for (let i = 0; i < value.length; i++) collectDollarRefs(value[i], `${path}[${i}]`, out);
  } else if (isPlainObject(value)){
    for (const k of Object.keys(value)) collectDollarRefs(value[k], `${path}.${k}`, out);
  }
}

// §18 dependency-reference + step-identity validation over a structurally
// shaped plan (plan.steps is a non-empty array of plain objects). Returns
// error entries; empty array = ok. Rules:
//   - step ids must be unique (§18 step identity);
//   - every objectIds entry must use the '$stepId' convention (a Plan cannot
//     know runtime object ids — those are allocated by the execution layer);
//   - every '$ref' must name a step defined by an EARLIER step (no unknown,
//     no forward, no self references) — this is the §18 step-ordering check.
function checkStepReferences(plan){
  const errors = [];
  const steps = plan.steps;
  const seen = new Set();
  for (let i = 0; i < steps.length; i++){
    const s = steps[i];
    if (isPlainObject(s) && isNonEmptyString(s.id)){
      if (seen.has(s.id)){
        errors.push(createError(PlanningErrorCodes.PLAN_INVALID, `duplicate step id '${s.id}' at steps[${i}] (§18 step identity)`, { stepIndex: i, id: s.id }));
      } else {
        seen.add(s.id);
      }
    }
  }
  const defined = new Set();
  for (let i = 0; i < steps.length; i++){
    const step = steps[i];
    if (!isPlainObject(step) || !isPlainObject(step.input)) continue;
    if (Array.isArray(step.input.objectIds)){
      for (let j = 0; j < step.input.objectIds.length; j++){
        const v = step.input.objectIds[j];
        if (typeof v !== 'string' || !v.startsWith('$')){
          errors.push(createError(
            PlanningErrorCodes.PLAN_INVALID,
            `steps[${i}].input.objectIds[${j}] must be a '$stepId' dependency reference (Plan-level convention; runtime object ids are allocated by the execution layer)`,
            { stepIndex: i, value: v }
          ));
        }
      }
    }
    const refs = [];
    collectDollarRefs(step.input, `steps[${i}].input`, refs);
    for (const { ref, path } of refs){
      // [CHECKPOINT-C-DOCREF-SKIP] '$doc:<id>' references name EXISTING
      // document objects (Checkpoint C convention) — they are NOT step-output
      // references. Their resolution against the §13 snapshot lives in
      // checkDocReferences (called from validatePlan, which owns the context).
      // The mechanical compiler path (compilePlanToDSL) intentionally does not
      // resolve them: compilation stays a pure mechanical mapping (the
      // Checkpoint B policy/mechanics split).
      if (ref.startsWith('doc:')) continue;
      if (!defined.has(ref)){
        const forward = steps.some((s, si) => si > i && isPlainObject(s) && s.id === ref);
        errors.push(createError(
          PlanningErrorCodes.PLAN_INVALID,
          forward
            ? `forward reference '$${ref}' at ${path}: a dependency must be defined by an EARLIER step (§18)`
            : `unknown reference '$${ref}' at ${path} (§18)`,
          { ref, path, stepIndex: i }
        ));
      }
    }
    if (isPlainObject(step) && isNonEmptyString(step.id)) defined.add(step.id);
  }
  return errors;
}

// Checkpoint C: resolution of '$doc:<objectId>' references against the §13
// snapshot. validatePlan-level policy (it owns the context): every '$doc:'
// reference must name an object present in context.objects (own-property
// semantics). A plan carrying '$doc:' references cannot be validated without
// a context — refused explicitly, never silently skipped.
function checkDocReferences(plan, context){
  const errors = [];
  const refs = [];
  for (let i = 0; i < plan.steps.length; i++){
    const step = plan.steps[i];
    if (isPlainObject(step) && isPlainObject(step.input)) collectDollarRefs(step.input, `steps[${i}].input`, refs);
  }
  const docRefs = refs.filter(r => r.ref.startsWith('doc:'));
  if (docRefs.length === 0) return errors;
  if (!context || !isPlainObject(context.objects)){
    errors.push(createError(
      PlanningErrorCodes.PLAN_INVALID,
      "plan contains '$doc:' document-object references but no PlanningContext snapshot with context.objects was provided (§13)",
      { field: 'context.objects' }
    ));
    return errors;
  }
  const reported = new Set();
  for (const { ref, path } of docRefs){
    const id = ref.slice(4);
    if (reported.has(id)) continue;
    reported.add(id);
    if (!Object.prototype.hasOwnProperty.call(context.objects, id)){
      errors.push(createError(
        PlanningErrorCodes.PLAN_INVALID,
        `'$doc:${id}' at ${path} not found in PlanningContext.objects (§13 snapshot)`,
        { ref: `$doc:${id}`, path }
      ));
    }
  }
  return errors;
}

// ---- 8. Tool Registry Integration (spec §41-D; Checkpoint D) ----------------

// Registry argument contract: a duck-typed READ-ONLY facade exposing
// has/get/list. Anything else is a programmer error and throws (fail loudly);
// register/unregister/execute/validate are deliberately NOT part of the
// contract the Planner consumes.
function requireRegistryFacade(registry){
  if (!isPlainObject(registry) || typeof registry.has !== 'function'
      || typeof registry.get !== 'function' || typeof registry.list !== 'function'){
    throw new PlanningError(
      PlanningErrorCodes.INVALID_PARAMETER,
      'registry must be a read-only facade exposing has/get/list (spec §41-D; the Planner never mutates or executes through it)'
    );
  }
  return registry;
}

// Categories of the live registry (tools.js): mutation T01-T15, read T16-T18,
// proposal T19-T20.
const KNOWN_TOOL_CATEGORIES = Object.freeze(['read', 'proposal', 'mutation']);

// inputSchema type subset the Planner validates against. The live core
// registry declares exactly: string / number / object / array (+ enum on
// T18.axis). Unknown declared types are a registry-contract violation
// (TOOL_REGISTRY_INVALID) — the Planner never guesses (§24).
const SUPPORTED_SCHEMA_TYPES = Object.freeze(['string', 'number', 'boolean', 'object', 'array', 'null', 'integer']);

function schemaTypeMatches(value, t){
  switch (t){
    case 'string': return typeof value === 'string';
    // JSON Schema 'number' denotes a JSON number; NaN / Infinity are not JSON
    // numbers, so a declared number input must be finite (§16 hygiene).
    case 'number': return isFiniteNumber(value);
    case 'integer': return isFiniteNumber(value) && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return isPlainObject(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    default: return false;
  }
}

// Registry-contract check of one RESOLVED tool definition (defensive; the
// live core registry is well-formed, so this is only reachable through an
// injected facade). Returns error entries (TOOL_REGISTRY_INVALID).
function checkToolDefinition(tool){
  const errors = [];
  if (!KNOWN_TOOL_CATEGORIES.includes(tool.category)){
    errors.push(createError(
      PlanningErrorCodes.TOOL_REGISTRY_INVALID,
      `registry tool '${tool.id}' declares category ${JSON.stringify(tool.category)} — expected one of ${KNOWN_TOOL_CATEGORIES.join('/')}`,
      { toolId: tool.id, category: tool.category ?? null }
    ));
  }
  const schema = tool.inputSchema;
  if (!isPlainObject(schema) || schema.type !== 'object'){
    errors.push(createError(
      PlanningErrorCodes.TOOL_REGISTRY_INVALID,
      `registry tool '${tool.id}' does not declare an object inputSchema`,
      { toolId: tool.id }
    ));
  } else {
    for (const key of Object.keys(schema.properties || {})){
      const decl = schema.properties[key] || {};
      const types = Array.isArray(decl.type) ? decl.type : [decl.type];
      for (const t of types){
        if (!SUPPORTED_SCHEMA_TYPES.includes(t)){
          errors.push(createError(
            PlanningErrorCodes.TOOL_REGISTRY_INVALID,
            `registry tool '${tool.id}' declares unsupported inputSchema type ${JSON.stringify(t)} for '${key}' (Planner validates a fixed subset and never guesses)`,
            { toolId: tool.id, field: key, type: t }
          ));
        }
      }
    }
  }
  return errors;
}

// Validate step.input against the tool's DECLARED inputSchema (spec §41-D:
// "Input schema validation against the tool's declared inputSchema") — the
// schema object as registered, NOT the tool's validate() behavior (the
// Planner must not invoke tool behavior during planning). JSON-schema subset:
// required[] presence + declared property types + enum. UNDECLARED keys are
// ALLOWED (JSON Schema default: additional properties) — the live schemas
// deliberately under-declare executor-level params (T01 declares
// {width,height} while the tool accepts x/y/rx/ry via ?? defaults,
// tools.js:227/:232/:240). Returns error entries (TOOL_INPUT_INVALID).
function validateInputAgainstSchema(stepIndex, stepId, toolId, input, schema){
  const errors = [];
  // [CHECKPOINT-D-INPUTSCHEMA] declared-inputSchema validation (stub-kill anchor)
  const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  for (const req of schema.required || []){
    if (!hasOwn(input, req)){
      errors.push(createError(
        PlanningErrorCodes.TOOL_INPUT_INVALID,
        `steps[${stepIndex}] (step '${stepId}', tool ${toolId}): missing required input '${req}' (declared inputSchema)`,
        { stepIndex, stepId, toolId, field: req }
      ));
    }
  }
  for (const key of Object.keys(schema.properties || {})){
    if (!hasOwn(input, key)) continue; // optional and absent
    const decl = schema.properties[key] || {};
    const value = input[key];
    const types = Array.isArray(decl.type) ? decl.type : [decl.type];
    if (!types.some(t => schemaTypeMatches(value, t))){
      errors.push(createError(
        PlanningErrorCodes.TOOL_INPUT_INVALID,
        `steps[${stepIndex}] (step '${stepId}', tool ${toolId}): input '${key}' does not match declared type ${types.join('|')}`,
        { stepIndex, stepId, toolId, field: key }
      ));
    } else if (Array.isArray(decl.enum) && !decl.enum.includes(value)){
      errors.push(createError(
        PlanningErrorCodes.TOOL_INPUT_INVALID,
        `steps[${stepIndex}] (step '${stepId}', tool ${toolId}): input '${key}' must be one of ${decl.enum.map(v => JSON.stringify(v)).join(', ')} (declared enum)`,
        { stepIndex, stepId, toolId, field: key }
      ));
    }
  }
  return errors;
}

// The §41-D registry block over a structurally-shaped plan. Per step:
//   1. RESOLUTION — toolId must resolve through the registry (TOOL_NOT_FOUND,
//      the §14 code reserved for this since Checkpoint A);
//   2. REGISTRY CONTRACT — the resolved definition must be well-formed
//      (TOOL_REGISTRY_INVALID; broken definitions short-circuit the step);
//   3. CATEGORY — PLANNER RULE: a Plan is a mutation program, so plan steps
//      must target category 'mutation' tools. Read (T16-T18) and proposal
//      (T19-T20) tools gather context; they never appear as plan steps.
//      Documented as a PLANNER rule (like the §20 center rule): a future
//      phase that lets plans carry read/proposal steps may revisit it
//      without breaking unrelated plans (PLAN_INVALID + details.rule).
//   4. INPUT SCHEMA — step.input is validated against the DECLARED
//      inputSchema (TOOL_INPUT_INVALID).
// Read-only by construction: only registry.has/get are consulted.
function validatePlanStepTools(plan, registry){
  const errors = [];
  // [CHECKPOINT-D-RESOLUTION] resolution + category + declared-inputSchema block (stub-kill anchor)
  for (let i = 0; i < plan.steps.length; i++){
    const step = plan.steps[i];
    if (!isPlainObject(step) || !isNonEmptyString(step.toolId)) continue; // shape errors already reported by the structural layer
    if (!registry.has(step.toolId)){
      errors.push(createError(
        PlanningErrorCodes.TOOL_NOT_FOUND,
        `steps[${i}].toolId '${step.toolId}' does not resolve in the Tool Registry (spec §41-D)`,
        { stepIndex: i, toolId: step.toolId }
      ));
      continue;
    }
    const tool = registry.get(step.toolId);
    const defErrors = checkToolDefinition(tool);
    if (defErrors.length > 0){
      for (const e of defErrors) errors.push(createError(e.code, `steps[${i}]: ${e.message}`, e.details));
      continue; // broken definition: do not validate against it
    }
    if (tool.category !== 'mutation'){
      errors.push(createError(
        PlanningErrorCodes.PLAN_INVALID,
        `steps[${i}] (step '${step.id}') targets ${tool.category} tool '${tool.id}' — PLANNER RULE: Plans may only contain mutation tools; ${tool.category} tools gather context and never appear as plan steps (revisitable, not a general Plan invariant)`,
        { stepIndex: i, stepId: step.id, toolId: tool.id, category: tool.category, rule: 'plan-steps-must-target-mutation-tools' }
      ));
    }
    if (isPlainObject(step.input)){
      errors.push(...validateInputAgainstSchema(i, step.id, tool.id, step.input, tool.inputSchema));
    }
  }
  return errors;
}

// §15 API — plan validation (§18 subset for Checkpoint B): structural layer
// (§10 shape via validatePlanStructure), dependency references + step
// identity, the Planner's center-placement rule, '$doc:' document-object
// reference resolution (Checkpoint C, against the §13 snapshot), and —
// Checkpoint D (§41-D) — tool resolution / category / declared-inputSchema
// validation through the Tool Registry. Returns a verdict; a
// contract-violating CONTEXT (non-frozen / non-object) or a malformed
// REGISTRY facade throws, mirroring createPlan.
// Optional third argument registry: duck-typed read-only facade {has, get,
// list}; defaults to the live read-only projection (getPlannerRegistry()).
export function validatePlan(plan, context, registry){
  if (context !== undefined) requirePlanningContext(context);
  const reg = registry === undefined ? PLANNER_TOOL_REGISTRY : requireRegistryFacade(registry);
  const errors = [];
  const structural = validatePlanStructure(plan);
  if (!structural.valid) errors.push(...structural.errors);
  if (isPlainObject(plan) && Array.isArray(plan.steps)){
    errors.push(...checkStepReferences(plan));
    errors.push(...checkDocReferences(plan, context)); // Checkpoint C: '$doc:' snapshot resolution
    errors.push(...validatePlanStepTools(plan, reg)); // Checkpoint D: resolution + category + declared inputSchema
    // PLANNER RULE — center placement requires a T08 align step.
    // This rule enforces the spec §20 mandate. If a future phase
    // changes artboard semantics, this rule may be revisited.
    // (Documented as a PLANNER rule, not a general Plan invariant: it keys on
    // the Planner's own ExpectedState marker spatial.centered === true, which
    // createExpectedState derives mechanically from intent.placement ===
    // 'center'. A future phase can change it without breaking unrelated
    // plans.)
    const centered = isPlainObject(plan.expectedState)
      && isPlainObject(plan.expectedState.spatial)
      && plan.expectedState.spatial.centered === true;
    if (centered){
      const hasCenterAlign = plan.steps.some(s =>
        isPlainObject(s) && s.toolId === 'T08'
        && isPlainObject(s.input) && s.input.axis === 'both' && s.input.mode === 'center');
      if (!hasCenterAlign){
        errors.push(createError(
          PlanningErrorCodes.PLAN_INVALID,
          "Planner rule (spec §20 mandate): ExpectedState.spatial.centered is true, so the Plan MUST contain a T08 align step with axis:'both' and mode:'center'",
          { rule: 'center-requires-T08-both-center' }
        ));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// Plan-reference stripper for compilation: '$doc:<objectId>' -> '<objectId>'
// (existing document object), '$<stepId>' -> '<stepId>' (step output). The
// DSL layer resolves the resulting target strings (dsl.js:547-564).
function stripRefPrefix(v){
  if (typeof v !== 'string' || !v.startsWith('$')) return v;
  return v.startsWith('$doc:') ? v.slice(5) : v.slice(1);
}

// Mechanical step -> DSL instruction mapping (§23: "The exact syntax must
// follow the existing DSL implementation. Do not invent a second DSL.").
// Defaults mirror dsl.js mapToToolIR so the round trip is identity-equivalent.
function compileStepToInstruction(step){
  const input = step.input;
  switch (step.toolId){
    case 'T01':
      // mapToToolIR 'create' rect defaults (dsl.js:367): x??0 y??0 rx??0 ry??0
      return { op: 'create', id: step.id, type: 'rect', args: { x: input.x ?? 0, y: input.y ?? 0, width: input.width, height: input.height, rx: input.rx ?? 0, ry: input.ry ?? 0 } };
    case 'T02':
      // mapToToolIR 'create' ellipse (dsl.js:370): cx/cy center + radii
      return { op: 'create', id: step.id, type: 'ellipse', args: { cx: input.cx ?? 0, cy: input.cy ?? 0, rx: input.rx, ry: input.ry } };
    case 'T07': {
      // The guards below exist because these inputs would otherwise silently
      // compile into an empty or semantically wrong appearance instruction —
      // honest failure instead (full tool-input schema validation against the
      // declared inputSchema is validatePlan's job — Checkpoint D, spec §41-D).
      if (!Array.isArray(input.objectIds) || input.objectIds.length === 0){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T07 requires a non-empty objectIds reference`, { stepId: step.id });
      }
      if (input.fill === undefined && input.opacity === undefined){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T07 requires fill and/or opacity`, { stepId: step.id });
      }
      const args = {};
      if (input.fill !== undefined){
        if (!isPlainObject(input.fill) || input.fill.kind !== 'solid' || input.fill.color === undefined){
          throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T07 fill must be {kind:'solid', color} (tools.js:357)`, { stepId: step.id });
        }
        // hex string or {r,g,b,a}; dsl.js parseColor (dsl.js:333-354)
        // normalizes to the canonical RGBA object at IR compile time.
        args.fill = input.fill.color;
      }
      if (input.opacity !== undefined) args.opacity = input.opacity;
      return { op: 'appearance', target: stripRefPrefix(input.objectIds[0]), args };
    }
    case 'T08': {
      if (!Array.isArray(input.objectIds) || input.objectIds.length === 0){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T08 requires a non-empty objectIds reference`, { stepId: step.id });
      }
      // axis/mode defaults mirror mapToToolIR 'align' (dsl.js:455)
      return { op: 'align', targets: input.objectIds.map(stripRefPrefix), args: { axis: input.axis ?? 'horizontal', mode: input.mode ?? 'center' } };
    }
    case 'T05': {
      // Plan->DSL mirrors the substrate's own transform decomposition
      // (dsl.js:415-433): T05 delta <-> transform args.translate (finite Vec2
      // per dsl.js:100-104 / tools.js:312). Guards = honest failure; full
      // input-schema validation against the declared inputSchema is
      // validatePlan's job (Checkpoint D, spec §41-D).
      if (!Array.isArray(input.objectIds) || input.objectIds.length === 0){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T05 requires a non-empty objectIds reference`, { stepId: step.id });
      }
      if (!isPlainObject(input.delta) || !isFiniteNumber(input.delta.x) || !isFiniteNumber(input.delta.y)){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T05 requires a finite delta Vec2 (tools.js:312)`, { stepId: step.id });
      }
      return { op: 'transform', targets: input.objectIds.map(stripRefPrefix), args: { translate: { x: input.delta.x, y: input.delta.y } } };
    }
    case 'T06': {
      if (!Array.isArray(input.objectIds) || input.objectIds.length === 0){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T06 requires a non-empty objectIds reference`, { stepId: step.id });
      }
      const m = input.transform;
      if (!isPlainObject(m) || !['a', 'b', 'c', 'd', 'tx', 'ty'].every(k => isFiniteNumber(m[k]))){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T06 requires a Matrix3x3 {a,b,c,d,tx,ty} (tools.js:333)`, { stepId: step.id });
      }
      if (Math.abs(m.a * m.d - m.b * m.c) < 1e-12){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T06 transform matrix is singular (tools.js:333)`, { stepId: step.id });
      }
      return { op: 'transform', targets: input.objectIds.map(stripRefPrefix), args: { matrix: { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty } } };
    }
    case 'T10': {
      if (!Array.isArray(input.objectIds) || input.objectIds.length < 2){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T10 requires objectIds >= 2 (tools.js:490)`, { stepId: step.id });
      }
      return { op: 'group', targets: input.objectIds.map(stripRefPrefix) };
    }
    case 'T11': {
      // The DSL ungroup op is single-target (dsl.js:121) — a T11 step with
      // more than one reference would compile lossily, so it is refused.
      if (!Array.isArray(input.objectIds) || input.objectIds.length !== 1){
        throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, `step '${step.id}': T11 compiles to the single-target ungroup op (dsl.js:121) and requires exactly one objectIds entry`, { stepId: step.id });
      }
      return { op: 'ungroup', target: stripRefPrefix(input.objectIds[0]) };
    }
    default:
      throw new PlanningError(
        PlanningErrorCodes.UNSUPPORTED_OPERATION,
        `tool ${step.toolId} has no Plan→DSL mapping (remaining registry tools arrive with their planning rules / Checkpoints D-E; spec §41-D/§41-E)`,
        { toolId: step.toolId, stepId: step.id }
      );
  }
}

// §15 API — Plan -> DSL compiler (§23). Output is the existing VectorDSL JSON
// program shape consumed by parseDSL (dsl.js:184) / validateDSL (dsl.js:314) /
// compileToIR (dsl.js:475) / DSLExecutor.execute (dsl.js:538). Mechanical
// prerequisites only (structure + dependency references): the planner POLICY
// rules (e.g. the §20 T08 mandate) are enforced by validatePlan, so
// compilation stays a pure mechanical mapping.
export function compilePlanToDSL(plan){
  const structural = validatePlanStructure(plan);
  if (!structural.valid){
    throw new PlanningError(PlanningErrorCodes.PLAN_INVALID, 'compilePlanToDSL requires a structurally valid plan (§10/§18)', structural.errors);
  }
  const refErrors = checkStepReferences(plan);
  if (refErrors.length > 0){
    throw new PlanningError(PlanningErrorCodes.PLAN_INVALID, 'compilePlanToDSL requires resolvable step dependency references (§18)', refErrors);
  }
  return deepFreeze({ version: '1.0', program: plan.steps.map(compileStepToInstruction) });
}

// ============================================================================
// PHASE 3.16 — CONSTRAINT-AWARE PLANNING ARMS (the planner integration)
// ============================================================================
// Two pure planning-time verifications over the ACCEPTED constraint regime
// (the T19-inferred, store-accepted records). Both are rule-based and
// conservative — the §43 sanction for rule-based prediction — and both are
// computed WITHOUT scene access: the arrangement projection and the plan
// steps carry everything (the planner stays read-only, imports stay exactly
// './tools.js').
//
//   verifyArrangementAgainstConstraints(arrangement, constraints, options?)
//       The DATA face: an arrangement is a plain map
//       {objectId -> {geometry:{width,height}, spatial:{bbox}}} — the
//       PlanningContext.objects projection. For each enabled constraint the
//       pinned quantity is extracted per participant and compared against the
//       REFERENCE (objectIds[0]). Missing participants or absent quantities
//       are UNVERIFIABLE — the planner never invents a verdict. Verdicts are
//       deep-frozen and deterministic.
//
//   verifyPlanStepsAgainstConstraints(plan, constraints)
//       The STATIC MUTATION face (the planning-time mirror of the correction
//       gate's axis model): a plan step's mutated axes are classified from
//       its tool and input (T05 by delta, T08/T09 by axis param, T07/T12
//       none, T06/T10/T11 and unknown tools conservatively everything); a
//       HARD (required) constraint whose pinned axes intersect a step's
//       mutation axes, and whose participants the step touches, CONFLICTS.
//       Soft constraints trade off at runtime and are not flagged here.
//
// The axis/quantity tables mirror the frozen correction module's semantics
// (CONSTRAINT_PINNED_AXES / TOOL_MUTATION_AXES) — mirrored, not imported: the
// one-substrate import contract is pinned and untouched.
// ============================================================================

export const EXPECTED_STATE_CONSTRAINT_QUANTITIES = deepFreeze({
  equalWidth: { quantity: 'width', source: 'geometry', label: 'width' },
  equalHeight: { quantity: 'height', source: 'geometry', label: 'height' },
  alignLeft: { quantity: 'minX', source: 'bbox', label: 'minX' },
  alignRight: { quantity: 'maxX', source: 'bbox', label: 'maxX' },
  alignTop: { quantity: 'minY', source: 'bbox', label: 'minY' },
  alignBottom: { quantity: 'maxY', source: 'bbox', label: 'maxY' },
  alignCenterX: { quantity: 'centerX', source: 'bbox', label: 'centerX' },
  alignCenterY: { quantity: 'centerY', source: 'bbox', label: 'centerY' },
  horizontal: { quantity: 'centerY', source: 'bbox', label: 'centerY' },
  vertical: { quantity: 'centerX', source: 'bbox', label: 'centerX' }
});

const PLANNER_PINNED_AXES = deepFreeze({
  horizontal: ['y'], alignCenterY: ['y'], vertical: ['x'], alignCenterX: ['x'],
  alignLeft: ['x'], alignRight: ['x'], alignTop: ['y'], alignBottom: ['y'],
  equalWidth: ['width'], equalHeight: ['height'], fixedDistance: ['x', 'y']
});

const PLANNER_TOOL_AXES = deepFreeze({
  T05: 'DELTA', T06: ['x', 'y', 'width', 'height'], T07: [], T08: 'AXIS_PARAM',
  T09: 'AXIS_PARAM', T10: ['x', 'y', 'width', 'height'], T11: ['x', 'y', 'width', 'height'], T12: []
});
const PLANNER_ALL_AXES = deepFreeze(['x', 'y', 'width', 'height']);

function planReferenceId(v){
  if (!isNonEmptyString(v)) return null;
  return v.startsWith('$doc:') ? v.slice('$doc:'.length) : v;
}

function stepMutationAxes(step){
  const input = isPlainObject(step.input) ? step.input : {};
  const model = PLANNER_TOOL_AXES[step.toolId];
  if (model === undefined) return [...PLANNER_ALL_AXES];
  if (model === 'DELTA'){
    const d = input.delta;
    if (!isPlainObject(d) || !isFiniteNumber(d.x) || !isFiniteNumber(d.y)) return [...PLANNER_ALL_AXES];
    const axes = [];
    if (d.x !== 0) axes.push('x');
    if (d.y !== 0) axes.push('y');
    return axes;
  }
  if (model === 'AXIS_PARAM'){
    if (input.axis === 'horizontal') return ['x'];
    if (input.axis === 'vertical') return ['y'];
    if (input.axis === 'both') return ['x', 'y'];
    return ['x', 'y'];
  }
  return [...model];
}

function arrangementQuantityOf(state, spec){
  if (!isPlainObject(state)) return null;
  if (spec.source === 'geometry'){
    const g = isPlainObject(state.geometry) ? state.geometry : {};
    return isFiniteNumber(g[spec.quantity]) ? g[spec.quantity] : null;
  }
  const bbox = isPlainObject(state.spatial) && isPlainObject(state.spatial.bbox) ? state.spatial.bbox : null;
  if (!bbox) return null;
  if (spec.quantity === 'centerX') return isFiniteNumber(bbox.minX) && isFiniteNumber(bbox.maxX) ? (bbox.minX + bbox.maxX) / 2 : null;
  if (spec.quantity === 'centerY') return isFiniteNumber(bbox.minY) && isFiniteNumber(bbox.maxY) ? (bbox.minY + bbox.maxY) / 2 : null;
  return isFiniteNumber(bbox[spec.quantity]) ? bbox[spec.quantity] : null;
}

export function verifyArrangementAgainstConstraints(arrangement, constraints, options){
  if (!isPlainObject(arrangement)){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'verifyArrangementAgainstConstraints requires a plain arrangement map {objectId -> {geometry, spatial}}');
  }
  if (!Array.isArray(constraints)){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'verifyArrangementAgainstConstraints requires an array of plain constraint records');
  }
  if (options !== undefined && !isPlainObject(options)){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'options must be undefined or a plain object {tolerance}');
  }
  const tolerance = options && isFiniteNumber(options.tolerance) ? options.tolerance : 1e-9;
  const checks = [];
  for (const record of constraints){
    if (!isPlainObject(record) || !isNonEmptyString(record.id) || !isNonEmptyString(record.type) || !Array.isArray(record.objectIds)){
      throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'verifyArrangementAgainstConstraints: invalid constraint record');
    }
    const spec = EXPECTED_STATE_CONSTRAINT_QUANTITIES[record.type];
    if (record.enabled === false){
      checks.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'DISABLED' }));
      continue;
    }
    if (spec === undefined || record.objectIds.length < 2){
      checks.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'UNVERIFIABLE', reason: 'UNSUPPORTED_TYPE' }));
      continue;
    }
    const quantities = [];
    let missing = null;
    for (const oid of record.objectIds){
      const state = arrangement[oid];
      if (state === undefined){ missing = { objectId: oid, reason: 'OBJECT_MISSING' }; break; }
      const q = arrangementQuantityOf(state, spec);
      if (q === null){ missing = { objectId: oid, reason: 'QUANTITY_ABSENT' }; break; }
      quantities.push({ objectId: oid, value: q });
    }
    if (missing !== null){
      checks.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'UNVERIFIABLE', reason: missing.reason, objectId: missing.objectId }));
      continue;
    }
    let violated = null;
    for (let i = 1; i < quantities.length; i++){
      const error = Math.abs(quantities[i].value - quantities[0].value);
      if (error > tolerance){
        violated = { violatedObjectIds: [quantities[i].objectId], expected: quantities[0].value, actual: quantities[i].value };
        break;
      }
    }
    if (violated !== null){
      checks.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'VIOLATED', ...violated, tolerance }));
    } else {
      checks.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'SATISFIED', expected: quantities[0].value, tolerance }));
    }
  }
  const status = checks.some(c => c.status === 'VIOLATED') ? 'VIOLATED'
    : checks.some(c => c.status === 'UNVERIFIABLE') ? 'UNVERIFIABLE' : 'PRESERVED';
  return deepFreeze({ status, checks });
}

export function verifyPlanStepsAgainstConstraints(plan, constraints){
  if (!isPlainObject(plan) || !Array.isArray(plan.steps) || plan.steps.length === 0){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'verifyPlanStepsAgainstConstraints requires a plan with a non-empty steps array');
  }
  if (!Array.isArray(constraints)){
    throw new PlanningError(PlanningErrorCodes.INVALID_PARAMETER, 'verifyPlanStepsAgainstConstraints requires an array of plain constraint records');
  }
  const conflicts = [];
  plan.steps.forEach((step, stepIndex) => {
    if (!isPlainObject(step) || !isNonEmptyString(step.toolId)) return;
    const input = isPlainObject(step.input) ? step.input : {};
    const stepIds = (Array.isArray(input.objectIds) ? input.objectIds : [])
      .map(planReferenceId).filter(isNonEmptyString);
    const mutated = stepMutationAxes(step);
    for (const record of constraints){
      if (!isPlainObject(record) || !isNonEmptyString(record.id) || !isNonEmptyString(record.type) || !Array.isArray(record.objectIds)) continue;
      if (record.enabled === false || record.strength !== 'required') continue;
      const pinned = PLANNER_PINNED_AXES[record.type];
      if (pinned === undefined) continue; // unclassifiable constraints are skipped, never guessed
      const touching = record.objectIds.some(oid => stepIds.includes(oid));
      if (!touching) continue;
      const shared = mutated.filter(a => pinned.includes(a));
      if (shared.length === 0) continue;
      let conflict = conflicts.find(c => c.stepIndex === stepIndex);
      if (!conflict){
        conflict = { stepIndex, toolId: step.toolId, axes: [...shared], constraintIds: [] };
        conflicts.push(conflict);
      }
      for (const axis of shared){
        if (!conflict.axes.includes(axis)) conflict.axes.push(axis);
      }
      conflict.constraintIds.push(record.id);
    }
  });
  return deepFreeze({ status: conflicts.length > 0 ? 'CONFLICTS' : 'PRESERVED', conflicts });
}
