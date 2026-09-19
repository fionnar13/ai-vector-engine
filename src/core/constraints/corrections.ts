
import { Constraint, ConstraintCorrection } from './types.js';
import { BBox } from '../math/bbox.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { Matrix3x3, invert, transformPoint, multiply } from '../math/matrix3x3.js';
import { getCenter, getWidth, getHeight, distanceBetweenCenters } from './bbox-reference.js';

export interface WorkingBBoxState {
  bboxes: Map<string, BBox>;
  worldTransforms: Map<string, Matrix3x3>;
  localTransforms?: Map<string, Matrix3x3>;
  parentWorldTransforms?: Map<string, Matrix3x3>;
}

export function calculateCorrections(
  constraint: Constraint,
  state: WorkingBBoxState
): ConstraintCorrection[] {
  const corrections: ConstraintCorrection[] = [];
  if (!constraint.enabled) return corrections;

  // Sort objectIds deterministically - first is reference, rest are moved
  // But maintain original order for deterministic behavior, reference is first id
  const refId = constraint.objectIds[0];
  const refBBox = state.bboxes.get(refId as string);
  if (!refBBox) return corrections;

  switch (constraint.type) {
    case 'horizontal':
    case 'alignCenterY': {
      const refCenter = getCenter(refBBox);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const c = getCenter(bbox);
        const dy = refCenter.y - c.y;
        if (Math.abs(dy) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(0, dy),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'vertical':
    case 'alignCenterX': {
      const refCenter = getCenter(refBBox);
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const c = getCenter(bbox);
        const dx = refCenter.x - c.x;
        if (Math.abs(dx) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(dx, 0),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'alignLeft': {
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const dx = refBBox.minX - bbox.minX;
        if (Math.abs(dx) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(dx, 0),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'alignRight': {
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const dx = refBBox.maxX - bbox.maxX;
        if (Math.abs(dx) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(dx, 0),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'alignTop': {
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const dy = refBBox.minY - bbox.minY;
        if (Math.abs(dy) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(0, dy),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'alignBottom': {
      for (let i = 1; i < constraint.objectIds.length; i++) {
        const oid = constraint.objectIds[i];
        const bbox = state.bboxes.get(oid as string);
        if (!bbox) continue;
        const dy = refBBox.maxY - bbox.maxY;
        if (Math.abs(dy) > 1e-12) {
          corrections.push({
            objectId: oid,
            translation: vec2(0, dy),
            reason: constraint.id
          });
        }
      }
      break;
    }
    case 'equalWidth':
    case 'equalHeight': {
      // For MVP, equal width/height are considered unsatisfiable if not already satisfied
      // because they require geometry change, not just translation
      // We will treat them as no translation correction but will report violation
      // Alternatively, if we want to support, we would need scaling - out of MVP translation-only
      // So we return no corrections for these types - solver will detect unsatisfiable if required
      break;
    }
    case 'fixedDistance': {
      if (constraint.objectIds.length !== 2) break;
      const target = constraint.parameters?.distance;
      if (target === undefined) break;
      const oidA = constraint.objectIds[0];
      const oidB = constraint.objectIds[1];
      const bboxA = state.bboxes.get(oidA as string);
      const bboxB = state.bboxes.get(oidB as string);
      if (!bboxA || !bboxB) break;

      const centerA = getCenter(bboxA);
      const centerB = getCenter(bboxB);
      const dx = centerB.x - centerA.x;
      const dy = centerB.y - centerA.y;
      const currentDist = Math.hypot(dx, dy);

      if (currentDist < 1e-12) {
        // If coincident, move B along x axis
        corrections.push({
          objectId: oidB,
          translation: vec2(target, 0),
          reason: constraint.id
        });
      } else {
        const targetRatio = target / currentDist;
        const newX = centerA.x + dx * targetRatio;
        const newY = centerA.y + dy * targetRatio;
        const transX = newX - centerB.x;
        const transY = newY - centerB.y;
        if (Math.abs(transX) > 1e-12 || Math.abs(transY) > 1e-12) {
          corrections.push({
            objectId: oidB,
            translation: vec2(transX, transY),
            reason: constraint.id
          });
        }
      }
      break;
    }
  }

  return corrections;
}

export function applyCorrectionToBBox(bbox: BBox, translation: Vec2): BBox {
  return {
    minX: bbox.minX + translation.x,
    minY: bbox.minY + translation.y,
    maxX: bbox.maxX + translation.x,
    maxY: bbox.maxY + translation.y
  };
}

export function convertWorldTranslationToLocal(
  worldTranslation: Vec2,
  parentWorldTransform: Matrix3x3
): Vec2 {
  try {
    const inv = invert(parentWorldTransform);
    const origin = { x: 0, y: 0 };
    const translatedOrigin = { x: worldTranslation.x, y: worldTranslation.y };
    // Transform delta: apply inverse parent to both points and subtract
    // For translation only, we need to account for parent rotation/scale
    // Simplified: transform vector by inverse linear part
    // inv linear: [inv.a inv.c; inv.b inv.d] applied to translation vector
    const localX = inv.a * worldTranslation.x + inv.c * worldTranslation.y;
    const localY = inv.b * worldTranslation.x + inv.d * worldTranslation.y;
    return vec2(localX, localY);
  } catch {
    return worldTranslation;
  }
}
