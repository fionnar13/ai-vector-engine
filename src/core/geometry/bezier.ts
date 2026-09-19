
import { Vec2, vec2 } from '../math/vec2.js';

export interface CubicBezier {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}

export interface QuadraticBezier {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
}

export function evaluateCubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  if (!Number.isFinite(t) || t < -1e-9 || t > 1+1e-9) throw new Error(`t out of range: ${t}`);
  const clamped = Math.max(0, Math.min(1, t));
  const mt = 1 - clamped;
  const mt2 = mt*mt;
  const t2 = clamped*clamped;
  // B(t) = mt^3 P0 + 3 mt^2 t P1 + 3 mt t^2 P2 + t^3 P3
  const x = mt2*mt * p0.x + 3*mt2*clamped * p1.x + 3*mt*t2 * p2.x + t2*clamped * p3.x;
  const y = mt2*mt * p0.y + 3*mt2*clamped * p1.y + 3*mt*t2 * p2.y + t2*clamped * p3.y;
  return vec2(x,y);
}

export function cubicBezierDerivative(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  // B'(t) = 3(1-t)^2(P1-P0) + 6(1-t)t(P2-P1) + 3t^2(P3-P2)
  const dx = 3*mt*mt*(p1.x - p0.x) + 6*mt*t*(p2.x - p1.x) + 3*t*t*(p3.x - p2.x);
  const dy = 3*mt*mt*(p1.y - p0.y) + 6*mt*t*(p2.y - p1.y) + 3*t*t*(p3.y - p2.y);
  return vec2(dx, dy);
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  // Solve a t^2 + b t + c = 0
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return [];
    roots.push(-c / b);
    return roots;
  }
  const disc = b*b - 4*a*c;
  if (disc < 0) return [];
  if (disc < 1e-12) {
    roots.push(-b / (2*a));
  } else {
    const sqrt = Math.sqrt(disc);
    roots.push((-b + sqrt) / (2*a));
    roots.push((-b - sqrt) / (2*a));
  }
  return roots;
}

export function cubicBezierExtrema(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): { x: number[], y: number[] } {
  // Find t where derivative =0 for x and y separately
  // Derivative x: 3(1-t)^2 (p1x-p0x) +6(1-t)t(p2x-p1x)+3t^2(p3x-p2x) =0
  // Expand to quadratic: a t^2 + b t + c =0
  // Let's derive coefficients
  function extremaForDim(p0d: number, p1d: number, p2d: number, p3d: number): number[] {
    const a = -p0d + 3*p1d -3*p2d + p3d;
    const b = 2*(p0d -2*p1d + p2d);
    const c = -p0d + p1d;
    // derivative is 3*(a t^2 + b t + c) =0 => a t^2 + b t + c =0
    const roots = solveQuadratic(a,b,c);
    return roots.filter(t => t>0 && t<1);
  }
  const xRoots = extremaForDim(p0.x, p1.x, p2.x, p3.x);
  const yRoots = extremaForDim(p0.y, p1.y, p2.y, p3.y);
  return { x: xRoots, y: yRoots };
}

export function cubicBezierBBox(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2) {
  // Exact BBox using extrema
  const extrema = cubicBezierExtrema(p0,p1,p2,p3);
  const points = [p0, p3];
  for (const t of extrema.x) points.push(evaluateCubicBezier(p0,p1,p2,p3,t));
  for (const t of extrema.y) points.push(evaluateCubicBezier(p0,p1,p2,p3,t));
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const pt of points) {
    minX=Math.min(minX, pt.x); minY=Math.min(minY, pt.y);
    maxX=Math.max(maxX, pt.x); maxY=Math.max(maxY, pt.y);
  }
  return { minX, minY, maxX, maxY };
}

// Quadratic
export function evaluateQuadraticBezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const x = mt*mt*p0.x + 2*mt*t*p1.x + t*t*p2.x;
  const y = mt*mt*p0.y + 2*mt*t*p1.y + t*t*p2.y;
  return vec2(x,y);
}

export function quadraticToCubic(p0: Vec2, p1: Vec2, p2: Vec2): CubicBezier {
  // Convert quadratic to cubic: cubic control points
  // P1_cubic = P0 + 2/3 (P1_quad - P0)
  // P2_cubic = P2 + 2/3 (P1_quad - P2)
  const p1c = vec2(p0.x + (2/3)*(p1.x - p0.x), p0.y + (2/3)*(p1.y - p0.y));
  const p2c = vec2(p2.x + (2/3)*(p1.x - p2.x), p2.y + (2/3)*(p1.y - p2.y));
  return { p0, p1: p1c, p2: p2c, p3: p2 };
}

export function quadraticBezierBBox(p0: Vec2, p1: Vec2, p2: Vec2) {
  // Quadratic extrema: t = (p0 - p1)/(p0 -2p1 + p2)
  let minX = Math.min(p0.x, p2.x);
  let maxX = Math.max(p0.x, p2.x);
  let minY = Math.min(p0.y, p2.y);
  let maxY = Math.max(p0.y, p2.y);
  // Check x
  const denomX = p0.x - 2*p1.x + p2.x;
  if (Math.abs(denomX) > 1e-12) {
    const tx = (p0.x - p1.x) / denomX;
    if (tx>0 && tx<1) {
      const pt = evaluateQuadraticBezier(p0,p1,p2,tx);
      minX=Math.min(minX, pt.x); maxX=Math.max(maxX, pt.x);
    }
  }
  const denomY = p0.y - 2*p1.y + p2.y;
  if (Math.abs(denomY) > 1e-12) {
    const ty = (p0.y - p1.y) / denomY;
    if (ty>0 && ty<1) {
      const pt = evaluateQuadraticBezier(p0,p1,p2,ty);
      minY=Math.min(minY, pt.y); maxY=Math.max(maxY, pt.y);
    }
  }
  return { minX, minY, maxX, maxY };
}
