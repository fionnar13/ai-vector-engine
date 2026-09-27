// ============================================================================
// src-js/semantic-inference.js — SEMANTIC NORMALIZATION (PHASE 3.17, T20 → B)
// ============================================================================
// ZERO-IMPORT PIN (the constraint-inference.js:1-38 discipline, spec §44):
// this module declares NO imports of any kind — every capability is local,
// deterministic, and pure. It reads nothing from the substrate, writes
// nothing anywhere, owns no store, and never mutates caller structures.
//
// SCOPE (spec §55, Checkpoint B — NORMALIZATION): the integration boundary
// between raw T20 tool results and the rest of the 3.17 surface. T20 is the
// registered proposal tool (src-js/tools.js:973-999, engine
// src-js/semantic.js:122-280); it emits proposal records of the exact shape
// semantic.js:269-279 (no-evidence branch :239-249):
//
//     { proposalId, objectId, proposedRole, proposedTags,
//       proposedRelationships, confidence, evidence, source, createdAt }
//
// This module turns a T20 result into STABLE session-local records:
// entropy-free, content-identified, deep-frozen, honest about refusals.
//
// DESIGN DECISIONS (pinned here and in tests/semantic-inference.test.mjs):
//
//   BD-1  The normalized role vocabulary IS T20's emission vocabulary:
//         {text, heading, background, shape, icon, container, unknown}
//         (semantic.js:136/:149/:169/:174-208/:220/:242-259). It is NOT
//         mapped onto the 14-role VALID_ROLES store set (semantic.js:6) —
//         the 3.16 D-8 symmetry precedent (no invented mapping), and no
//         role aliases exist anywhere in src-js (Checkpoint A-2/A-4).
//         A mapping would be invention.
//
//   BD-2  'unknown' is ACCEPTED as a real role (option a): T20 already
//         honest-labels unresolvable objects 'unknown' (semantic.js:242,
//         :255, :259 — including the zero-evidence branch :239-249).
//         Refusal is reserved for roles T20 could never emit (future-proof
//         guard), not for honest unknowns.
//
//   BD-3  Confidence is PRESERVED VERBATIM — never rounded, never clamped,
//         never converted into a threshold (spec §36 forbids magic
//         thresholds; T20 grades via clamp01 at semantic.js:120/:252-253,
//         the normalization layer adds no policy). A missing or non-numeric
//         confidence normalizes to null (the record-shape null arm).
//
//   BD-4  Provenance = { source: 'T20', evidence: [...] }. T20's upstream
//         source:'heuristic' (semantic.js:247/:277) names the ALGORITHM;
//         the tool T20 is the ORIGIN of everything this session ingests —
//         so the normalized source is the constant 'T20'. The evidence
//         rows {signal, description, weight} (semantic.js:263-267) are
//         preserved verbatim (copied, never aliased). This keeps the spec
//         §37 distinction (T20-inferred vs user-specified vs derived)
//         visible without inventing a parallel provenance field.
//
//   BD-5  Entropy is STRIPPED. The upstream proposalId (RNG-based uuid,
//         semantic.js:2/:240/:270) and createdAt (wall-clock, :248/:278)
//         never reach a normalized record (spec §19 determinism; the 3.16
//         T19 wall-clock finding). The record id is CONTENT-DERIVED:
//         'smr-' + fnv1a32(stableStringify(content)) over the canonical
//         content {objectId, role, confidence, evidence} — the same
//         logical proposal always yields the same id, any content change
//         moves it, and upstream entropy can never move it.
//
//   BD-6  Refusals are flat frozen ledger records {status:'REJECTED',
//         reason, upstream} — the 3.16 refusalLedger precedent family
//         (correction.js:1953 {status, reason, details}; ledger entries
//         :3043). ingest NEVER THROWS: every failure mode becomes a
//         refusal. Reasons: 'UNSUPPORTED_TYPE' (role outside BD-1),
//         'MALFORMED' (input is not a T20 result / proposal lacks the
//         mandatory objectId or proposedRole contract), 'T20_FAILED'
//         (well-formed failure envelope, tools.js:963/:980). `upstream`
//         preserves the original input VERBATIM as a deep-frozen,
//         session-owned copy — zero aliasing of caller structures (the
//         3.16 no-mutation discipline, constraint-inference.js:36-37);
//         the caller's own object is never frozen or mutated.
//
//   BD-7  Zero imports: fnv1a32 and stableStringify are reimplemented
//         locally (the constraint-inference.js:140-180 pattern — 3.16
//         reimplemented them locally rather than reaching into
//         correction.js; this module follows that precedent, spec §44
//         single-file ESM, no subdirectory split).
//
// SESSION SEMANTICS: a session is created via createInferenceSession() and
// is session-local (spec §32 posture — the session owns nothing outside
// itself, touches no store). ingest(t20Result) accepts ONE T20 tool result
// envelope {success, output:{proposals}} (tools.js:969/:997) and returns
// the batch outcome {records, refusals}; getRecords()/getRefusals() return
// cumulative frozen snapshots; getRegistry() returns the frozen full-state
// snapshot {records, refusals}. All session-produced data is deterministic:
// identical ingest sequences give byte-identical registries (spec §19).
// ============================================================================

/**
 * @typedef {Object} T20Proposal
 * @property {string} proposalId Upstream RNG-derived id (stripped, BD-5).
 * @property {string} objectId   Target object id (preserved verbatim).
 * @property {string} proposedRole T20-emitted role (BD-1 vocabulary).
 * @property {Array<string>} proposedTags Engine tag set (not carried into
 *   the normalized record — the B1 record shape is the seven-field contract).
 * @property {Array} proposedRelationships Always [] today (semantic.js:126/:274).
 * @property {number} confidence Graded score in [0,1] (preserved, BD-3).
 * @property {Array<{signal: string, description: string, weight: number}>} evidence
 * @property {string} source Upstream 'heuristic' (normalized to 'T20', BD-4).
 * @property {number} createdAt Wall-clock stamp (stripped, BD-5).
 */

/**
 * @typedef {Object} NormalizedSemanticRecord
 * @property {string} id Content-derived 'smr-<8-hex>' (BD-5).
 * @property {string} objectId Preserved from input.
 * @property {string} role Normalized role (BD-1 vocabulary, verbatim).
 * @property {number|null} confidence Preserved verbatim or null (BD-3).
 * @property {Array} evidence Copied verbatim + frozen (BD-4).
 * @property {'T20'} source Constant (BD-4).
 * @property {'PROPOSED'} status Accepted-record status.
 */

/**
 * @typedef {Object} SemanticRefusal
 * @property {'REJECTED'} status
 * @property {'UNSUPPORTED_TYPE'|'MALFORMED'|'T20_FAILED'} reason
 * @property {*} upstream Verbatim deep-frozen copy of the original input
 *   (session-owned; zero caller aliasing — BD-6).
 */

/**
 * @typedef {Object} IngestOutcome
 * @property {NormalizedSemanticRecord[]} records This batch's accepted records.
 * @property {SemanticRefusal[]} refusals This batch's refusals.
 */

/**
 * @typedef {Object} InferenceRegistry
 * @property {NormalizedSemanticRecord[]} records Cumulative accepted records.
 * @property {SemanticRefusal[]} refusals Cumulative refusals.
 */

/**
 * @typedef {Object} InferenceSession
 * @property {(t20Result: Object) => IngestOutcome} ingest
 * @property {() => NormalizedSemanticRecord[]} getRecords
 * @property {() => SemanticRefusal[]} getRefusals
 * @property {() => InferenceRegistry} getRegistry
 */

// ---- 0. Vocabulary ----------------------------------------------------------

const SOURCE_T20 = 'T20';
const STATUS_PROPOSED = 'PROPOSED';
const STATUS_REJECTED = 'REJECTED';
const REASON_UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE';
const REASON_MALFORMED = 'MALFORMED';
const REASON_T20_FAILED = 'T20_FAILED';

/** BD-1/BD-2: T20's exact emission vocabulary (semantic.js emission sites). */
const T20_EMITTED_ROLES = Object.freeze([
  'text', 'heading', 'background', 'shape', 'icon', 'container', 'unknown'
]);

// ---- 1. Local deterministic helpers (constraint-inference.js pattern) -------

function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isNonEmptyString(v){ return typeof v === 'string' && v.length > 0; }

function deepFreeze(value){
  if (isPlainObject(value) || Array.isArray(value)){
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

/** Key-sorted canonical serialization (constraint-inference.js:148-155). */
function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 32-bit FNV-1a over a canonical string, hex-padded (constraint-inference.js:163-170). */
function fnv1a32(str, offsetBasis){
  let h = offsetBasis >>> 0;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** BD-5 identity: 'smr-' + 8 hex digits of FNV-1a over canonical content. */
function deriveRecordId(content){
  return 'smr-' + fnv1a32(stableStringify(content), 0x811c9dc5);
}

/** Verbatim deep copy that freezes what it builds (never aliases the caller). */
function cloneData(value){
  if (Array.isArray(value)) return Object.freeze(value.map(cloneData));
  if (isPlainObject(value)){
    const out = {};
    for (const k of Object.keys(value)) out[k] = cloneData(value[k]);
    return Object.freeze(out);
  }
  return value;
}

// ---- 2. Normalization -------------------------------------------------------

/**
 * BD-6 refusal factory. Flat frozen record; `upstream` is a verbatim
 * deep-frozen COPY of the original input — session-owned memory, zero
 * aliasing of caller structures, and the refusal ledger is safe to walk
 * (deep-frozen at every level).
 */
function createRefusal(reason, upstream){
  return Object.freeze({ status: STATUS_REJECTED, reason, upstream: cloneData(upstream) });
}

/**
 * Normalize ONE raw T20 proposal into a record or a refusal.
 *
 * @param {*} raw Candidate proposal (any caller payload).
 * @returns {{record: NormalizedSemanticRecord}|{refusal: SemanticRefusal}}
 */
function normalizeProposal(raw){
  if (!isPlainObject(raw) || !isNonEmptyString(raw.objectId) || typeof raw.proposedRole !== 'string'){
    return { refusal: createRefusal(REASON_MALFORMED, raw) };
  }
  const role = raw.proposedRole;
  if (!T20_EMITTED_ROLES.includes(role)){
    return { refusal: createRefusal(REASON_UNSUPPORTED_TYPE, raw) };
  }
  // BD-3: verbatim; only a genuinely numeric confidence is carried, anything
  // else normalizes to null (never coerced, never rounded, never clamped).
  const confidence = (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) ? raw.confidence : null;
  // BD-4: evidence copied verbatim (+ frozen); absent evidence normalizes to [].
  const evidence = Array.isArray(raw.evidence) ? raw.evidence.map(cloneData) : [];
  const content = { objectId: raw.objectId, role, confidence, evidence };
  const record = {
    id: deriveRecordId(content),
    objectId: raw.objectId,
    role,
    confidence,
    evidence,
    source: SOURCE_T20,
    status: STATUS_PROPOSED,
  };
  return { record: deepFreeze(record) };
}

/**
 * Normalize ONE T20 tool result envelope (tools.js:969/:997 shape).
 *
 * @param {*} t20Result {success:true, output:{proposals:[...]}} | failure envelope | garbage.
 * @returns {{records: NormalizedSemanticRecord[], refusals: SemanticRefusal[]}}
 */
function normalizeResult(t20Result){
  const records = [];
  const refusals = [];
  if (isPlainObject(t20Result) && t20Result.success === false){
    // "when T20 fails" (BD-6): a well-formed failure envelope (tools.js:963/:980)
    refusals.push(createRefusal(REASON_T20_FAILED, t20Result));
    return { records, refusals };
  }
  if (!isPlainObject(t20Result) || t20Result.success !== true || !isPlainObject(t20Result.output) || !Array.isArray(t20Result.output.proposals)){
    refusals.push(createRefusal(REASON_MALFORMED, t20Result));
    return { records, refusals };
  }
  for (const raw of t20Result.output.proposals){
    const out = normalizeProposal(raw);
    if (out.refusal) refusals.push(out.refusal);
    else records.push(out.record);
  }
  return { records, refusals };
}

// ---- 3. The session factory (spec §55 deliverables B1-B5) -------------------

/**
 * Create a session-local semantic normalization session.
 *
 * The session accumulates normalized records and refusals across ingests,
 * exposes frozen snapshots, and holds no reference to any store (spec §32:
 * session-local semantic state; the orphan SemanticStore is untouched).
 * All outputs are deterministic (spec §19): no RNG, no wall clock, no
 * environment reads anywhere in this module.
 *
 * @returns {InferenceSession}
 */
export function createInferenceSession(){
  const records = [];
  const refusals = [];
  return Object.freeze({
    /**
     * Ingest ONE T20 tool result; never throws (BD-6).
     * @param {*} t20Result
     * @returns {IngestOutcome}
     */
    ingest(t20Result){
      const out = normalizeResult(t20Result);
      for (const r of out.records) records.push(r);
      for (const r of out.refusals) refusals.push(r);
      return deepFreeze({ records: out.records, refusals: out.refusals });
    },
    /** @returns {NormalizedSemanticRecord[]} cumulative frozen snapshot */
    getRecords(){ return deepFreeze([...records]); },
    /** @returns {SemanticRefusal[]} cumulative frozen snapshot */
    getRefusals(){ return deepFreeze([...refusals]); },
    /** @returns {InferenceRegistry} full-state frozen snapshot */
    getRegistry(){ return deepFreeze({ records: [...records], refusals: [...refusals] }); },
  });
}
