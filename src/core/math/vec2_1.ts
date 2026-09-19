
/**
 * Vec2 - Foundation Math Primitive
 * Purpose: 2D point/vector, no UI dependency
 * Invariants: finite numbers only, no NaN/Infinity
 */
export type Vec2 = {
  readonly x: number;
  readonly y: number;
};

export const TOLERANCE = 1e-9;

export function vec2(x: number, y: number): Vec2 {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Vec2 must be finite: (${x}, ${y})`);
  }
  return { x, y };
}

export function isFiniteVec2(v: unknown): v is Vec2 {
  if (!v || typeof v !== 'object') return false;
  const vv = v as Vec2;
  return typeof vv.x === 'number' && typeof vv.y === 'number' && Number.isFinite(vv.x) && Number.isFinite(vv.y);
}

export function assertFiniteVec2(v: Vec2, context?: string): void {
  if (!isFiniteVec2(v)) {
    throw new Error(`Invalid Vec2${context ? ' in '+context : ''}: ${JSON.stringify(v)}`);
  }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x + b.x, a.y + b.y);
}
export function subtract(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x - b.x, a.y - b.y);
}
export function multiply(a: Vec2, s: number): Vec2 {
  if (!Number.isFinite(s)) throw new Error(`Scalar not finite: ${s}`);
  return vec2(a.x * s, a.y * s);
}
export function divide(a: Vec2, s: number): Vec2 {
  if (!Number.isFinite(s) || s === 0) throw new Error(`Invalid divide scalar: ${s}`);
  return vec2(a.x / s, a.y / s);
}
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
export function cross(a: Vec2, b: Vec2): number {
  // 2D cross returns scalar (z component)
  return a.x * b.y - a.y * b.x;
}
export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}
export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}
export function distance(a: Vec2, b: Vec2): number {
  return length(subtract(a,b));
}
export function distanceSq(a: Vec2, b: Vec2): number {
  return lengthSq(subtract(a,b));
}
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len < TOLERANCE) throw new Error(`Cannot normalize zero vector`);
  return divide(v, len);
}
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  if (!Number.isFinite(t)) throw new Error(`t not finite`);
  return vec2(a.x + (b.x - a.x)*t, a.y + (b.y - a.y)*t);
}
export function equals(a: Vec2, b: Vec2, tol = TOLERANCE): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}
export function zero(): Vec2 { return vec2(0,0); }
