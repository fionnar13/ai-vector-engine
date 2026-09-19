
import { SemanticData, SemanticRole, SemanticRelationship } from './types.js';
import { isUUID } from '../ids/index.js';
import { ObjectID } from '../ids/index.js';

const VALID_ROLES = new Set([
  'background',
  'foreground',
  'container',
  'group',
  'text',
  'heading',
  'button',
  'icon',
  'logo',
  'image',
  'illustration',
  'decorative',
  'shape',
  'unknown'
]);

const VALID_SOURCES = new Set(['user', 'ai', 'heuristic', 'import', 'system']);

const VALID_REL_TYPES = new Set([
  'contains',
  'containedBy',
  'labels',
  'associatedWith',
  'decorates',
  'references'
]);

export interface ValidationResult {
  valid: boolean;
  errors: { code: string; message: string; context?: any }[];
}

export function normalizeTag(tag: string): string {
  // MVP: trim, lowercase, collapse whitespace, remove empty
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTags(tags: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const nt = normalizeTag(t);
    if (nt.length === 0) continue;
    if (!seen.has(nt)) {
      seen.add(nt);
      normalized.push(nt);
    }
  }
  // Deterministic ordering: alphabetical
  return normalized.sort();
}

export function validateSemanticData(data: SemanticData): ValidationResult {
  const errors: { code: string; message: string; context?: any }[] = [];

  if (!data.objectId || typeof data.objectId !== 'string' || !isUUID(data.objectId as string)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID: ${data.objectId}` });
  }

  if (data.role !== undefined) {
    if (typeof data.role !== 'string' || !VALID_ROLES.has(data.role as string)) {
      // Allow extensibility but require string; for MVP we validate known roles, unknown allowed if string?
      // We allow any string but warn? Spec says vocabulary must allow additional roles later without breaking serialization
      // So we only reject if not string or empty
      if (typeof data.role !== 'string' || data.role.length === 0) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid role: ${data.role}` });
      }
      // For known validation, we still allow unknown roles but treat as valid if string
      // However per spec minimum required roles validated: we accept any non-empty string, but known roles are preferred
      // To satisfy test invalid role, we check if role contains spaces or uppercase? We will only reject if role not in VALID_ROLES and we are strict?
      // Decision: For MVP, we accept any lowercase single-word role, but reject if contains invalid characters? Let's enforce VALID_ROLES for strictness, but allow extensibility via additional check: if not in VALID_ROLES but matches /^[a-z_]+$/ we allow
      // For test invalid role, we will detect role '!!!invalid!!!' as invalid
      if (!VALID_ROLES.has(data.role as string)) {
        if (!/^[a-z_][a-z0-9_]*$/.test(data.role as string)) {
          errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid role format: ${data.role}` });
        }
      }
    }
  }

  if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || isNaN(data.confidence)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid confidence: ${data.confidence}` });
  } else {
    if (data.confidence < 0 || data.confidence > 1) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: `Confidence out of range [0,1]: ${data.confidence}` });
    }
    if (data.confidence === Infinity || data.confidence === -Infinity) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: `Confidence cannot be Infinity` });
    }
  }

  if (!Array.isArray(data.tags)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: 'Tags must be array' });
  } else {
    for (const t of data.tags) {
      if (typeof t !== 'string') {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Tag must be string: ${t}` });
      }
      if (t === undefined || t === null) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: 'Tag contains undefined/null' });
      }
    }
    // Check duplicate after normalization? We will normalize and compare length for duplicate detection
    const normalized = data.tags.map(normalizeTag).filter(s => s.length > 0);
    const seen = new Set<string>();
    for (const nt of normalized) {
      if (seen.has(nt)) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Duplicate tag after normalization: ${nt}` });
        break;
      }
      seen.add(nt);
    }
  }

  if (!data.source || !VALID_SOURCES.has(data.source as string)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid source: ${data.source}` });
  }

  if (!Array.isArray(data.relationships)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: 'Relationships must be array' });
  } else {
    for (const rel of data.relationships) {
      if (!rel.targetObjectId || !isUUID(rel.targetObjectId as string)) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid relationship targetObjectId: ${rel.targetObjectId}` });
      }
      if (!rel.type || !VALID_REL_TYPES.has(rel.type as string)) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid relationship type: ${rel.type}` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateSemanticRelationship(rel: SemanticRelationship): ValidationResult {
  const errors: any[] = [];
  if (!rel.targetObjectId || !isUUID(rel.targetObjectId as string)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid targetObjectId` });
  }
  if (!VALID_REL_TYPES.has(rel.type as string)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid relationship type` });
  }
  return { valid: errors.length === 0, errors };
}
