
import { BBox } from '../math/bbox.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { ObjectID } from '../ids/index.js';

export function getCenter(bbox: BBox): Vec2 {
  return vec2((bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2);
}

export function getWidth(bbox: BBox): number {
  return bbox.maxX - bbox.minX;
}

export function getHeight(bbox: BBox): number {
  return bbox.maxY - bbox.minY;
}

export function distanceBetweenCenters(a: BBox, b: BBox): number {
  const ca = getCenter(a);
  const cb = getCenter(b);
  const dx = ca.x - cb.x;
  const dy = ca.y - cb.y;
  return Math.hypot(dx, dy);
}

export function getReferencePoint(bbox: BBox): Vec2 {
  return getCenter(bbox);
}

// For fixedDistance, we use center-to-center distance in world space
export function calculateFixedDistanceError(a: BBox, b: BBox, targetDistance: number): number {
  const actual = distanceBetweenCenters(a, b);
  return Math.abs(actual - targetDistance);
}
