
import { Constraint, ConstraintViolation } from './types.js';
import { ConstraintSolveContext } from './types.js';
import { BBox } from '../math/bbox.js';
import { getCenter, getWidth, getHeight, distanceBetweenCenters } from './bbox-reference.js';

export const DEFAULT_TOLERANCE = 1e-9;

export function isConstraintSatisfied(
  constraint: Constraint,
  context: ConstraintSolveContext,
  tolerance?: number
): boolean {
  const tol = tolerance ?? constraint.parameters?.tolerance ?? context.tolerance ?? DEFAULT_TOLERANCE;
  const violations = evaluateConstraint(constraint, context, tol);
  return violations.length === 0;
}

export function evaluateConstraint(
  constraint: Constraint,
  context: ConstraintSolveContext,
  tolerance?: number
): ConstraintViolation[] {
  const tol = tolerance ?? constraint.parameters?.tolerance ?? context.tolerance ?? DEFAULT_TOLERANCE;

  if (!constraint.enabled) return [];

  const bboxes = new Map<string, BBox>();
  for (const oid of constraint.objectIds) {
    const bbox = context.getWorldBBox(oid);
    if (!bbox) return []; // If bbox missing, skip evaluation (object not found case handled elsewhere)
    bboxes.set(oid as string, bbox);
  }

  const violations: ConstraintViolation[] = [];

  switch (constraint.type) {
    case 'horizontal':
    case 'alignCenterY': {
      // centerY equal
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      const refCenter = getCenter(ref);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = bboxes.get(oid as string)!;
        const c = getCenter(bbox);
        const error = Math.abs(c.y - refCenter.y);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break; // For MVP, one violation per constraint is enough
        }
      }
      break;
    }
    case 'vertical':
    case 'alignCenterX': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      const refCenter = getCenter(ref);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = bboxes.get(oid as string)!;
        const c = getCenter(bbox);
        const error = Math.abs(c.x - refCenter.x);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'alignLeft': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(bbox.minX - ref.minX);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'alignRight': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(bbox.maxX - ref.maxX);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'alignTop': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(bbox.minY - ref.minY);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'alignBottom': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(bbox.maxY - ref.maxY);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'equalWidth': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      const refW = getWidth(ref);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(getWidth(bbox) - refW);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'equalHeight': {
      const ref = bboxes.get(constraint.objectIds[0] as string)!;
      const refH = getHeight(ref);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const bbox = bboxes.get(constraint.objectIds[i] as string)!;
        const error = Math.abs(getHeight(bbox) - refH);
        if (error > tol) {
          violations.push({
            constraintId: constraint.id,
            type: constraint.type,
            objectIds: constraint.objectIds,
            error,
            tolerance: tol
          });
          break;
        }
      }
      break;
    }
    case 'fixedDistance': {
      if (constraint.objectIds.length !== 2) break;
      const a = bboxes.get(constraint.objectIds[0] as string)!;
      const b = bboxes.get(constraint.objectIds[1] as string)!;
      const target = constraint.parameters?.distance;
      if (target === undefined) break;
      const actual = distanceBetweenCenters(a, b);
      const error = Math.abs(actual - target);
      if (error > tol) {
        violations.push({
          constraintId: constraint.id,
          type: constraint.type,
          objectIds: constraint.objectIds,
          error,
          tolerance: tol
        });
      }
      break;
    }
  }

  return violations;
}

export function calculateError(
  constraint: Constraint,
  context: ConstraintSolveContext
): number {
  const violations = evaluateConstraint(constraint, context);
  if (violations.length === 0) return 0;
  return violations[0].error;
}
