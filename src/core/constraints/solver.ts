
import { Constraint, ConstraintSolveContext, ConstraintSolveResult, ConstraintCorrection, ConstraintViolation } from './types.js';
import { evaluateConstraint } from './evaluator.js';
import { calculateCorrections, applyCorrectionToBBox, WorkingBBoxState } from './corrections.js';
import { BBox } from '../math/bbox.js';
import { Matrix3x3 } from '../math/matrix3x3.js';
import { vec2 } from '../math/vec2.js';

export const MAX_ITERATIONS = 10;
export const DEFAULT_TOLERANCE = 1e-9;

function strengthPriority(strength: string): number {
  switch (strength) {
    case 'required': return 3;
    case 'strong': return 2;
    case 'weak': return 1;
    default: return 0;
  }
}

export interface ConstraintSolver {
  solve(constraints: Constraint[], context: ConstraintSolveContext): ConstraintSolveResult;
}

export class DeterministicConstraintSolver implements ConstraintSolver {
  solve(constraints: Constraint[], context: ConstraintSolveContext): ConstraintSolveResult {
    const tolerance = context.tolerance ?? DEFAULT_TOLERANCE;

    // Filter enabled only
    const enabledConstraints = constraints.filter(c => c.enabled);

    // Sort deterministically by id
    const sorted = [...enabledConstraints].sort((a, b) => {
      // First by strength priority descending, then by id ascending
      const spA = strengthPriority(a.strength);
      const spB = strengthPriority(b.strength);
      if (spA !== spB) return spB - spA; // required first
      return a.id.localeCompare(b.id);
    });

    // Working copy of bboxes and transforms - never mutate canonical
    const workingBBoxes = new Map<string, BBox>();
    const workingWorldTransforms = new Map<string, Matrix3x3>();
    const parentWorldTransforms = new Map<string, Matrix3x3>();

    for (const oid of context.objectIds) {
      const bbox = context.getWorldBBox(oid);
      const wt = context.getWorldTransform(oid);
      if (bbox) workingBBoxes.set(oid as string, { ...bbox });
      if (wt) workingWorldTransforms.set(oid as string, { ...wt });
      if (context.getParentWorldTransform) {
        const pwt = context.getParentWorldTransform(oid);
        if (pwt) parentWorldTransforms.set(oid as string, { ...pwt });
      }
    }

    const allCorrections: ConstraintCorrection[] = [];
    let iterations = 0;
    let hasCorrections = false;

    // For conflict detection: track if required constraints remain violated after max iterations
    // Also track equalWidth/equalHeight as potentially unsatisfiable for translation-only solver

    for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
      const iterationCorrections: ConstraintCorrection[] = [];
      let madeProgress = false;

      // Build working context for evaluation
      const workingContext: ConstraintSolveContext = {
        objectIds: context.objectIds,
        getWorldBBox: (oid) => workingBBoxes.get(oid as string) || null,
        getWorldTransform: (oid) => workingWorldTransforms.get(oid as string) || null,
        getParentWorldTransform: (oid) => parentWorldTransforms.get(oid as string) || null,
        tolerance
      };

      // Evaluate all constraints and collect corrections
      for (const constraint of sorted) {
        const violations = evaluateConstraint(constraint, workingContext, tolerance);
        if (violations.length === 0) continue;

        // For equalWidth/equalHeight, translation cannot fix - mark as unsatisfiable if required
        if (constraint.type === 'equalWidth' || constraint.type === 'equalHeight') {
          // These require geometry change, not translation - for MVP we treat as violation that cannot be corrected
          // Continue to next constraint without generating corrections
          continue;
        }

        const state: WorkingBBoxState = {
          bboxes: workingBBoxes,
          worldTransforms: workingWorldTransforms,
          parentWorldTransforms: parentWorldTransforms
        };

        const corrections = calculateCorrections(constraint, state);
        for (const corr of corrections) {
          iterationCorrections.push(corr);
          // Apply to working copy immediately for next constraint in same iteration (deterministic chaining)
          const bbox = workingBBoxes.get(corr.objectId as string);
          if (bbox) {
            const newBBox = applyCorrectionToBBox(bbox, corr.translation);
            workingBBoxes.set(corr.objectId as string, newBBox);
          }
          madeProgress = true;
        }
      }

      if (iterationCorrections.length > 0) {
        // Merge into allCorrections - combine translations per objectId
        for (const ic of iterationCorrections) {
          const existingIdx = allCorrections.findIndex(c => c.objectId === ic.objectId);
          if (existingIdx >= 0) {
            const existing = allCorrections[existingIdx];
            allCorrections[existingIdx] = {
              objectId: existing.objectId,
              translation: vec2(existing.translation.x + ic.translation.x, existing.translation.y + ic.translation.y),
              reason: existing.reason // keep first reason for MVP
            };
          } else {
            allCorrections.push({ ...ic });
          }
        }
        hasCorrections = true;
      }

      if (!madeProgress) {
        break; // No more corrections needed
      }
    }

    // Final evaluation
    const finalWorkingContext: ConstraintSolveContext = {
      objectIds: context.objectIds,
      getWorldBBox: (oid) => workingBBoxes.get(oid as string) || null,
      getWorldTransform: (oid) => workingWorldTransforms.get(oid as string) || null,
      getParentWorldTransform: (oid) => parentWorldTransforms.get(oid as string) || null,
      tolerance
    };

    const finalViolations: ConstraintViolation[] = [];
    for (const constraint of sorted) {
      const v = evaluateConstraint(constraint, finalWorkingContext, tolerance);
      finalViolations.push(...v);
    }

    // Check unsatisfiable: required constraints still violated
    const hasRequiredViolation = finalViolations.some(v => {
      const c = sorted.find(sc => sc.id === v.constraintId);
      return c?.strength === 'required';
    });

    let status: 'satisfied' | 'corrected' | 'unsatisfiable';
    if (hasRequiredViolation) {
      status = 'unsatisfiable';
    } else if (hasCorrections && finalViolations.length === 0) {
      status = 'corrected';
    } else if (!hasCorrections && finalViolations.length === 0) {
      status = 'satisfied';
    } else if (hasCorrections && finalViolations.length > 0) {
      // Some weak/strong constraints still violated but required satisfied - consider corrected with remaining violations
      // For MVP, if there are only weak violations, still corrected
      const onlyWeak = finalViolations.every(v => {
        const c = sorted.find(sc => sc.id === v.constraintId);
        return c?.strength !== 'required';
      });
      status = onlyWeak ? 'corrected' : 'unsatisfiable';
    } else {
      status = 'satisfied';
    }

    // Special handling: equalWidth/equalHeight with required strength and violation => unsatisfiable
    const hasEqualSizeRequiredViolation = finalViolations.some(v => {
      const c = sorted.find(sc => sc.id === v.constraintId);
      return c && (c.type === 'equalWidth' || c.type === 'equalHeight') && c.strength === 'required';
    });
    if (hasEqualSizeRequiredViolation) {
      status = 'unsatisfiable';
    }

    return {
      status,
      corrections: allCorrections,
      violations: finalViolations,
      iterations: iterations + 1
    };
  }
}

export function createConstraintSolver(): ConstraintSolver {
  return new DeterministicConstraintSolver();
}
