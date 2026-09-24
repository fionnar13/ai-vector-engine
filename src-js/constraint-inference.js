// ============================================================================
// src-js/constraint-inference.js — CONSTRAINT INFERENCE (PHASE 3.16, T19)
// ============================================================================
// ZERO-IMPORT PIN (the correction.js A-era discipline): this module declares
// NO imports — every capability is local, deterministic, and pure. It reads
// nothing from the substrate, writes nothing anywhere, and holds no state.
//
// SCOPE (the A-2/D-8 intersection): T19 — the constraint-inference vocabulary
// — supports EXACTLY FOUR constraint TYPES:
//     {equalWidth, equalHeight, align, center}
// and maps them onto the house constraint vocabulary (constraints.js
// VALID_TYPES):
//     equalWidth  -> equalWidth
//     equalHeight -> equalHeight
//     align       -> alignLeft | alignRight | alignTop | alignBottom
//     center      -> alignCenterX | alignCenterY
// T19 never invents constraint types outside the intersection, never emits a
// house type outside the live vocabulary, and never infers HARD ('required')
// constraints — hard pinning is an explicit user act, not an inference (the
// inferred strength vocabulary is {strong, weak}).
//
// DATA CONTRACTS: inferConstraints(request) -> deep-frozen
// {proposals: [...], unmatched: [...]}. A proposal carries the exact key set
// T19_PROPOSAL_KEYS; its id is a CONTENT-DERIVED UUID-v4-FORMAT string
// (deterministic: the same logical constraint — same type, participants, and
// parameters — yields the same id across paraphrases and runs; any logical
// change moves the id). toHouseConstraintRecord(proposal) produces the plain
// house record shape the LIVE ConstraintStore accepts verbatim, with the
// id/partial identity chain preserved (pass-through, no re-id).
//
// DETERMINISM (Invariant 17): no entropy sources — ids come from four
// independent seeded FNV-1a passes over the key-sorted canonical content;
// phrase matching runs a fixed table in fixed order; outputs are deep-frozen
// plain data. Byte-identical inputs give byte-identical outputs.
//
// NO-MUTATION: every entry point is read-only over its inputs (the acceptance
// store clones; nothing here aliases caller structures).
// ============================================================================

// ---- 0. Vocabulary ----------------------------------------------------------

export const T19_SUPPORTED_TYPES = Object.freeze(['equalWidth', 'equalHeight', 'align', 'center']);

export const T19_HOUSE_MAPPING = Object.freeze({
  equalWidth: Object.freeze(['equalWidth']),
  equalHeight: Object.freeze(['equalHeight']),
  align: Object.freeze(['alignLeft', 'alignRight', 'alignTop', 'alignBottom']),
  center: Object.freeze(['alignCenterX', 'alignCenterY'])
});

export const T19_PROPOSAL_KEYS = Object.freeze([
  'id', 't19Type', 'houseType', 'objectIds', 'strength', 'source', 'confidence', 'provenance'
]);

// The full live house vocabulary (constraints.js VALID_TYPES, mirrored for the
// pass-through validator — this module stays zero-import).
const ALL_HOUSE_TYPES = Object.freeze([
  'horizontal', 'vertical', 'alignLeft', 'alignRight', 'alignTop', 'alignBottom',
  'alignCenterX', 'alignCenterY', 'equalWidth', 'equalHeight', 'fixedDistance'
]);
const HOUSE_STRENGTHS = Object.freeze(['required', 'strong', 'weak']);
const INFERRED_STRENGTHS = Object.freeze(['strong', 'weak']);
const HOUSE_SOURCES = Object.freeze(['user', 'ai']);

// The deterministic phrase table (fixed order; first match per row wins;
// houseType dedup keeps the first). 'equal-size' expands to BOTH size
// constraints — the one multi-target phrase in the vocabulary.
const PHRASE_TABLE = Object.freeze([
  ['equal width', 'equalWidth'],
  ['same width', 'equalWidth'],
  ['equal height', 'equalHeight'],
  ['same height', 'equalHeight'],
  ['equal-size', 'equalWidth'],
  ['equal size', 'equalWidth'],
  ['equal-size', 'equalHeight'],
  ['equal size', 'equalHeight'],
  ['align the left edges', 'alignLeft'],
  ['align the left edge', 'alignLeft'],
  ['left edges aligned', 'alignLeft'],
  ['align the right edges', 'alignRight'],
  ['right edges aligned', 'alignRight'],
  ['align the top edges', 'alignTop'],
  ['top edges aligned', 'alignTop'],
  ['align the bottom edges', 'alignBottom'],
  ['bottom edges aligned', 'alignBottom'],
  ['align left', 'alignLeft'],
  ['align right', 'alignRight'],
  ['align top', 'alignTop'],
  ['align bottom', 'alignBottom'],
  ['centered horizontally', 'alignCenterX'],
  ['centered vertically', 'alignCenterY']
]);
const CENTER_EXPANSION = Object.freeze({ alignCenterX: 'center:x', alignCenterY: 'center:y' });

// ---- 1. Error model (house style) -------------------------------------------

export const InferenceErrorCodes = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_PROPOSAL: 'INVALID_PROPOSAL',
  INVALID_RECORD: 'INVALID_RECORD'
});

export class InferenceError extends Error {
  constructor(code, message, details){
    super(message);
    this.name = 'InferenceError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function createError(code, message, details){
  const e = { code, message };
  if (details !== undefined) e.details = details;
  return e;
}

function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNumber(v){ return typeof v === 'number' && Number.isFinite(v); }
function isNonEmptyString(v){ return typeof v === 'string' && v.length > 0; }

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

function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ---- 2. Content-derived identity (deterministic UUID-v4 FORMAT) -------------

// Four independent seeded FNV-1a passes over the canonical content -> 32 hex
// digits -> the v4 layout (version nibble '4', variant nibble '8'). No
// entropy, no wall clock; the same logical constraint always yields the same
// id and any logical change moves it.
function fnv1a32(str, offsetBasis){
  let h = offsetBasis >>> 0;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function deterministicUUID(content){
  const c = stableStringify(content) + '#' + stableStringify(content).length;
  const hex = fnv1a32(c, 0x811c9dc5) + fnv1a32(c, 0x01000193) + fnv1a32(c, 0x9dc5813d) + fnv1a32(c, 0x7fea3d1b);
  const raw = hex.split('');
  raw[12] = '4';   // version nibble (first char of the third group)
  raw[16] = '8';   // variant nibble (first char of the fourth group)
  const joined = raw.join('');
  return `${joined.slice(0,8)}-${joined.slice(8,12)}-${joined.slice(12,16)}-${joined.slice(16,20)}-${joined.slice(20,32)}`;
}

function isUUIDFormat(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

// ---- 3. Request validation (§ data contracts) --------------------------------

export function validateInferenceRequest(request){
  const errors = [];
  if (!isPlainObject(request)){
    return deepFreeze({ valid: false, errors: [createError(InferenceErrorCodes.INVALID_REQUEST, 'InferenceRequest must be a plain object')] });
  }
  const fnPath = findFunctionPath(request, 'request');
  if (fnPath){
    return deepFreeze({ valid: false, errors: [createError(InferenceErrorCodes.INVALID_REQUEST, `InferenceRequest must be plain data; function value at ${fnPath}`)] });
  }
  if (!isNonEmptyString(request.utterance)){
    errors.push(createError(InferenceErrorCodes.INVALID_REQUEST, 'request.utterance must be a non-empty string', { field: 'utterance' }));
  }
  if (!Array.isArray(request.objects) || request.objects.length < 2){
    errors.push(createError(InferenceErrorCodes.INVALID_REQUEST, 'request.objects must be an array of at least two object entries (constraints relate >=2 objects)', { field: 'objects' }));
  } else {
    for (let i = 0; i < request.objects.length; i++){
      const o = request.objects[i];
      if (!isPlainObject(o) || !isNonEmptyString(o.id)){
        errors.push(createError(InferenceErrorCodes.INVALID_REQUEST, `request.objects[${i}] must be a plain object with a non-empty string id`, { index: i }));
      }
    }
  }
  if (request.strength !== undefined && !INFERRED_STRENGTHS.includes(request.strength)){
    errors.push(createError(InferenceErrorCodes.INVALID_REQUEST, 'request.strength must be strong or weak — T19 never infers hard (required) constraints', { value: request.strength }));
  }
  return deepFreeze({ valid: errors.length === 0, errors });
}

// ---- 4. The inference entry (T19) --------------------------------------------

// Deterministic vocabulary mapping over a fixed phrase table. Each table row
// matches at most once (first occurrence), rows run in fixed order, and the
// resulting houseType set is deduped first-wins. An utterance that maps
// nothing is reported honestly in `unmatched` — nothing is invented.
export function inferConstraints(request){
  const check = validateInferenceRequest(request);
  if (!check.valid){
    throw new InferenceError(check.errors[0].code, 'inferConstraints requires a valid request (validateInferenceRequest)', check.errors);
  }
  const utterance = request.utterance.toLowerCase();
  const objectIds = request.objects.map(o => o.id);
  const strength = request.strength === undefined ? 'strong' : request.strength;
  const proposals = [];
  const seenHouseTypes = new Set();
  const propose = (t19Type, houseType, phrase) => {
    if (seenHouseTypes.has(houseType)) return;
    seenHouseTypes.add(houseType);
    proposals.push(deepFreeze({
      id: deterministicUUID({ t19Type, houseType, objectIds, parameters: {} }),
      t19Type,
      houseType,
      objectIds: [...objectIds],
      strength,
      source: 'ai',
      confidence: 1,
      provenance: { phrase, rule: 'T19:' + t19Type }
    }));
  };
  // the reverse map: house type -> owning T19 type (the A-2/D-8 intersection)
  const houseToT19 = {};
  for (const t of T19_SUPPORTED_TYPES){
    for (const h of T19_HOUSE_MAPPING[t]) houseToT19[h] = t;
  }
  for (const [phrase, houseType] of PHRASE_TABLE){
    if (utterance.includes(phrase)){
      propose(houseToT19[houseType], houseType, phrase);
    }
  }
  if (utterance.includes('centered') && !seenHouseTypes.has('alignCenterX') && !seenHouseTypes.has('alignCenterY')){
    // the unqualified 'centered' phrase expands to BOTH center axes in the
    // deterministic x-then-y order (rows above already consumed the
    // qualified axis phrasings)
    for (const houseType of T19_HOUSE_MAPPING.center){
      propose('center', houseType, CENTER_EXPANSION[houseType]);
    }
  }
  const unmatched = (proposals.length === 0 && request.utterance.length > 0) ? [request.utterance] : [];
  return deepFreeze({ proposals, unmatched });
}

// ---- 5. Proposal + house-record validation and the pass-through --------------

export function validateInferredConstraint(proposal){
  const errors = [];
  if (!isPlainObject(proposal)){
    return deepFreeze({ valid: false, errors: [createError(InferenceErrorCodes.INVALID_PROPOSAL, 'InferredConstraint must be a plain object')] });
  }
  const fnPath = findFunctionPath(proposal, 'proposal');
  if (fnPath){
    return { valid: false, errors: [createError(InferenceErrorCodes.INVALID_PROPOSAL, `InferredConstraint must be plain data; function value at ${fnPath}`)] };
  }
  for (const key of T19_PROPOSAL_KEYS){
    if (!Object.prototype.hasOwnProperty.call(proposal, key)){
      errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, `proposal.${key} is a mandatory T19 field`, { field: key }));
    }
  }
  if (errors.length > 0) return deepFreeze({ valid: errors.length === 0, errors });
  if (!isUUIDFormat(proposal.id)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, 'proposal.id must be a content-derived UUID-v4-format string', { field: 'id', value: proposal.id }));
  }
  if (!T19_SUPPORTED_TYPES.includes(proposal.t19Type)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, `proposal.t19Type must be one of ${T19_SUPPORTED_TYPES.join('/')}`, { field: 't19Type', value: proposal.t19Type }));
  }
  const allowed = T19_HOUSE_MAPPING[proposal.t19Type];
  if (allowed && !allowed.includes(proposal.houseType)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, `proposal.houseType must be one of ${allowed.join('/')} for t19Type ${proposal.t19Type}`, { field: 'houseType', value: proposal.houseType }));
  }
  if (!Array.isArray(proposal.objectIds) || proposal.objectIds.length < 2 || !proposal.objectIds.every(isNonEmptyString)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, 'proposal.objectIds must be an array of at least two non-empty strings', { field: 'objectIds' }));
  }
  if (!INFERRED_STRENGTHS.includes(proposal.strength)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, 'proposal.strength must be strong or weak (T19 never infers hard constraints)', { field: 'strength', value: proposal.strength }));
  }
  if (proposal.source !== 'ai'){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, "proposal.source must be 'ai' (the inference origin)", { field: 'source', value: proposal.source }));
  }
  if (!isFiniteNumber(proposal.confidence) || proposal.confidence <= 0 || proposal.confidence > 1){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, 'proposal.confidence must be a finite number in (0,1]', { field: 'confidence', value: proposal.confidence }));
  }
  if (!isPlainObject(proposal.provenance)){
    errors.push(createError(InferenceErrorCodes.INVALID_PROPOSAL, 'proposal.provenance must be a plain object {phrase, rule}', { field: 'provenance' }));
  }
  return deepFreeze({ valid: errors.length === 0, errors });
}

// The acceptance projection: proposal -> the plain house record the LIVE
// ConstraintStore accepts verbatim. Pass-through discipline: the id, the
// participant order, and the strength are preserved verbatim (no re-id, no
// reshaping); the house type is the mapped type; the audit trail rides in
// provenance.
export function toHouseConstraintRecord(proposal){
  const check = validateInferredConstraint(proposal);
  if (!check.valid){
    throw new InferenceError(check.errors[0].code, 'toHouseConstraintRecord requires a valid InferredConstraint', check.errors);
  }
  return deepFreeze({
    id: proposal.id,
    type: proposal.houseType,
    objectIds: [...proposal.objectIds],
    enabled: true,
    strength: proposal.strength,
    source: proposal.source,
    parameters: {},
    provenance: { t19Type: proposal.t19Type, inferredBy: 'T19' }
  });
}

// The pass-through validator: a SHAPE verdict over canonical house records of
// the FULL live vocabulary (all eleven types) — canonical records validate
// unchanged and are never transformed by this module.
export function validateHouseConstraintRecord(record){
  const errors = [];
  if (!isPlainObject(record)){
    return deepFreeze({ valid: false, errors: [createError(InferenceErrorCodes.INVALID_RECORD, 'HouseConstraintRecord must be a plain object')] });
  }
  const fnPath = findFunctionPath(record, 'record');
  if (fnPath){
    return { valid: false, errors: [createError(InferenceErrorCodes.INVALID_RECORD, `HouseConstraintRecord must be plain data; function value at ${fnPath}`)] };
  }
  for (const key of ['id', 'type', 'objectIds', 'enabled', 'strength', 'source', 'parameters']){
    if (!Object.prototype.hasOwnProperty.call(record, key)){
      errors.push(createError(InferenceErrorCodes.INVALID_RECORD, `record.${key} is a mandatory house field`, { field: key }));
    }
  }
  if (errors.length > 0) return deepFreeze({ valid: errors.length === 0, errors });
  if (!isUUIDFormat(record.id)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.id must be a UUID-v4-format string', { field: 'id', value: record.id }));
  }
  if (!ALL_HOUSE_TYPES.includes(record.type)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.type must be a live house constraint type', { field: 'type', value: record.type }));
  }
  if (!Array.isArray(record.objectIds) || record.objectIds.length === 0 || !record.objectIds.every(isNonEmptyString)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.objectIds must be a non-empty array of non-empty strings', { field: 'objectIds' }));
  }
  if (typeof record.enabled !== 'boolean'){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.enabled must be boolean', { field: 'enabled' }));
  }
  if (!HOUSE_STRENGTHS.includes(record.strength)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.strength must be required, strong, or weak', { field: 'strength', value: record.strength }));
  }
  if (!HOUSE_SOURCES.includes(record.source)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, "record.source must be 'user' or 'ai'", { field: 'source', value: record.source }));
  }
  if (!isPlainObject(record.parameters)){
    errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'record.parameters must be a plain object', { field: 'parameters' }));
  } else if (record.type === 'fixedDistance'){
    if (!isFiniteNumber(record.parameters.distance)){
      errors.push(createError(InferenceErrorCodes.INVALID_RECORD, 'fixedDistance requires a finite parameters.distance', { field: 'parameters.distance' }));
    }
  }
  return deepFreeze({ valid: errors.length === 0, errors });
}
