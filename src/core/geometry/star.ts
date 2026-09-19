
import { StarParams, StarGeometry } from './types.js';
import { createError } from '../errors/index.js';
import { vec2, Vec2 } from '../math/vec2.js';

export function validateStarParams(p: StarParams): void {
  if (![p.outerRadius, p.innerRadius, p.points, p.rotationDegrees].every(Number.isFinite)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: 'Star params not finite', severity: 'error' });
  }
  if (!p.center || typeof p.center.x !== 'number' || typeof p.center.y !== 'number' || !Number.isFinite(p.center.x) || !Number.isFinite(p.center.y)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: 'Star center invalid', severity: 'error' });
  }
  if (p.points < 3) throw createError({ code: 'VALIDATION_SCHEMA', message: `Star points must >=3, got ${p.points}`, severity: 'error' });
  if (!Number.isInteger(p.points)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Star points must be integer', severity: 'error' });
  if (p.outerRadius <= 0) throw createError({ code: 'GEOMETRY_DEGENERATE', message: 'Star outerRadius <=0', severity: 'warning', rollbackRequired: false });
  if (p.innerRadius < 0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Star innerRadius negative', severity: 'error' });
  if (p.innerRadius > p.outerRadius + 1e-9) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Star innerRadius > outerRadius', severity: 'error' });
}

export function createStarGeometry(params: StarParams): StarGeometry {
  validateStarParams(params);
  return { isParametric: true, type: 'star', params: { center: vec2(params.center.x, params.center.y), outerRadius: params.outerRadius, innerRadius: params.innerRadius, points: params.points, rotationDegrees: params.rotationDegrees } };
}

export function generateStarVertices(p: StarParams): Vec2[] {
  // Deterministic generation
  // Convention: In Y-down, clockwise is positive. Rotation 0 means first outer point at angle -90 deg (up) or 0 deg (right)? We choose -90 deg (up) as typical star pointing up.
  // But document decision.
  // We'll use: start angle = rotationDegrees - 90 (so 0 rotation points up)
  // Then alternate outer/inner every 180/points degrees
  const vertices: Vec2[] = [];
  const total = p.points * 2;
  const startDeg = p.rotationDegrees - 90; // so 0 rotation = up
  const step = 360 / total;
  for (let i=0;i<total;i++) {
    const angleDeg = startDeg + i * step;
    const rad = angleDeg * Math.PI / 180;
    const radius = i % 2 === 0 ? p.outerRadius : p.innerRadius;
    const x = p.center.x + Math.cos(rad) * radius;
    const y = p.center.y + Math.sin(rad) * radius;
    vertices.push(vec2(x,y));
  }
  return vertices;
}

export function starBBox(p: StarParams) {
  const verts = generateStarVertices(p);
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const v of verts) { minX=Math.min(minX,v.x); minY=Math.min(minY,v.y); maxX=Math.max(maxX,v.x); maxY=Math.max(maxY,v.y); }
  return { minX, minY, maxX, maxY };
}
