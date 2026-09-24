// ============================================================================
// src-js/evaluation.js — EVALUATION DATA MODEL (PHASE 3.14, Checkpoint A)
// ============================================================================
// Spec scope: §10-§14 (ActualState / construction / EvaluationResult /
// Deviation / tolerance fields), §22 (determinism), §54 (Checkpoint A),
// §62 gates 1-7.
//
// ARCHITECTURE BOUNDARY (spec §02/§10/§42/§52):
//   - This module is READ-ONLY by construction. It never mutates canonical
//     stores, the hierarchy, transactions, history, or events. All store
//     access is injected via the doc-context argument (duck-typed read
//     surface: get/listIds + hierarchy reads) — nothing is imported from
//     the persistence layer.
//   - WorldBBox is composed from PUBLIC PURE PIECES only (spec §51):
//     geometry.js bbox functions ⊕ bbox.js transform ⊕ the hierarchy's
//     world-transform read. The substrate-private helper in tools.js stays
//     unexported; tools.js is untouched by 3.14.
//   - The Planner is not imported (spec §06/§11): ExpectedState is consumed
//     as plain data guarded by a light local shape check (five sections,
//     mirroring ai.js:399-407). No Planner logic is re-implemented here.
//
// DETERMINISM (spec §22): no entropy sources of any kind. Deviation ids are
// content-derived: FNV-1a over a key-sorted canonical JSON serialization of
// the deviation content — the same discipline as ai.js:149-166 (§16).
//
// CHECKPOINT B (spec §14-§22, §55; gates 8-20 substrate): the deterministic
// evaluation engine. evaluate(expectedState, documentContext, evaluationContext)
// builds the ActualState (§11), compares it against the ExpectedState per
// category (E1 existence, E2 geometry, E3 appearance, E4 placement, E5
// structure, E7 transform; E6 semantic stays dormant), and returns a frozen
// EvaluationResult (§12) whose deviations carry all 11 §13 fields. Declared
// deviation order: target-major (evaluationContext.targets order), then the
// fixed category rank existence..transform, then each category's fixed
// property order. Tolerances are part of the contract (EVALUATION_TOLERANCES,
// uniform 1e-9 — the geometry-kernel default, geometry.js:5/:338). Fill
// normalization is a LOCAL normalizer mirroring the substrate color-parser
// semantics; the dsl module is not imported and stays untouched (§50).
// Expectations that cannot be verified from the injected read surface are
// self-reported in metadata.unevaluatedExpectations — never silently dropped,
// never converted into invented deviations (§19/§20 honesty).
//
// House style: single-file module, compact functions, {valid, errors} result
// objects with {code, message, details?} entries (mirrors ai.js/dsl.js).
// ============================================================================

// ---- 0. Public pure pieces (spec §51: compose, never export from tools.js) -

import { rectBBox, ellipseBBox } from './geometry.js';
import { transform as bboxTransform, center as bboxCenter } from './bbox.js';

// ---- 1. Error model (house style; Checkpoint A codes + B-era MISSING_PARAMETER
// admission mirroring the planning vocabulary, ai.js:236) ---------------------

export const EvaluationErrorCodes = Object.freeze({
  INVALID_DOCUMENT_CONTEXT: 'INVALID_DOCUMENT_CONTEXT',
  INVALID_EVALUATION_CONTEXT: 'INVALID_EVALUATION_CONTEXT',
  INVALID_ACTUAL_STATE: 'INVALID_ACTUAL_STATE',
  INVALID_DEVIATION: 'INVALID_DEVIATION',
  INVALID_EVALUATION_RESULT: 'INVALID_EVALUATION_RESULT',
  INVALID_EXPECTED_STATE: 'INVALID_EXPECTED_STATE',
  MISSING_PARAMETER: 'MISSING_PARAMETER'
});

export class EvaluationError extends Error {
  constructor(code, message, details){
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function createError(code, message, details){
  const e = { code, message };
  if (details !== undefined) e.details = details;
  return e;
}

// ---- 2. Shared primitive guards + deterministic canonical form (§22) -------

function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNumber(v){ return typeof v === 'number' && Number.isFinite(v); }
function isNonEmptyString(v){ return typeof v === 'string' && v.length > 0; }

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
// identical string, independent of property insertion order (§22).
function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// FNV-1a, 32 bit. Pure integer arithmetic, no entropy, stable across engines
// (mirrors ai.js:159-166 — the §16 discipline applied to evaluation ids).
function fnv1a32(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// A plan-level reference: '$doc:<objectId>' (existing object) or '$<stepId>'
// (plan-step output) — the two §13 kinds, both '$'-prefixed by the plan
// reference grammar (ai.js:900-976). Plan-level outcomes may bind NO
// reference: null (spec §21).
function isPlanRefOrNull(v){
  if (v === null) return true;
  return isNonEmptyString(v) && v.startsWith('$');
}

// ---- 3. Vocabularies (spec §13) ---------------------------------------------

export const DEVIATION_CATEGORIES = Object.freeze([
  'existence', 'geometry', 'appearance', 'placement', 'structure', 'transform', 'semantic'
]);

export const DEVIATION_SEVERITIES = Object.freeze(['error', 'warning']);

// Public pure-piece dispatch for local (parametric-space) bboxes (spec §51).
// rect/ellipse are the types the Planner can produce (ai.js:680-682); any
// other type is observed verbatim with worldBBox left null — an unmeasurable
// geometry is never invented (§15/§19 honesty).
const LOCAL_BBOX_DISPATCH = Object.freeze({ rect: rectBBox, ellipse: ellipseBBox });

// ---- 4. ActualState (spec §10/§11) ------------------------------------------

// Read surface the doc context must expose (all injected, none imported):
//   objectStore.get(id)             -> {geometryRef, appearanceRef} | undefined
//   geometryStore.get(ref)          -> {type, params, ...} | undefined
//   appearanceStore.get(ref)        -> {stack: [...]} | undefined
//   sceneGraph.findNodeByObjectId() -> {id, parent, children, ...} | undefined
//   sceneGraph.findNode(id)         -> {objectRef, ...} | undefined
//   sceneGraph.getWorldTransform()  -> {a,b,c,d,tx,ty}
function docContextErrors(ctx){
  const errors = [];
  if (!isPlainObject(ctx)){
    return [createError(EvaluationErrorCodes.INVALID_DOCUMENT_CONTEXT, 'doc context must be a plain object')];
  }
  const need = [
    ['objectStore', 'get'], ['geometryStore', 'get'], ['appearanceStore', 'get'],
    ['sceneGraph', 'findNodeByObjectId'], ['sceneGraph', 'findNode'], ['sceneGraph', 'getWorldTransform']
  ];
  for (const [part, fn] of need){
    const holder = ctx[part];
    if (!isPlainObject(holder) || typeof holder[fn] !== 'function'){
      errors.push(createError(
        EvaluationErrorCodes.INVALID_DOCUMENT_CONTEXT,
        `doc context.${part}.${fn}() read surface missing — evaluation consumes injected read-only stores, it never constructs or imports them (spec §10/§11)`,
        { part, fn }
      ));
    }
  }
  return errors;
}

function evaluationContextErrors(ec){
  if (!isPlainObject(ec)){
    return [createError(EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT, 'evaluation context must be a plain object')];
  }
  if (!Array.isArray(ec.targets) || ec.targets.length === 0){
    return [createError(EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT, 'evaluation context targets must be a non-empty array of {objectId, targetRef}', { field: 'targets' })];
  }
  const errors = [];
  const seenIds = new Set();
  const seenRefs = new Set();
  for (let i = 0; i < ec.targets.length; i++){
    const t = ec.targets[i];
    if (!isPlainObject(t) || !isNonEmptyString(t.objectId)){
      errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT, `targets[${i}].objectId must be a non-empty string`, { index: i }));
      continue;
    }
    if (!isPlanRefOrNull(t.targetRef)){
      errors.push(createError(
        EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT,
        `targets[${i}].targetRef must be a '$'-prefixed plan reference ('$doc:<id>' or '$<stepId>') or null (spec §13 reference grammar)`,
        { index: i, value: t.targetRef }
      ));
    }
    if (seenIds.has(t.objectId)){
      errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT, `duplicate evaluation target '${t.objectId}' — a duplicated target would double-evaluate the object`, { index: i }));
    }
    if (t.targetRef !== null && seenRefs.has(t.targetRef)){
      errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_CONTEXT, `duplicate evaluation targetRef '${t.targetRef}' — one reference must bind exactly one object`, { index: i }));
    }
    seenIds.add(t.objectId);
    if (t.targetRef !== null) seenRefs.add(t.targetRef);
  }
  return errors;
}

// Local (parametric-space) bbox through the public pure dispatch. Returns
// null when the type is not covered or the record is not finitely measurable.
function localBBoxOf(geometry){
  const fn = LOCAL_BBOX_DISPATCH[geometry.type];
  if (!fn) return null;
  const b = fn(geometry.params);
  if (!isPlainObject(b) || !['minX', 'minY', 'maxX', 'maxY'].every(k => isFiniteNumber(b[k]))) return null;
  return b;
}

// Observed fill projection: the FIRST fill item in stack order (substrate
// order is authoritative; T07 upserts the fill slot, tools.js:364-373).
// Observations are verbatim — normalization/comparison happens later at the
// evaluation boundary (spec §16/§50), not during snapshot construction.
function observeFill(app){
  if (!isPlainObject(app) || !Array.isArray(app.stack)) return null;
  const item = app.stack.find(it => isPlainObject(it) && it.type === 'fill');
  if (!item || !isPlainObject(item.data)) return null;
  const d = item.data;
  if (!isNonEmptyString(d.kind)) return null;
  if (!isPlainObject(d.color) || !['r', 'g', 'b', 'a'].every(k => isFiniteNumber(d.color[k]))) return null;
  if (!isFiniteNumber(d.opacity)) return null;
  if (typeof item.enabled !== 'boolean') return null;
  return { kind: d.kind, color: { ...d.color }, opacity: d.opacity, enabled: item.enabled };
}

function observeObject(docCtx, target){
  const entry = {
    objectId: target.objectId,
    targetRef: target.targetRef,
    exists: false,
    geometryRef: null,
    appearanceRef: null,
    geometry: null,
    worldTransform: null,
    worldBBox: null,
    parentNodeId: null,
    parentIsGroup: null,
    childrenNodeIds: [],
    fill: null
  };
  const obj = docCtx.objectStore.get(target.objectId);
  if (!isPlainObject(obj)) return entry; // §21 substrate: absence is observed, not guessed around
  entry.exists = true;
  entry.geometryRef = isNonEmptyString(obj.geometryRef) ? obj.geometryRef : null;
  entry.appearanceRef = isNonEmptyString(obj.appearanceRef) ? obj.appearanceRef : null;
  if (entry.geometryRef !== null){
    const geom = docCtx.geometryStore.get(entry.geometryRef);
    if (isPlainObject(geom) && isNonEmptyString(geom.type) && isPlainObject(geom.params)){
      entry.geometry = { type: geom.type, params: JSON.parse(JSON.stringify(geom.params)) };
    }
  }
  if (entry.appearanceRef !== null){
    entry.fill = observeFill(docCtx.appearanceStore.get(entry.appearanceRef));
  }
  const node = docCtx.sceneGraph.findNodeByObjectId(target.objectId);
  if (isPlainObject(node) && isNonEmptyString(node.id)){
    entry.parentNodeId = isNonEmptyString(node.parent) ? node.parent : null;
    entry.childrenNodeIds = Array.isArray(node.children) ? node.children.filter(isNonEmptyString) : [];
    if (entry.parentNodeId !== null){
      const parent = docCtx.sceneGraph.findNode(entry.parentNodeId);
      if (isPlainObject(parent)) entry.parentIsGroup = !parent.objectRef; // group node = objectRef null (scenegraph.js:180)
    }
    if (entry.geometry !== null){
      const local = localBBoxOf(entry.geometry);
      if (local){
        const wt = docCtx.sceneGraph.getWorldTransform(node.id);
        if (isPlainObject(wt) && ['a', 'b', 'c', 'd', 'tx', 'ty'].every(k => isFiniteNumber(wt[k]))){
          const world = bboxTransform(local, { a: wt.a, b: wt.b, c: wt.c, d: wt.d, tx: wt.tx, ty: wt.ty });
          if (isPlainObject(world) && ['minX', 'minY', 'maxX', 'maxY'].every(k => isFiniteNumber(world[k]))){
            entry.worldTransform = { a: wt.a, b: wt.b, c: wt.c, d: wt.d, tx: wt.tx, ty: wt.ty };
            entry.worldBBox = { minX: world.minX, minY: world.minY, maxX: world.maxX, maxY: world.maxY };
          }
        }
      }
    }
  }
  return entry;
}

// §11 API — read-only snapshot construction from the authoritative stores.
// Throws EvaluationError(INVALID_DOCUMENT_CONTEXT / INVALID_EVALUATION_CONTEXT)
// on contract breaches. The returned snapshot is deep-frozen (§10: immutable
// once constructed) and deterministic (§22): identical stores + context give
// byte-identical output. Identity/reference binding comes from the caller
// (the plan's '$' grammar); observed VALUES come only from the stores.
export function buildActualState(documentContext, evaluationContext){
  const ctxErrors = docContextErrors(documentContext);
  if (ctxErrors.length > 0) throw new EvaluationError(ctxErrors[0].code, ctxErrors[0].message, ctxErrors);
  const ecErrors = evaluationContextErrors(evaluationContext);
  if (ecErrors.length > 0) throw new EvaluationError(ecErrors[0].code, ecErrors[0].message, ecErrors);
  const objects = evaluationContext.targets.map(t => observeObject(documentContext, t));
  return deepFreeze({ objects });
}

const ACTUAL_ENTRY_KEYS = Object.freeze([
  'objectId', 'targetRef', 'exists', 'geometryRef', 'appearanceRef', 'geometry',
  'worldTransform', 'worldBBox', 'parentNodeId', 'parentIsGroup', 'childrenNodeIds', 'fill'
]);

function matrixErrors(value, label, errors){
  if (value === null || value === undefined) return;
  if (!isPlainObject(value) || !['a', 'b', 'c', 'd', 'tx', 'ty'].every(k => isFiniteNumber(value[k]))){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${label} must be null or a finite {a,b,c,d,tx,ty} matrix`, { field: label }));
  }
}

function bboxErrors(value, label, errors){
  if (value === null || value === undefined) return;
  if (!isPlainObject(value) || !['minX', 'minY', 'maxX', 'maxY'].every(k => isFiniteNumber(value[k]))){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${label} must be null or a finite {minX,minY,maxX,maxY} box`, { field: label }));
  }
}

function actualEntryErrors(entry, index, errors){
  const at = `objects[${index}]`;
  if (!isPlainObject(entry)){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at} must be a plain object`, { index }));
    return;
  }
  for (const key of ACTUAL_ENTRY_KEYS){
    if (!Object.prototype.hasOwnProperty.call(entry, key)){
      errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.${key} is a mandatory observed field (spec §10/§13)`, { index, field: key }));
    }
  }
  if (!isNonEmptyString(entry.objectId)) errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.objectId must be a non-empty string`, { index }));
  if (!isPlanRefOrNull(entry.targetRef)) errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.targetRef must be null or a '$'-prefixed plan reference`, { index }));
  if (typeof entry.exists !== 'boolean') errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.exists must be boolean`, { index }));
  for (const refField of ['geometryRef', 'appearanceRef']){
    if (entry[refField] !== null && entry[refField] !== undefined && !isNonEmptyString(entry[refField])){
      errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.${refField} must be null or a non-empty string`, { index }));
    }
  }
  if (entry.geometry !== null && entry.geometry !== undefined){
    const g = entry.geometry;
    if (!isPlainObject(g) || !isNonEmptyString(g.type) || !isPlainObject(g.params)){
      errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.geometry must be null or {type, params}`, { index }));
    }
  }
  matrixErrors(entry.worldTransform, `${at}.worldTransform`, errors);
  bboxErrors(entry.worldBBox, `${at}.worldBBox`, errors);
  if (entry.parentNodeId !== null && entry.parentNodeId !== undefined && !isNonEmptyString(entry.parentNodeId)){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.parentNodeId must be null or a non-empty string`, { index }));
  }
  if (entry.parentIsGroup !== null && entry.parentIsGroup !== undefined && typeof entry.parentIsGroup !== 'boolean'){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.parentIsGroup must be null or boolean`, { index }));
  }
  if (!Array.isArray(entry.childrenNodeIds) || !entry.childrenNodeIds.every(isNonEmptyString)){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.childrenNodeIds must be an array of node-id strings`, { index }));
  }
  if (entry.fill !== null && entry.fill !== undefined){
    const f = entry.fill;
    const colorOk = isPlainObject(f.color) && ['r', 'g', 'b', 'a'].every(k => isFiniteNumber(f.color[k]));
    if (!isPlainObject(f) || !isNonEmptyString(f.kind) || !colorOk || !isFiniteNumber(f.opacity) || typeof f.enabled !== 'boolean'){
      errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `${at}.fill must be null or {kind, color:{r,g,b,a}, opacity, enabled} (substrate fill shape, tools.js:364-368)`, { index }));
    }
  }
}

// Verdict over an ActualState snapshot (or any candidate structure). Plain
// data + all observed fields present + per-field type contracts.
export function validateActualState(state){
  const errors = [];
  if (!isPlainObject(state)){
    return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, 'ActualState must be a plain object')] };
  }
  const fnPath = findFunctionPath(state, 'state');
  if (fnPath) return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, `ActualState must be plain data; function value at ${fnPath}`)] };
  if (!Array.isArray(state.objects) || state.objects.length === 0){
    errors.push(createError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, 'ActualState.objects must be a non-empty array of observed entries (§10)', { field: 'objects' }));
    return { valid: false, errors };
  }
  for (let i = 0; i < state.objects.length; i++) actualEntryErrors(state.objects[i], i, errors);
  return { valid: errors.length === 0, errors };
}

// ---- 5. Deviation (spec §13) ------------------------------------------------

// The 11 §13 fields. Every deviation carries ALL of them — absent optional
// content normalizes to null at creation, so the record shape is total and
// comparable. targetRef is MANDATORY as a field (gate 7): it names the plan
// reference that bound the object ('$doc:<id>' / '$<stepId>') or null for a
// plan-level outcome with no resolvable object (§21).
const DEVIATION_CONTENT_KEYS = Object.freeze([
  'category', 'property', 'expected', 'actual', 'delta', 'tolerance',
  'severity', 'objectId', 'targetRef', 'message'
]);

function deviationFieldErrors(d, errors){
  if (!DEVIATION_CATEGORIES.includes(d.category)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, `deviation.category must be one of ${DEVIATION_CATEGORIES.join('/')}`, { field: 'category', value: d.category }));
  }
  if (!isNonEmptyString(d.property)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.property must be a non-empty string (e.g. width, fill.color, center)', { field: 'property' }));
  }
  if (d.expected !== null && d.expected !== undefined && findFunctionPath(d.expected, 'expected')){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.expected must be plain data (§13/§22)', { field: 'expected' }));
  }
  if (d.actual !== null && d.actual !== undefined && findFunctionPath(d.actual, 'actual')){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.actual must be plain data (§13/§22)', { field: 'actual' }));
  }
  if (d.delta !== null && d.delta !== undefined && !isFiniteNumber(d.delta)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.delta must be null or a finite number (§13: numeric difference when applicable)', { field: 'delta' }));
  }
  if (d.tolerance !== null && d.tolerance !== undefined && (!isFiniteNumber(d.tolerance) || d.tolerance < 0)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.tolerance must be null or a finite number >= 0 (§14: tolerance is part of the contract)', { field: 'tolerance' }));
  }
  if (!DEVIATION_SEVERITIES.includes(d.severity)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, `deviation.severity must be one of ${DEVIATION_SEVERITIES.join('/')}`, { field: 'severity', value: d.severity }));
  }
  if (d.objectId !== null && d.objectId !== undefined && !isNonEmptyString(d.objectId)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.objectId must be null or a non-empty string', { field: 'objectId' }));
  }
  if (!isPlanRefOrNull(d.targetRef)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, "deviation.targetRef must be a '$'-prefixed plan reference ('$doc:<id>' or '$<stepId>') or null (§13)", { field: 'targetRef', value: d.targetRef }));
  }
  if (!isNonEmptyString(d.message)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.message must be a non-empty, deterministic, human-readable string', { field: 'message' }));
  }
}

// §13 API — deterministic deviation construction. Throws
// EvaluationError(INVALID_DEVIATION) on content breaches. The id is
// content-derived (FNV-1a over the key-sorted canonical content, §22): the
// same evidence always yields the same id, any content change moves it.
export function createDeviation(content){
  if (!isPlainObject(content)){
    throw new EvaluationError(EvaluationErrorCodes.INVALID_DEVIATION, 'createDeviation requires a plain-object content record');
  }
  const fnPath = findFunctionPath(content, 'content');
  if (fnPath) throw new EvaluationError(EvaluationErrorCodes.INVALID_DEVIATION, `deviation content must be plain data; function value at ${fnPath}`);
  for (const required of ['category', 'property', 'severity', 'message']){
    if (!Object.prototype.hasOwnProperty.call(content, required) || content[required] === undefined){
      throw new EvaluationError(EvaluationErrorCodes.INVALID_DEVIATION, `createDeviation requires '${required}' explicitly (deterministic construction, no hidden defaults)`, { field: required });
    }
  }
  const d = {
    category: content.category,
    property: content.property,
    expected: content.expected ?? null,
    actual: content.actual ?? null,
    delta: content.delta ?? null,
    tolerance: content.tolerance ?? null,
    severity: content.severity,
    objectId: content.objectId ?? null,
    targetRef: content.targetRef ?? null,
    message: content.message
  };
  const errors = [];
  deviationFieldErrors(d, errors);
  if (errors.length > 0) throw new EvaluationError(errors[0].code, errors[0].message, errors);
  const id = 'dev-' + fnv1a32(stableStringify({
    category: d.category, property: d.property, expected: d.expected, actual: d.actual,
    delta: d.delta, tolerance: d.tolerance, severity: d.severity, objectId: d.objectId,
    targetRef: d.targetRef, message: d.message
  }));
  return deepFreeze({ id, ...d });
}

// Verdict over a deviation record: all 11 §13 keys present (own-property),
// id a non-empty string, content fields valid.
export function validateDeviation(deviation){
  const errors = [];
  if (!isPlainObject(deviation)){
    return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_DEVIATION, 'Deviation must be a plain object')] };
  }
  if (findFunctionPath(deviation, 'deviation')){
    return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_DEVIATION, 'Deviation must be plain data')] };
  }
  for (const key of ['id', ...DEVIATION_CONTENT_KEYS]){
    if (!Object.prototype.hasOwnProperty.call(deviation, key)){
      errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, `deviation.${key} is a mandatory §13 field (targetRef stays mandatory even when its value is null, §21)`, { field: key }));
    }
  }
  if (errors.length > 0) return { valid: false, errors };
  if (!isNonEmptyString(deviation.id)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'deviation.id must be a non-empty string (content-derived, §12/§22)', { field: 'id' }));
  }
  deviationFieldErrors(deviation, errors);
  return { valid: errors.length === 0, errors };
}

// ---- 6. EvaluationResult (spec §12) -----------------------------------------

// Light shape guard over the ExpectedState input (§12: "the ExpectedState
// passed in"). Five sections mirror ai.js:399-407/:439. This is a shape
// check, NOT a re-implementation of Planner validation (§06) — the Planner
// owns its own contracts. The alternate status value stays unused here
// (gate 3): evaluation never relabels desired state as observed state.
const EXPECTED_STATE_SECTIONS = Object.freeze(['geometry', 'spatial', 'appearance', 'constraint', 'structure']);

function expectedShapeErrors(expected){
  const errors = [];
  if (!isPlainObject(expected)){
    return [createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE, 'expected must be a plain-object ExpectedState (ai.js:399-407)')];
  }
  const fnPath = findFunctionPath(expected, 'expected');
  if (fnPath) return [createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE, `expected must be plain data; function value at ${fnPath}`)];
  if (!isNonEmptyString(expected.status)){
    errors.push(createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE, 'expected.status must be a non-empty string (the Planner-produced desired-state marker)', { field: 'status' }));
  }
  for (const section of EXPECTED_STATE_SECTIONS){
    if (!isPlainObject(expected[section])){
      errors.push(createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE, `expected.${section} section missing or invalid (ExpectedState shape, ai.js:399-407)`, { section }));
    }
  }
  return errors;
}

// §12 API — deterministic result construction. status derives EXACTLY from
// the deviations count (gate 5): 'PASS' iff zero, 'DEVIATION' iff > 0.
// metadata is caller-supplied deterministic content (no timestamps, no
// random ids — §12/§22); it defaults to an empty frozen object.
export function createEvaluationResult({ expected, actual, deviations, evaluated, metadata }){
  const expErrors = expectedShapeErrors(expected);
  if (expErrors.length > 0) throw new EvaluationError(expErrors[0].code, expErrors[0].message, expErrors);
  const actCheck = validateActualState(actual);
  if (!actCheck.valid) throw new EvaluationError(EvaluationErrorCodes.INVALID_ACTUAL_STATE, 'createEvaluationResult requires a valid ActualState snapshot (§10)', actCheck.errors);
  if (!Array.isArray(deviations)) throw new EvaluationError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'deviations must be an array of Deviation records (§13)', { field: 'deviations' });
  for (let i = 0; i < deviations.length; i++){
    const check = validateDeviation(deviations[i]);
    if (!check.valid) throw new EvaluationError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `deviations[${i}] is not a valid Deviation (§13)`, { index: i, errors: check.errors });
  }
  if (!Array.isArray(evaluated) || evaluated.length === 0 || !evaluated.every(isNonEmptyString)){
    throw new EvaluationError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'evaluated must be a non-empty array of checked-category strings (§12)', { field: 'evaluated' });
  }
  const meta = metadata === undefined ? {} : metadata;
  if (!isPlainObject(meta)) throw new EvaluationError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'metadata must be a plain object (deterministic content only, §12/§22)', { field: 'metadata' });
  const metaFn = findFunctionPath(meta, 'metadata');
  if (metaFn) throw new EvaluationError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `metadata must be plain data; function value at ${metaFn}`, { field: 'metadata' });
  const status = deviations.length === 0 ? 'PASS' : 'DEVIATION';
  return deepFreeze({
    expected,
    actual,
    status,
    deviations: [...deviations],
    evaluated: [...evaluated],
    metadata: { ...meta }
  });
}

// Verdict over an EvaluationResult (or candidate): the six §12 fields, the
// embedded shapes, and the status/length equivalence in BOTH directions.
export function validateEvaluationResult(result){
  const errors = [];
  if (!isPlainObject(result)){
    return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'EvaluationResult must be a plain object')] };
  }
  const fnPath = findFunctionPath(result, 'result');
  if (fnPath) return { valid: false, errors: [createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `EvaluationResult must be plain data; function value at ${fnPath}`)] };
  for (const key of ['expected', 'actual', 'status', 'deviations', 'evaluated', 'metadata']){
    if (!Object.prototype.hasOwnProperty.call(result, key)){
      errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `EvaluationResult.${key} is a mandatory §12 field`, { field: key }));
    }
  }
  if (errors.length > 0) return { valid: false, errors };
  errors.push(...expectedShapeErrors(result.expected).map(e => createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `result.expected: ${e.message}`, e.details)));
  const actCheck = validateActualState(result.actual);
  if (!actCheck.valid){
    for (const e of actCheck.errors) errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `result.actual: ${e.message}`, e.details));
  }
  if (result.status !== 'PASS' && result.status !== 'DEVIATION'){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, "result.status must be 'PASS' or 'DEVIATION' (§12)", { field: 'status', value: result.status }));
  }
  if (!Array.isArray(result.deviations)){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'result.deviations must be an array (§12)', { field: 'deviations' }));
  } else {
    for (let i = 0; i < result.deviations.length; i++){
      const check = validateDeviation(result.deviations[i]);
      if (!check.valid){
        for (const e of check.errors) errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, `result.deviations[${i}]: ${e.message}`, e.details));
      }
    }
  }
  if (!Array.isArray(result.evaluated) || result.evaluated.length === 0 || !result.evaluated.every(isNonEmptyString)){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'result.evaluated must be a non-empty array of checked-category strings (§12)', { field: 'evaluated' }));
  }
  if (!isPlainObject(result.metadata)){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, 'result.metadata must be a plain object (deterministic content only)', { field: 'metadata' }));
  }
  // Gate 5 enforcement — the equivalence holds in both directions:
  const passLength = Array.isArray(result.deviations) ? result.deviations.length === 0 : false;
  if (result.status === 'PASS' && !passLength){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, "result.status rule (§12/gate 5): status 'PASS' requires deviations.length === 0", { status: result.status, deviationCount: Array.isArray(result.deviations) ? result.deviations.length : null }));
  }
  if (result.status === 'DEVIATION' && passLength){
    errors.push(createError(EvaluationErrorCodes.INVALID_EVALUATION_RESULT, "result.status rule (§12/gate 5): status 'DEVIATION' requires deviations.length > 0", { status: result.status, deviationCount: 0 }));
  }
  return { valid: errors.length === 0, errors };
}

// ---- 7. Evaluation engine (spec §14-§22, §55; Checkpoint B) -----------------

// §14: tolerance is part of the evaluation contract, explicit for every
// numeric comparison. The uniform default is the geometry-kernel discipline
// (1e-9 — the core equality tolerance, geometry.js:5/:338); no per-site
// precision rules are invented.
export const EVALUATION_TOLERANCES = Object.freeze({
  geometry: 1e-9,
  appearance: 1e-9,
  placement: 1e-9,
  transform: 1e-9
});

// Local deterministic color normalizer (§16/§50). The substrate's color
// parser is internal to the dsl module and must stay there, so evaluation
// mirrors its exact semantics: '#RRGGBB' and '#RGB' (duplicated digits;
// parseInt accepts both cases) resolve with alpha 1; a non-hex string
// resolves to black plus the original (the same fallback the substrate
// applied when the fill was written); an object passes through verbatim;
// anything else resolves to black. Mirroring — not diverging — is what
// prevents false appearance deviations for fills the pipeline itself created.
function hexToRgba(value){
  if (typeof value === 'string'){
    if (value.startsWith('#')){
      const hex = value.slice(1);
      if (hex.length === 6){
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
      }
      if (hex.length === 3){
        return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
      }
    }
    return { r: 0, g: 0, b: 0, a: 1, original: value };
  }
  if (typeof value === 'object' && value !== null) return value;
  return { r: 0, g: 0, b: 0, a: 1 };
}

function withinTolerance(actual, expected, tolerance){
  return Math.abs(actual - expected) <= tolerance;
}

// Observed counterpart of an expected geometry field, per observed type.
// width/height exist only on rect params; area uses exactly the builder's
// formulas (rect w*h, ellipse PI*rx*ry — ai.js:415/:420); symmetric needs
// both radii. Unobservable counterparts resolve to null — never invented.
function observedGeometryField(entry, field){
  const g = entry.geometry;
  if (!isPlainObject(g) || !isPlainObject(g.params)) return null;
  const p = g.params;
  switch (field){
    case 'width': return isFiniteNumber(p.width) ? p.width : null;
    case 'height': return isFiniteNumber(p.height) ? p.height : null;
    case 'rx': return isFiniteNumber(p.rx) ? p.rx : null;
    case 'ry': return isFiniteNumber(p.ry) ? p.ry : null;
    case 'area':
      if (g.type === 'rect') return isFiniteNumber(p.width) && isFiniteNumber(p.height) ? p.width * p.height : null;
      if (g.type === 'ellipse') return isFiniteNumber(p.rx) && isFiniteNumber(p.ry) ? Math.PI * p.rx * p.ry : null;
      return null;
    case 'symmetric':
      return isFiniteNumber(p.rx) && isFiniteNumber(p.ry) ? p.rx === p.ry : null;
    default: return null;
  }
}

const GEOMETRY_FIELDS = Object.freeze(['width', 'height', 'rx', 'ry', 'area', 'symmetric']);
const BBOX_FIELDS = Object.freeze(['minX', 'minY', 'maxX', 'maxY']);
const TRANSFORM_KEYS = Object.freeze(['a', 'b', 'c', 'd', 'tx', 'ty']);

// E1 — every evaluation target must exist in the committed doc state (§21).
function evaluateExistenceFor(entry, deviations){
  if (entry.exists) return;
  deviations.push(createDeviation({
    category: 'existence', property: 'exists',
    expected: true, actual: false, delta: null, tolerance: null, severity: 'error',
    objectId: entry.objectId, targetRef: entry.targetRef,
    message: `expected object '${entry.objectId}' does not exist in the committed doc state`
  }));
}

// E2 — expected geometry vs the canonical GeometryStore observation (§15).
function evaluateGeometryFor(expected, entry, deviations){
  let ran = false;
  for (const field of GEOMETRY_FIELDS){
    const exp = expected.geometry[field];
    if (exp === null || exp === undefined) continue;
    ran = true;
    const act = observedGeometryField(entry, field);
    if (typeof exp === 'boolean'){
      if (act !== exp){
        deviations.push(createDeviation({
          category: 'geometry', property: field, expected: exp, actual: act,
          delta: null, tolerance: null, severity: 'error',
          objectId: entry.objectId, targetRef: entry.targetRef,
          message: `geometry.${field} expected ${exp}, observed ${act === null ? 'null (not derivable from the observed geometry)' : act}`
        }));
      }
      continue;
    }
    if (!isFiniteNumber(act)){
      deviations.push(createDeviation({
        category: 'geometry', property: field, expected: exp, actual: null,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `geometry.${field} has no observed numeric counterpart in the canonical geometry record`
      }));
      continue;
    }
    if (!withinTolerance(act, exp, EVALUATION_TOLERANCES.geometry)){
      deviations.push(createDeviation({
        category: 'geometry', property: field, expected: exp, actual: act,
        delta: act - exp, tolerance: EVALUATION_TOLERANCES.geometry, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `geometry.${field} expected ${exp} (tolerance ${EVALUATION_TOLERANCES.geometry}), observed ${act}`
      }));
    }
  }
  return ran;
}

// E3 — expected appearance vs the canonical AppearanceStore observation
// (§16/§50). A hex expectation corresponds to an active solid fill (§16);
// opacity rides on the fill item (substrate shape); color compares in
// canonical RGBA space on both sides.
function evaluateAppearanceFor(expected, entry, deviations){
  const ap = expected.appearance;
  let ran = false;
  if (ap.fill !== null && ap.fill !== undefined){
    ran = true;
    const fill = entry.fill;
    if (fill === null){
      deviations.push(createDeviation({
        category: 'appearance', property: 'fill', expected: ap.fill, actual: null,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `expected fill ${ap.fill} but no fill item is present on the appearance stack`
      }));
    } else if (fill.enabled === false){
      deviations.push(createDeviation({
        category: 'appearance', property: 'fill.enabled', expected: true, actual: false,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: 'the expected fill is not in effect: the observed fill item is disabled'
      }));
    } else if (fill.kind !== 'solid'){
      deviations.push(createDeviation({
        category: 'appearance', property: 'fill.kind', expected: 'solid', actual: fill.kind,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `expected a solid fill (hex expectation ${ap.fill}), observed fill kind '${fill.kind}'`
      }));
    } else {
      const expRgba = hexToRgba(ap.fill);
      const act = fill.color;
      const mismatched = ['r', 'g', 'b', 'a'].some(k => !withinTolerance(act[k], expRgba[k], EVALUATION_TOLERANCES.appearance));
      if (mismatched){
        deviations.push(createDeviation({
          category: 'appearance', property: 'fill.color',
          expected: { r: expRgba.r, g: expRgba.g, b: expRgba.b, a: expRgba.a },
          actual: { r: act.r, g: act.g, b: act.b, a: act.a },
          delta: null, tolerance: EVALUATION_TOLERANCES.appearance, severity: 'error',
          objectId: entry.objectId, targetRef: entry.targetRef,
          message: `fill color differs: expected rgba(${expRgba.r},${expRgba.g},${expRgba.b},${expRgba.a}), observed rgba(${act.r},${act.g},${act.b},${act.a})`
        }));
      }
    }
  }
  if (ap.opacity !== null && ap.opacity !== undefined){
    ran = true;
    const fillUsable = entry.fill !== null && entry.fill.enabled === true;
    const actOpacity = fillUsable && isFiniteNumber(entry.fill.opacity) ? entry.fill.opacity : null;
    if (actOpacity === null){
      deviations.push(createDeviation({
        category: 'appearance', property: 'opacity', expected: ap.opacity, actual: null,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: 'opacity expectation cannot be verified: the observed fill item is absent or not in effect'
      }));
    } else if (!withinTolerance(actOpacity, ap.opacity, EVALUATION_TOLERANCES.appearance)){
      deviations.push(createDeviation({
        category: 'appearance', property: 'opacity', expected: ap.opacity, actual: actOpacity,
        delta: actOpacity - ap.opacity, tolerance: EVALUATION_TOLERANCES.appearance, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `opacity expected ${ap.opacity} (tolerance ${EVALUATION_TOLERANCES.appearance}), observed ${actOpacity}`
      }));
    }
  }
  return ran;
}

// E4 — expected placement vs observed world-space placement (§17). The
// artboard is never guessed: a centered expectation requires a finite
// artboard center in the evaluation context (MISSING_PARAMETER otherwise).
function artboardErrors(evaluationContext, required){
  if (!required) return [];
  const a = evaluationContext.artboard;
  if (!isPlainObject(a) || !isFiniteNumber(a.centerX) || !isFiniteNumber(a.centerY)){
    return [createError(EvaluationErrorCodes.MISSING_PARAMETER,
      'evaluationContext.artboard {centerX, centerY} is required when a centered placement expectation exists — the artboard is never guessed (spec §17)')];
  }
  return [];
}

function evaluatePlacementFor(expected, entry, deviations, evaluationContext){
  const sp = expected.spatial;
  const centered = sp.centered === true;
  const bboxExpected = sp.bbox !== null && sp.bbox !== undefined ? sp.bbox : null;
  if (!centered && bboxExpected === null) return false;
  if (centered){
    const expCenter = { x: evaluationContext.artboard.centerX, y: evaluationContext.artboard.centerY };
    const center = entry.worldBBox === null ? null : bboxCenter(entry.worldBBox);
    if (center === null){
      deviations.push(createDeviation({
        category: 'placement', property: 'center', expected: expCenter, actual: null,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: 'centered placement expected but no world bounding box is observable for this target'
      }));
    } else {
      const okX = withinTolerance(center.x, expCenter.x, EVALUATION_TOLERANCES.placement);
      const okY = withinTolerance(center.y, expCenter.y, EVALUATION_TOLERANCES.placement);
      if (!okX || !okY){
        deviations.push(createDeviation({
          category: 'placement', property: 'center', expected: expCenter,
          actual: { x: center.x, y: center.y },
          delta: null, tolerance: EVALUATION_TOLERANCES.placement, severity: 'error',
          objectId: entry.objectId, targetRef: entry.targetRef,
          message: `observed world-bbox center (${center.x},${center.y}) differs from the artboard center (${expCenter.x},${expCenter.y})`
        }));
      }
    }
  }
  if (bboxExpected !== null){
    if (entry.worldBBox === null){
      deviations.push(createDeviation({
        category: 'placement', property: 'bbox', expected: { ...bboxExpected }, actual: null,
        delta: null, tolerance: null, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: 'expected world bbox but no world bounding box is observable for this target'
      }));
    } else {
      for (const f of BBOX_FIELDS){
        const act = entry.worldBBox[f];
        if (!withinTolerance(act, bboxExpected[f], EVALUATION_TOLERANCES.placement)){
          deviations.push(createDeviation({
            category: 'placement', property: `bbox.${f}`, expected: bboxExpected[f], actual: act,
            delta: act - bboxExpected[f], tolerance: EVALUATION_TOLERANCES.placement, severity: 'error',
            objectId: entry.objectId, targetRef: entry.targetRef,
            message: `world bbox.${f} expected ${bboxExpected[f]} (tolerance ${EVALUATION_TOLERANCES.placement}), observed ${act}`
          }));
        }
      }
    }
  }
  return true;
}

// E5 — expected grouping vs the observed parent-is-group fact (§18). The
// observation is directional: grouped:true is violated unless the parent is
// a group; grouped:false is violated only by an observed group parent
// (parentIsGroup null = no parent node = not grouped, consistent with false).
function evaluateStructureFor(expected, entry, deviations){
  const grouped = expected.structure.grouped;
  if (grouped === null || grouped === undefined) return false;
  const act = entry.parentIsGroup;
  const violated = grouped ? (act !== true) : (act === true);
  if (violated){
    const observed = act === null ? 'no parent node (not grouped)' : act;
    deviations.push(createDeviation({
      category: 'structure', property: 'grouped', expected: grouped, actual: act,
      delta: null, tolerance: null, severity: 'error',
      objectId: entry.objectId, targetRef: entry.targetRef,
      message: `structure.grouped expected ${grouped}, observed ${observed}`
    }));
  }
  return true;
}

// E7 — transform expectations: dormant while null (§19 — no invented
// transform deviation), per-key numeric comparison when set. The ExpectedState
// shape carries no transform section; when one is hand-supplied it must be a
// plain object over the world-transform keys with null or finite values.
function transformExpectationErrors(expected){
  const t = expected.transform;
  if (t === null || t === undefined) return [];
  if (!isPlainObject(t)){
    return [createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE,
      'expected.transform must be null or a plain object over the world-transform keys', { section: 'transform' })];
  }
  const errors = [];
  for (const k of Object.keys(t)){
    if (!TRANSFORM_KEYS.includes(k)){
      errors.push(createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE,
        `expected.transform.${k} is not a supported transform expectation key (supported: ${TRANSFORM_KEYS.join(',')})`, { key: k }));
    } else if (t[k] !== null && !isFiniteNumber(t[k])){
      errors.push(createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE,
        `expected.transform.${k} must be null or a finite number`, { key: k, value: t[k] }));
    }
  }
  return errors;
}

function activeTransformExpectations(expected){
  const t = expected.transform;
  if (!isPlainObject(t)) return null;
  const active = {};
  let any = false;
  for (const k of TRANSFORM_KEYS){
    if (t[k] !== null && t[k] !== undefined){ active[k] = t[k]; any = true; }
  }
  return any ? active : null;
}

function evaluateTransformFor(entry, deviations, activeTransform){
  if (activeTransform === null) return false;
  const wt = entry.worldTransform;
  if (wt === null){
    deviations.push(createDeviation({
      category: 'transform', property: 'transform', expected: { ...activeTransform }, actual: null,
      delta: null, tolerance: null, severity: 'error',
      objectId: entry.objectId, targetRef: entry.targetRef,
      message: 'transform expectations exist but no world transform is observable for this target'
    }));
    return true;
  }
  for (const k of TRANSFORM_KEYS){
    if (!Object.prototype.hasOwnProperty.call(activeTransform, k)) continue;
    const act = wt[k];
    if (!withinTolerance(act, activeTransform[k], EVALUATION_TOLERANCES.transform)){
      deviations.push(createDeviation({
        category: 'transform', property: `transform.${k}`, expected: activeTransform[k], actual: act,
        delta: act - activeTransform[k], tolerance: EVALUATION_TOLERANCES.transform, severity: 'error',
        objectId: entry.objectId, targetRef: entry.targetRef,
        message: `transform.${k} expected ${activeTransform[k]} (tolerance ${EVALUATION_TOLERANCES.transform}), observed ${act}`
      }));
    }
  }
  return true;
}

// Expectations evaluation cannot verify from the injected read surface are
// self-reported here — never silently dropped, never converted into invented
// deviations (§19/§20 honesty). Fixed declaration order (deterministic, §22):
// the alignment intent records only a bare aligned flag (no axis/reference to
// compare against), and stroke/constraint/semantic have no observed
// counterpart in the ActualState surface.
function unevaluatedExpectations(expected){
  const out = [];
  if (expected.spatial.aligned === true) out.push('spatial.aligned');
  if (expected.appearance.stroke !== null && expected.appearance.stroke !== undefined) out.push('appearance.stroke');
  if (typeof expected.constraint.satisfied === 'boolean') out.push('constraint.satisfied');
  if (expected.semantic !== null && expected.semantic !== undefined) out.push('semantic');
  return out;
}

// §55 API — the deterministic evaluation engine. Contract order:
// expected shape (light guard + desired-status marker + transform contract),
// placement prerequisites (the artboard is never guessed), then the read-only
// ActualState build (§11) and the per-target comparison. Deviations emerge in
// the declared order: target-major (evaluationContext.targets order), then
// the fixed category rank existence -> geometry -> appearance -> placement ->
// structure -> transform, then each category's fixed property order.
// Existence failure short-circuits the deeper checks for that target (§21:
// nothing further is observable). Returns a frozen EvaluationResult built
// through createEvaluationResult, so the §12/§13 contracts enforce themselves
// on every output.
export function evaluate(expectedState, documentContext, evaluationContext){
  const expErrors = expectedShapeErrors(expectedState);
  if (expErrors.length === 0 && expectedState.status !== 'requested'){
    expErrors.push(createError(EvaluationErrorCodes.INVALID_EXPECTED_STATE,
      "expected.status must be 'requested' — evaluation consumes the desired-state record (spec §08/§09)"));
  }
  if (expErrors.length === 0) expErrors.push(...transformExpectationErrors(expectedState));
  if (expErrors.length > 0) throw new EvaluationError(expErrors[0].code, expErrors[0].message, expErrors);
  const abErrors = artboardErrors(evaluationContext, expectedState.spatial.centered === true);
  if (abErrors.length > 0) throw new EvaluationError(abErrors[0].code, abErrors[0].message, abErrors);
  const actual = buildActualState(documentContext, evaluationContext);
  const activeTransform = activeTransformExpectations(expectedState);
  const deviations = [];
  const ran = { existence: true, geometry: false, appearance: false, placement: false, structure: false, transform: false };
  for (const entry of actual.objects){
    evaluateExistenceFor(entry, deviations);
    if (!entry.exists) continue;
    if (evaluateGeometryFor(expectedState, entry, deviations)) ran.geometry = true;
    if (evaluateAppearanceFor(expectedState, entry, deviations)) ran.appearance = true;
    if (evaluatePlacementFor(expectedState, entry, deviations, evaluationContext)) ran.placement = true;
    if (evaluateStructureFor(expectedState, entry, deviations)) ran.structure = true;
    if (evaluateTransformFor(entry, deviations, activeTransform)) ran.transform = true;
  }
  const evaluated = ['existence', 'geometry', 'appearance', 'placement', 'structure', 'transform'].filter(c => ran[c]);
  // PHASE 3.16 — the constraint-compliance arm (see the section header): the
  // compliance request rides in expected.constraint.satisfied; a bare boolean
  // flag stays the 3.14 unevaluated marker (the records, not the flag, are
  // the evaluable form).
  let compliance = null;
  const constraintRequest = isPlainObject(expectedState.constraint) ? expectedState.constraint.satisfied : undefined;
  if (isPlainObject(constraintRequest) && Array.isArray(constraintRequest.records)){
    if (constraintRequest.tolerance !== undefined && (!isFiniteNumber(constraintRequest.tolerance) || constraintRequest.tolerance < 0)){
      throw new EvaluationError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint compliance request .tolerance must be a finite number >= 0');
    }
    const tolerance = isFiniteNumber(constraintRequest.tolerance) ? constraintRequest.tolerance : EVALUATION_TOLERANCES.geometry;
    compliance = constraintCompliance(constraintRequest.records, actual, tolerance);
    deviations.push(...compliance.deviations);
    evaluated.push('constraint');
  }
  const metadata = {
    tolerances: { ...EVALUATION_TOLERANCES },
    unevaluatedExpectations: unevaluatedExpectations(expectedState)
  };
  if (compliance !== null){
    metadata.constraintDeviations = compliance.constraintDeviations;
    metadata.constraintResults = compliance.results;
  }
  return createEvaluationResult({ expected: expectedState, actual, deviations, evaluated, metadata });
}

// ============================================================================
// PHASE 3.16 — CONSTRAINT COMPLIANCE (internal arm; NO new exports — the
// 12-export A/B-era surface is pinned). The compliance rides INSIDE the §55
// evaluate() entry: an ExpectedState whose constraint.satisfied section is a
// compliance request {records: [...], tolerance?} DECLARES the accepted
// constraint regime as the desired state, and evaluate() verifies it against
// the observed world boxes of the participants (the post-acceptance drift
// model: accepted constraints OUTLIVE their originating plan).
// ============================================================================
//
// PROPERTY NAMESPACING (the engine-correctability calibration): the deviation
// property names the PINNED QUANTITY's class —
//     alignLeft/alignRight/alignCenterX/vertical -> 'position.x'
//     alignTop/alignBottom/alignCenterY/horizontal -> 'position.y'
//     equalWidth  -> 'size.width'
//     equalHeight -> 'size.height'
//     fixedDistance -> 'position.distance'
// Position-class deviations are the engine-correctable route (the frozen
// correction derivation table carries a T05 rule for exactly
// 'position.x'/'position.y'); size-class and distance-class deviations are
// honest proposal-class gaps (no SAFE capability — the T06 origin-anchored
// scale mutates position as a side effect).
//
// LOCALIZATION: like the house constraint kernel, the arm reports ONE
// violation per constraint — the FIRST failing participant beyond the
// reference (objectIds[0]) in objectIds order. Unobservable constraints
// (missing participant, unmeasurable geometry) are UNVERIFIABLE — nothing is
// invented (§15/§19/§21 honesty). Disabled constraints are DISABLED and
// invisible. The per-constraint verdicts ride in
// metadata.constraintResults; the deviation provenance (constraintId, the
// violated participant, the reference) rides in
// metadata.constraintDeviations — the §23 critic's constraint rule consumes
// exactly that provenance.

const CONSTRAINT_PINNED_PROPERTIES = deepFreeze({
  alignLeft: { property: 'position.x', quantity: 'minX', label: 'minX' },
  alignRight: { property: 'position.x', quantity: 'maxX', label: 'maxX' },
  alignTop: { property: 'position.y', quantity: 'minY', label: 'minY' },
  alignBottom: { property: 'position.y', quantity: 'maxY', label: 'maxY' },
  alignCenterX: { property: 'position.x', quantity: 'centerX', label: 'centerX' },
  alignCenterY: { property: 'position.y', quantity: 'centerY', label: 'centerY' },
  horizontal: { property: 'position.y', quantity: 'centerY', label: 'centerY' },
  vertical: { property: 'position.x', quantity: 'centerX', label: 'centerX' },
  equalWidth: { property: 'size.width', quantity: 'width', label: 'width' },
  equalHeight: { property: 'size.height', quantity: 'height', label: 'height' },
  fixedDistance: { property: 'position.distance', quantity: 'distance', label: 'center distance' }
});

function constraintRecordShapeErrors(record){
  const errors = [];
  if (!isPlainObject(record)) return [createError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint record must be a plain object')];
  if (!isNonEmptyString(record.id)) errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint record .id must be a non-empty string'));
  if (!isNonEmptyString(record.type) || CONSTRAINT_PINNED_PROPERTIES[record.type] === undefined){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint record .type must be a supported house constraint type'));
  }
  if (!Array.isArray(record.objectIds) || record.objectIds.length < 2 || !record.objectIds.every(isNonEmptyString)){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint record .objectIds must carry at least two object ids'));
  }
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean'){
    errors.push(createError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint record .enabled must be boolean when present'));
  }
  return errors;
}

function bboxQuantityOf(bbox, quantity){
  if (quantity === 'width') return isFiniteNumber(bbox.maxX - bbox.minX) ? bbox.maxX - bbox.minX : null;
  if (quantity === 'height') return isFiniteNumber(bbox.maxY - bbox.minY) ? bbox.maxY - bbox.minY : null;
  if (quantity === 'centerX') return isFiniteNumber(bbox.minX) && isFiniteNumber(bbox.maxX) ? (bbox.minX + bbox.maxX) / 2 : null;
  if (quantity === 'centerY') return isFiniteNumber(bbox.minY) && isFiniteNumber(bbox.maxY) ? (bbox.minY + bbox.maxY) / 2 : null;
  return isFiniteNumber(bbox[quantity]) ? bbox[quantity] : null;
}

// The compliance core: plain house records + the §10 snapshot -> {deviations,
// results, constraintDeviations}. Pure, read-only, deterministic.
function constraintCompliance(constraints, actualState, tolerance){
  const deviations = [];
  const results = [];
  const constraintDeviations = [];
  for (const record of constraints){
    const shape = constraintRecordShapeErrors(record);
    if (shape.length > 0){
      throw new EvaluationError(EvaluationErrorCodes.INVALID_DEVIATION, 'constraint compliance: invalid constraint record', shape);
    }
    const spec = CONSTRAINT_PINNED_PROPERTIES[record.type];
    if (record.enabled === false){
      results.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'DISABLED' }));
      continue;
    }
    const boxes = [];
    let unverifiable = null;
    for (const oid of record.objectIds){
      const entry = actualState.objects.find(e => e.objectId === oid);
      if (!entry || entry.exists !== true){ unverifiable = { objectId: oid, reason: 'OBJECT_UNOBSERVED' }; break; }
      if (!isPlainObject(entry.worldBBox)){ unverifiable = { objectId: oid, reason: 'GEOMETRY_UNMEASURABLE' }; break; }
      boxes.push({ objectId: oid, bbox: entry.worldBBox });
    }
    if (unverifiable !== null){
      results.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'UNVERIFIABLE', reason: unverifiable.reason, objectId: unverifiable.objectId }));
      continue;
    }
    if (record.type === 'fixedDistance' && !isFiniteNumber(record.parameters ? record.parameters.distance : undefined)){
      results.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'UNVERIFIABLE', reason: 'MISSING_DISTANCE_PARAMETER', objectId: record.objectIds[0] }));
      continue;
    }
    const reference = boxes[0];
    const expected = record.type === 'fixedDistance'
      ? record.parameters.distance
      : bboxQuantityOf(reference.bbox, spec.quantity);
    let violated = null;
    for (let i = 1; i < boxes.length; i++){
      const actual = record.type === 'fixedDistance'
        ? Math.hypot((boxes[i].bbox.minX + boxes[i].bbox.maxX) / 2 - (reference.bbox.minX + reference.bbox.maxX) / 2,
                     (boxes[i].bbox.minY + boxes[i].bbox.maxY) / 2 - (reference.bbox.minY + reference.bbox.maxY) / 2)
        : bboxQuantityOf(boxes[i].bbox, spec.quantity);
      if (!isFiniteNumber(actual)) continue;
      const error = Math.abs(actual - expected);
      if (error > tolerance){ violated = { participant: boxes[i], actual, error }; break; }
    }
    if (violated === null){
      results.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'SATISFIED', expected, tolerance }));
      continue;
    }
    const deviation = createDeviation({
      category: 'geometry',
      property: spec.property,
      expected,
      actual: violated.actual,
      delta: violated.actual - expected,
      tolerance,
      severity: 'error',
      objectId: violated.participant.objectId,
      targetRef: '$doc:' + violated.participant.objectId,
      message: `constraint '${record.type}' (${record.id}) violated: object '${violated.participant.objectId}' ${spec.label} ${violated.actual} deviates ${violated.error} from reference '${reference.objectId}' ${spec.label} ${expected} (tolerance ${tolerance})`
    });
    deviations.push(deviation);
    results.push(deepFreeze({ constraintId: record.id, type: record.type, status: 'VIOLATED', property: spec.property,
      expected, actual: violated.actual, error: violated.error, tolerance,
      referenceObjectId: reference.objectId, violatedObjectId: violated.participant.objectId }));
    constraintDeviations.push(deepFreeze({ deviationId: deviation.id, constraintId: record.id, type: record.type,
      strength: record.strength === undefined ? null : record.strength, objectIds: [...record.objectIds],
      referenceObjectId: reference.objectId, violatedObjectId: violated.participant.objectId,
      property: spec.property, expected, actual: violated.actual, error: violated.error, tolerance }));
  }
  return { deviations, results, constraintDeviations };
}
