
import { Constraint } from './types.js';
import { isUUID } from '../ids/index.js';
import { ObjectID, ConstraintID } from '../ids/index.js';

export type ValidationErrorCode =
  | 'CONSTRAINT_INVALID'
  | 'CONSTRAINT_OBJECT_NOT_FOUND'
  | 'CONSTRAINT_UNSATISFIABLE'
  | 'CONSTRAINT_INSUFFICIENT_OBJECTS'
  | 'CONSTRAINT_INVALID_PARAMETER';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  context?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_TYPES = new Set([
  'horizontal',
  'vertical',
  'alignLeft',
  'alignRight',
  'alignTop',
  'alignBottom',
  'alignCenterX',
  'alignCenterY',
  'equalWidth',
  'equalHeight',
  'fixedDistance'
]);

const VALID_STRENGTHS = new Set(['required', 'strong', 'weak']);
const VALID_SOURCES = new Set(['user', 'ai']);

export function validateConstraintSchema(constraint: Constraint): ValidationResult {
  const errors: ValidationError[] = [];

  if (!constraint) {
    errors.push({ code: 'CONSTRAINT_INVALID', message: 'Constraint is null/undefined' });
    return { valid: false, errors };
  }

  if (!constraint.id || typeof constraint.id !== 'string' || !isUUID(constraint.id as string)) {
    errors.push({ code: 'CONSTRAINT_INVALID', message: `Invalid ConstraintID: ${constraint.id}` });
  }

  if (!constraint.type || !VALID_TYPES.has(constraint.type as string)) {
    errors.push({ code: 'CONSTRAINT_INVALID', message: `Invalid constraint type: ${constraint.type}` });
  }

  if (!Array.isArray(constraint.objectIds) || constraint.objectIds.length === 0) {
    errors.push({ code: 'CONSTRAINT_INSUFFICIENT_OBJECTS', message: 'Constraint requires objectIds' });
  } else {
    for (const oid of constraint.objectIds) {
      if (!oid || typeof oid !== 'string' || !isUUID(oid as string)) {
        errors.push({ code: 'CONSTRAINT_INVALID', message: `Invalid ObjectID: ${oid}` });
      }
    }
  }

  if (typeof constraint.enabled !== 'boolean') {
    errors.push({ code: 'CONSTRAINT_INVALID', message: 'enabled must be boolean' });
  }

  if (!constraint.strength || !VALID_STRENGTHS.has(constraint.strength as string)) {
    errors.push({ code: 'CONSTRAINT_INVALID', message: `Invalid strength: ${constraint.strength}` });
  }

  if (!constraint.source || !VALID_SOURCES.has(constraint.source as string)) {
    errors.push({ code: 'CONSTRAINT_INVALID', message: `Invalid source: ${constraint.source}` });
  }

  if (constraint.parameters) {
    const p = constraint.parameters;
    if (p.distance !== undefined) {
      if (typeof p.distance !== 'number' || !Number.isFinite(p.distance) || isNaN(p.distance)) {
        errors.push({ code: 'CONSTRAINT_INVALID_PARAMETER', message: `Invalid distance parameter: ${p.distance}` });
      }
      if (p.distance !== undefined && (p.distance === Infinity || p.distance === -Infinity)) {
        errors.push({ code: 'CONSTRAINT_INVALID_PARAMETER', message: 'distance cannot be Infinity' });
      }
    }
    if (p.tolerance !== undefined) {
      if (typeof p.tolerance !== 'number' || !Number.isFinite(p.tolerance) || isNaN(p.tolerance) || p.tolerance < 0) {
        errors.push({ code: 'CONSTRAINT_INVALID_PARAMETER', message: `Invalid tolerance parameter: ${p.tolerance}` });
      }
    }
  }

  // Strength validation
  if (constraint.type === 'fixedDistance') {
    if (constraint.objectIds && constraint.objectIds.length !== 2) {
      errors.push({ code: 'CONSTRAINT_INSUFFICIENT_OBJECTS', message: 'fixedDistance requires exactly 2 objects' });
    }
    if (constraint.parameters?.distance === undefined) {
      errors.push({ code: 'CONSTRAINT_INVALID_PARAMETER', message: 'fixedDistance requires distance parameter' });
    }
  } else {
    // All other types require >=2
    if (constraint.objectIds && constraint.objectIds.length < 2) {
      errors.push({ code: 'CONSTRAINT_INSUFFICIENT_OBJECTS', message: `${constraint.type} requires >=2 objects` });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateConstraintDomain(constraint: Constraint, existingObjectIds: Set<string>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const oid of constraint.objectIds) {
    if (!existingObjectIds.has(oid as string)) {
      errors.push({ code: 'CONSTRAINT_OBJECT_NOT_FOUND', message: `Object not found: ${oid}`, context: { objectId: oid } });
    }
  }

  return { valid: errors.length === 0, errors };
}
