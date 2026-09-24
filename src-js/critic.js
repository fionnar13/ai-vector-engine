// ============================================================================
// src-js/critic.js — CRITIC CORE (PHASE 3.14, Checkpoint C)
// ============================================================================
// Spec scope: §23-§35 (Critic responsibility / read-only / CorrectionProposal /
// proposal-is-not-execution / deterministic rule engine / unsupported
// corrections / proposal determinism + ordering / correction-loop boundary),
// §56 (Checkpoint C), §65 gates 21-24.
//
// ARCHITECTURE BOUNDARY (spec §24/§26/§31/§52):
//   - The Critic is READ-ONLY and PROPOSAL-ONLY. It consumes a valid
//     EvaluationResult and produces inert frozen CorrectionProposal records.
//     It never touches stores, the hierarchy, transactions, history, events,
//     the tool registry, or any execution path. A proposal is data, never a
//     command: the only route back to the doc is
//     CorrectionProposal -> Intent -> Planner -> Plan -> DSL -> Transaction
//     -> Commit (spec §26/§34).
//   - Import contract: EXACTLY './evaluation.js' — the Critic consumes the
//     §12 EvaluationResult contract through its own validator (reuse, not
//     duplication). The Planner (ai.js) is NOT imported: per §35 the Critic
//     diagnoses and proposes; only the Planner turns a proposal into a plan.
//     The intent field is an intent-LIKE structured description — the Planner
//     owns intent validation at the handoff (Checkpoint F boundary).
//
// RULE ENGINE (spec §27, MVP, capability-backed — every rule cites the
// planning capability it maps to; deviations with NO safe existing capability
// produce NO proposal and the architecture is never bypassed, §28):
//   geometry.{width,height,rx,ry,area,symmetric}
//       -> create-rebuild intent rebuilt from the desired-state record
//          (the ExpectedState IS a create-intent projection, ai.js:408-426;
//          create capability, ai.js:255-264). objectType is inferred
//          deterministically: width/height present -> rect, else ellipse.
//          All geometry deviations of one object rebuild the SAME intent, so
//          multiples collapse through dedup. Restoration values always come
//          from the ExpectedState (the desired state), never from the
//          deviation's observed side.
//   appearance.{fill,fill.color,fill.kind}
//       -> {type:'appearance', targets:[objectId], fill:<hex>} — T07
//          apply_fill capability (ai.js:324-332/:806-814, tools.js:347).
//   appearance.opacity
//       -> {type:'appearance', targets:[objectId], opacity:<v>} — T07
//          opacity-only capability (tools.js:375-378).
//   placement.center
//       -> {type:'transform', operation:'translate', params:{x,y}} with
//          delta = expected center - observed center — translate has DELTA
//          semantics mapped to T05 move_object (ai.js:764-779, tools.js:308).
//          bbox-edge deviations propose nothing: which corner moves is
//          ambiguous (§28).
//   transform.{transform.tx,transform.ty}
//       -> translate proposal ONLY when the ExpectedState carries the
//          non-null transform expectation (dormant otherwise, per directive);
//          matrix keys a/b/c/d propose nothing (no safe capability maps
//          node-matrix components).
//   existence / structure / semantic
//       -> NO proposal in MVP: existence has no creation binding in the
//          ExpectedState; grouped:true cannot be scheduled (T10 requires
//          >=2 targets, ai.js:840-845) and grouped:false targets a group NODE
//          id (tools.js:517-525, ai.js:834) the object-targeted intent grammar
//          cannot carry; no tool supports semantic mutation.
//
// DETERMINISM (spec §29/§30): no entropy sources. Proposal ids are
// content-derived (FNV-1a over key-sorted canonical JSON). Proposal order
// follows the deviation order (the §30 primary basis); priority = the
// deviation's index. Dedup key = canonical intent + targetRef + objectId —
// identical corrections for the same target collapse to the first deviation.
// Confidence is the rule-derived constant 1 (exact restoration from the
// desired-state record).
//
// House style: single-file module, compact functions, {valid, errors} result
// objects with {code, message, details?} entries (mirrors ai.js/evaluation.js).
//
// CHECKPOINT D (spec §42/§57; gates 25-27 substrate): the Evaluation + Critic
// integration entry. evaluateAndCritique(expectedState, documentContext,
// evaluationContext) is a SINGLE THIN ORCHESTRATOR over the two existing
// public stages — evaluate() (the §55 engine, which builds the ActualState
// from the authoritative stores via the injected read surface, §11) followed
// by proposeCorrections() (the §23 Critic) — and returns the frozen plain-data
// pair { evaluationResult, proposals }.
//   - Why an orchestrator, and why HERE: it preserves the read-only boundary
//     most cleanly. The module import contract stays EXACTLY
//     './evaluation.js' (no new imports); hosting the entry in the evaluation
//     module would create a circular import; the orchestrator holds no state,
//     performs no mutation, and both children arrive deep-frozen from their
//     own constructors, so the composed pair is frozen inert data too.
//   - The second parameter is the doc-context read surface, NOT a pre-built
//     ActualState: per §11 the observed snapshot must be constructed INSIDE
//     the pipeline by buildActualState from the authoritative stores. Passing
//     a caller-assembled ActualState would let unverified observations bypass
//     the §10 contracts. The §57 flow is preserved exactly: ExpectedState +
//     observed state -> EvaluationResult -> Critic -> CorrectionProposal[].
//   - targetRef flow (§57 verify): deviations carry the evaluationContext
//     reference ('$doc:<id>' / '$<stepId>') or null for a plan-level outcome;
//     every proposal copies its deviation's targetRef verbatim, so plan-level
//     deviations yield plan-level proposals (object-independent corrections)
//     or no proposal where the rule table has no capability (existence).
//   - Determinism (§67): same (ExpectedState, doc state, evaluation context)
//     -> byte-identical { evaluationResult, proposals }. No entropy, no
//     timestamps; property order is fixed by the constructors.
// ============================================================================

// ---- 0. The one import: the EvaluationResult contract (§12) consumed through
// its own validator — reuse, not duplication. Nothing else is imported: the
// Planner is NOT imported (§35 — only the Planner turns proposals into plans).

import { evaluate, validateEvaluationResult } from './evaluation.js';

// ---- 1. Error model (house style) -------------------------------------------

export const CriticErrorCodes = Object.freeze({
  INVALID_EVALUATION_RESULT: 'INVALID_EVALUATION_RESULT',
  INVALID_CORRECTION_PROPOSAL: 'INVALID_CORRECTION_PROPOSAL'
});

export class CriticError extends Error {
  constructor(code, message, details){
    super(message);
    this.name = 'CriticError';
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

function fnv1a32(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Plan-level reference grammar: '$doc:<objectId>' or '$<stepId>', or null for
// a plan-level outcome (§13/§21 — the same grammar the deviation carries).
function isPlanRefOrNull(v){
  if (v === null) return true;
  return isNonEmptyString(v) && v.startsWith('$');
}

// The planning capability vocabulary (mirrors ai.js:170 INTENT_CATEGORIES;
// cross-checked behaviorally by the test suite — no Planner import, §35).
const INTENT_TYPES = Object.freeze(['create', 'transform', 'appearance', 'alignment', 'structure']);

// Intent key tables per capability (mirrors the Planner's own rejectUnknownKeys
// tables, ai.js:182-183/:277/:325/:335/:358). The Critic enforces the KEY
// vocabulary only — field-level completeness/validation is the Planner's job
// at the handoff (§06/§35: the Critic never re-implements Planner logic).
const INTENT_KEYS = Object.freeze({
  create: Object.freeze(['type', 'objectType', 'width', 'height', 'rx', 'ry', 'fill', 'opacity', 'placement', 'x', 'y']),
  transform: Object.freeze(['type', 'targets', 'operation', 'params']),
  appearance: Object.freeze(['type', 'targets', 'fill', 'opacity']),
  alignment: Object.freeze(['type', 'targets', 'axis', 'mode']),
  structure: Object.freeze(['type', 'operation', 'targets'])
});

// ---- 3. CorrectionProposal (spec §25/§28) -----------------------------------
const PROPOSAL_CONTENT_KEYS = Object.freeze(['deviationId', 'targetRef', 'intent', 'reason', 'confidence', 'priority']);

function proposalFieldErrors(p, errors){
  if (!isNonEmptyString(p.deviationId)){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.deviationId must be a non-empty string — the proposal must name the deviation it addresses (§25)', { field: 'deviationId' }));
  }
  if (!isPlanRefOrNull(p.targetRef)){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, "proposal.targetRef must be a '$'-prefixed plan reference or null (carried from the deviation, §25)", { field: 'targetRef', value: p.targetRef }));
  }
  if (!isPlainObject(p.intent)){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.intent must be a plain-object intent-like description (§25: NOT a Plan, NOT a command)', { field: 'intent' }));
  } else {
    if (!isNonEmptyString(p.intent.type) || !INTENT_TYPES.includes(p.intent.type)){
      errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, `proposal.intent.type must be one of the planning capabilities ${INTENT_TYPES.join('/')}`, { field: 'intent.type', value: p.intent.type }));
    }
    const allowed = INTENT_TYPES.includes(p.intent.type) ? INTENT_KEYS[p.intent.type] : null;
    if (allowed){
      for (const k of Object.keys(p.intent)){
        if (!allowed.includes(k)){
          errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, `proposal.intent.${k} is not a key of the '${p.intent.type}' capability — corrections stay within the planning vocabulary (§28)`, { field: `intent.${k}` }));
        }
      }
    }
  }
  if (!isNonEmptyString(p.reason)){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.reason must be a non-empty, deterministic string', { field: 'reason' }));
  }
  if (!isFiniteNumber(p.confidence) || p.confidence < 0 || p.confidence > 1){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.confidence must be a finite number in [0,1] (§25: rule-derived)', { field: 'confidence', value: p.confidence }));
  }
  if (!isFiniteNumber(p.priority) || p.priority < 0){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.priority must be a finite number >= 0 (§30: ordering basis)', { field: 'priority', value: p.priority }));
  }
}

// §25 API — deterministic proposal construction. Throws CriticError
// (INVALID_CORRECTION_PROPOSAL) on content breaches. The id is content-derived
// (FNV-1a over the key-sorted canonical content, §29): the same proposal
// content always yields the same id, any content change moves it. The result
// is deep-frozen inert data (§26).
export function createCorrectionProposal(content){
  if (!isPlainObject(content)){
    throw new CriticError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'createCorrectionProposal requires a plain-object content record');
  }
  const fnPath = findFunctionPath(content, 'content');
  if (fnPath) throw new CriticError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, `proposal content must be plain data; function value at ${fnPath}`);
  for (const required of PROPOSAL_CONTENT_KEYS){
    if (!Object.prototype.hasOwnProperty.call(content, required) || content[required] === undefined){
      throw new CriticError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, `createCorrectionProposal requires '${required}' explicitly (deterministic construction, no hidden defaults)`, { field: required });
    }
  }
  const p = {
    deviationId: content.deviationId,
    targetRef: content.targetRef,
    intent: deepFreeze(JSON.parse(JSON.stringify(content.intent))),
    reason: content.reason,
    confidence: content.confidence,
    priority: content.priority
  };
  const errors = [];
  proposalFieldErrors(p, errors);
  if (errors.length > 0) throw new CriticError(errors[0].code, errors[0].message, errors);
  const id = 'prop-' + fnv1a32(stableStringify({
    deviationId: p.deviationId, targetRef: p.targetRef, intent: p.intent,
    reason: p.reason, confidence: p.confidence, priority: p.priority
  }));
  return deepFreeze({ id, ...p });
}

// Verdict over a proposal record: all 7 §25 keys present (own-property),
// id a non-empty string, content fields valid, plain data only.
export function validateCorrectionProposal(proposal){
  const errors = [];
  if (!isPlainObject(proposal)){
    return { valid: false, errors: [createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'CorrectionProposal must be a plain object')] };
  }
  if (findFunctionPath(proposal, 'proposal')){
    return { valid: false, errors: [createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'CorrectionProposal must be plain data — proposals are never commands (§26)')] };
  }
  for (const key of ['id', ...PROPOSAL_CONTENT_KEYS]){
    if (!Object.prototype.hasOwnProperty.call(proposal, key)){
      errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, `proposal.${key} is a mandatory §25 field`, { field: key }));
    }
  }
  if (errors.length > 0) return { valid: false, errors };
  if (!isNonEmptyString(proposal.id)){
    errors.push(createError(CriticErrorCodes.INVALID_CORRECTION_PROPOSAL, 'proposal.id must be a non-empty string (content-derived, §29)', { field: 'id' }));
  }
  proposalFieldErrors(proposal, errors);
  return { valid: errors.length === 0, errors };
}

// ---- 4. Rule engine (spec §27/§28; capability-backed, see header) -----------

function isPositive(v){ return isFiniteNumber(v) && v > 0; }
function isNonNegative(v){ return isFiniteNumber(v) && v >= 0; }

// Geometry -> create-rebuild intent from the desired-state record. Returns
// null when the create projection is not constructible (the correction would
// have to invent parameters, §28).
function geometryProposal(d, expected){
  const g = expected.geometry;
  const isRect = g.width !== null && g.width !== undefined;
  const intent = { type: 'create', objectType: isRect ? 'rect' : 'ellipse' };
  if (isRect){
    if (!isPositive(g.width) || !isPositive(g.height) || !isNonNegative(g.rx) || !isNonNegative(g.ry)) return null;
    intent.width = g.width;
    intent.height = g.height;
    intent.rx = g.rx;
    intent.ry = g.ry;
  } else {
    if (!isPositive(g.rx) || !isPositive(g.ry)) return null;
    intent.rx = g.rx;
    intent.ry = g.ry;
  }
  if (expected.appearance.fill !== null && expected.appearance.fill !== undefined){
    if (!isNonEmptyString(expected.appearance.fill)) return null;
    intent.fill = expected.appearance.fill;
  }
  if (expected.appearance.opacity !== null && expected.appearance.opacity !== undefined){
    if (!isFiniteNumber(expected.appearance.opacity) || expected.appearance.opacity < 0 || expected.appearance.opacity > 1) return null;
    intent.opacity = expected.appearance.opacity;
  }
  if (expected.spatial.centered === true) intent.placement = 'center';
  return {
    intent,
    reason: `restore the requested geometry of '${d.objectId}' via the create capability, rebuilt from the desired-state record`
  };
}

// Appearance fill/opacity -> T07 capability. The restoration value comes from
// the ExpectedState (the desired state), never from the observed side.
function appearanceProposal(d, expected){
  if (d.property === 'opacity'){
    const v = d.expected;
    if (!isFiniteNumber(v) || v < 0 || v > 1) return null;
    return {
      intent: { type: 'appearance', targets: [d.objectId], opacity: v },
      reason: `restore the requested opacity ${v} on '${d.objectId}' via the appearance capability`
    };
  }
  if (d.property !== 'fill' && d.property !== 'fill.color' && d.property !== 'fill.kind') return null;
  const hex = expected.appearance.fill;
  if (!isNonEmptyString(hex)) return null; // a fill deviation without a fill expectation is inconsistent input — propose nothing
  return {
    intent: { type: 'appearance', targets: [d.objectId], fill: hex },
    reason: `restore the requested fill '${hex}' on '${d.objectId}' via the appearance capability`
  };
}

// Placement center -> translate delta (expected center - observed center).
// The deviation carries both ends, so no artboard guessing is needed here.
function placementProposal(d){
  if (d.property !== 'center') return null; // bbox edges: ambiguous correction, §28
  const exp = d.expected;
  const act = d.actual;
  if (!isPlainObject(exp) || !isPlainObject(act)) return null;
  if (!isFiniteNumber(exp.x) || !isFiniteNumber(exp.y) || !isFiniteNumber(act.x) || !isFiniteNumber(act.y)) return null;
  const dx = exp.x - act.x;
  const dy = exp.y - act.y;
  return {
    intent: { type: 'transform', targets: [d.objectId], operation: 'translate', params: { x: dx, y: dy } },
    reason: `translate '${d.objectId}' by (${dx},${dy}) to restore the requested artboard centering`
  };
}

// Transform tx/ty -> translate delta, ONLY when the ExpectedState carries the
// non-null expectation (dormant otherwise). Matrix keys and the unobservable-
// matrix variant propose nothing (§28).
function transformProposal(d, expected){
  const t = expected.transform;
  if (!isPlainObject(t)) return null;
  if (d.property !== 'transform.tx' && d.property !== 'transform.ty') return null;
  const key = d.property === 'transform.tx' ? 'tx' : 'ty';
  const exp = t[key];
  const act = d.actual;
  if (!isFiniteNumber(exp) || !isFiniteNumber(act)) return null;
  const dx = key === 'tx' ? exp - act : 0;
  const dy = key === 'ty' ? exp - act : 0;
  return {
    intent: { type: 'transform', targets: [d.objectId], operation: 'translate', params: { x: dx, y: dy } },
    reason: `translate '${d.objectId}' by (${dx},${dy}) to restore the requested transform expectation`
  };
}

// Rule dispatch. existence / structure / semantic fall through to null —
// the no-proposal outcomes declared in the module header (§28: the Critic
// must not bypass the architecture simply because a correction appears
// obvious).
function proposalFor(d, result){
  if (d.category === 'geometry') return geometryProposal(d, result.expected);
  if (d.category === 'appearance') return appearanceProposal(d, result.expected);
  if (d.category === 'placement') return placementProposal(d);
  if (d.category === 'transform') return transformProposal(d, result.expected);
  return null;
}

// ---- 5. §23 API — the Critic entry ------------------------------------------

// §56 API — deterministic critique. Consumes a VALID EvaluationResult (the
// §12 contract, enforced through its own validator) and returns a frozen
// array of CorrectionProposal. Ordering follows the deviation order (§30
// primary basis); priority = the deviation's index; identical corrections for
// the same target collapse to the first deviation (dedup key = canonical
// intent + targetRef + objectId). Read-only by construction: it touches
// nothing but the plain data it is handed.
export function proposeCorrections(evaluationResult){
  const check = validateEvaluationResult(evaluationResult);
  if (!check.valid){
    throw new CriticError(CriticErrorCodes.INVALID_EVALUATION_RESULT, 'proposeCorrections requires a valid EvaluationResult (§12)', check.errors);
  }
  const out = [];
  const seen = new Set();
  const deviations = evaluationResult.deviations;
  for (let i = 0; i < deviations.length; i++){
    const d = deviations[i];
    const built = constraintProposalFor(d, evaluationResult) || proposalFor(d, evaluationResult);
    if (built === null) continue; // §28: unsupported corrections produce NO proposal
    const key = stableStringify(built.intent) + '|' + (d.targetRef === null ? '' : d.targetRef) + '|' + (d.objectId === null || d.objectId === undefined ? '' : d.objectId);
    if (seen.has(key)) continue; // dedup (§28-safe): identical corrections collapse, first deviation wins
    seen.add(key);
    out.push(createCorrectionProposal({
      deviationId: d.id,
      targetRef: d.targetRef,
      intent: built.intent,
      reason: built.reason,
      confidence: 1,
      priority: i
    }));
  }
  return deepFreeze(out);
}

// ---- 6. Integration entry (spec §42/§57; Checkpoint D) ----------------------

// §57 API — the deterministic Evaluation + Critic composition. Runs the §55
// evaluation engine (which derives the ActualState from the authoritative
// stores, §11) and feeds the resulting §12 record straight into the §23
// Critic. Returns a deep-frozen plain-data pair; nothing is shared between
// stages except the frozen EvaluationResult itself, so neither stage can
// mutate the other's output (§42). Throws EvaluationError/CriticError per the
// stage contracts — never invents missing inputs (§17/§21 honesty).
export function evaluateAndCritique(expectedState, documentContext, evaluationContext){
  const evaluationResult = evaluate(expectedState, documentContext, evaluationContext);
  const proposals = proposeCorrections(evaluationResult);
  return deepFreeze({ evaluationResult, proposals });
}

// ============================================================================
// PHASE 3.16 — THE CONSTRAINT RULE (inside the §23 proposeCorrections rule
// engine; NO new exports — the 6-export C/D-era surface is pinned).
// ============================================================================
// CAPABILITY BACKING (§27/§28 — every proposal maps to a real planning
// capability; everything else declines HONESTLY):
//   position-class constraint violations (property 'position.x' /
//     'position.y' — the align/center pinned-axis errors the evaluation
//     arm emits) -> {type:'transform', targets:[violated],
//     operation:'translate', params:{x,y}} with delta = expected - actual
//     on the pinned axis and 0 on the other — T05 move_object, DELTA
//     semantics, no side effects on any other axis.
//   size-class (equalWidth/equalHeight -> 'size.width'/'size.height') and
//     distance-class (fixedDistance) violations -> NO proposal. The only
//     size capability is T06, whose affine transform is origin-anchored:
//     scaling the width MOVES the object (a position side effect that can
//     violate OTHER accepted constraints). No SAFE capability exists, so
//     per §28 nothing is proposed — surfaced, never patched.
//
// ROUTING: a deviation is a CONSTRAINT violation when the evaluation
// record's metadata.constraintDeviations carries its provenance (by
// deviationId) — the constraint rule then owns it EXCLUSIVELY (it is never
// re-interpreted as a desired-state geometry mismatch). Deviations without
// constraint provenance follow the 3.14 rules verbatim. Ordering, dedup
// (canonical intent + targetRef + objectId), priority = the deviation's
// index, and the content-derived 7-key ids are the shared §29/§30
// discipline — the pass adds no entropy and no new contract.
// ============================================================================

const CONSTRAINT_CORRECTABLE_PROPERTIES = deepFreeze(['position.x', 'position.y']);

// The constraint provenance for a deviation, or null when the deviation is
// not a constraint violation.
function constraintProvenanceFor(d, result){
  const md = result.metadata;
  if (!isPlainObject(md) || !Array.isArray(md.constraintDeviations)) return null;
  return md.constraintDeviations.find(cd => isPlainObject(cd) && cd.deviationId === d.id) || null;
}

// The constraint rule (the 3.16 arm of the rule dispatch). Returns the
// {intent, reason} pair or null (unsupported classes decline per §28).
function constraintProposalFor(d, result){
  const provenance = constraintProvenanceFor(d, result);
  if (provenance === null) return null;
  const property = isNonEmptyString(provenance.property) ? provenance.property : d.property;
  if (!CONSTRAINT_CORRECTABLE_PROPERTIES.includes(property)) return null;
  const expected = d.expected;
  const actual = d.actual;
  if (!isFiniteNumber(expected) || !isFiniteNumber(actual)) return null;
  const dx = property === 'position.x' ? expected - actual : 0;
  const dy = property === 'position.y' ? expected - actual : 0;
  if (dx === 0 && dy === 0) return null;
  const target = isNonEmptyString(d.objectId) ? d.objectId
    : (isNonEmptyString(provenance.violatedObjectId) ? provenance.violatedObjectId : null);
  if (target === null) return null;
  const type = isNonEmptyString(provenance.type) ? provenance.type : 'constraint';
  const constraintId = isNonEmptyString(provenance.constraintId) ? provenance.constraintId : '';
  return {
    intent: { type: 'transform', targets: [target], operation: 'translate', params: { x: dx, y: dy } },
    reason: `translate '${target}' by (${dx},${dy}) to satisfy the accepted ${type} constraint '${constraintId}'`
  };
}
