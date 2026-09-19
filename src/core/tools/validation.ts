
import { ToolValidationResult } from './types.js';
import { isUUID } from '../ids/index.js';

export function validateObjectIDs(objectIds: any): ToolValidationResult {
  const errors: any[] = [];
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be non-empty array' });
    return { valid: false, errors };
  }
  for (const id of objectIds) {
    if (!isUUID(id)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID: ${id}` });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateFiniteNumber(value: any, name: string): ToolValidationResult {
  const errors: any[] = [];
  if (typeof value !== 'number' || !Number.isFinite(value) || isNaN(value)) {
    errors.push({ code: 'VALIDATION_SCHEMA', message: `${name} must be finite number` });
  }
  return { valid: errors.length === 0, errors };
}

export function combineValidationResults(...results: ToolValidationResult[]): ToolValidationResult {
  const errors = results.flatMap(r => r.errors);
  return { valid: errors.length === 0, errors };
}
