
/**
 * Matrix3x3 - Foundation Transform
 * Convention:
 * [ a c tx ]
 * [ b d ty ]
 * [ 0 0 1  ]
 * Column vector: [x y 1]^T
 * World = ParentWorld * Local
 * Rotation: degrees, clockwise positive (Y-down), 0 = X axis
 * Coordinate: Origin top-left, X right, Y down
 */
import { Vec2, vec2, TOLERANCE } from './vec2.js';

export type Matrix3x3 = {
  readonly a: number; // m00
  readonly b: number; // m10
  readonly c: number; // m01
  readonly d: number; // m11
  readonly tx: number; // m02
  readonly ty: number; // m12
};

const EPS = 1e-9;

export function assertFiniteMatrix(m: Matrix3x3, ctx?: string): void {
  if (![m.a,m.b,m.c,m.d,m.tx,m.ty].every(Number.isFinite)) {
    throw new Error(`Invalid Matrix${ctx?' in '+ctx:''}: ${JSON.stringify(m)}`);
  }
}

export function identity(): Matrix3x3 {
  return { a:1, b:0, c:0, d:1, tx:0, ty:0 };
}

export function translation(tx: number, ty: number): Matrix3x3 {
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) throw new Error('translation not finite');
  return { a:1, b:0, c:0, d:1, tx, ty };
}

export function scale(sx: number, sy: number = sx): Matrix3x3 {
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) throw new Error('scale not finite');
  return { a:sx, b:0, c:0, d:sy, tx:0, ty:0 };
}

export function rotationDegrees(deg: number): Matrix3x3 {
  if (!Number.isFinite(deg)) throw new Error('rotation not finite');
  // Clockwise positive, Y-down: standard math rotation is CCW, so we invert angle? 
  // In Y-down, clockwise is positive, which corresponds to standard math negative.
  // To keep 0 = X axis and clockwise positive, we use angle = -deg in standard formula? Let's define:
  // We want (1,0) rotated 90 deg clockwise => (0,1) in Y-down? Actually in Y-down, (0,1) is down, which is clockwise from (1,0).
  // Standard math CCW 90 deg: (1,0) -> (0,1) with Y-up. In Y-down, same matrix works because Y direction flipped? 
  // Simpler: use standard CCW math but invert deg sign to make clockwise positive.
  // We'll implement: clockwise positive => use -deg in radians for standard cos/sin? Wait.
  // Standard: [cos -sin; sin cos] for CCW.
  // For clockwise positive, we want [cos sin; -sin cos] ??? Let's test: deg=90 cw should map (1,0) to (0,1) in Y-down? Actually in Y-down screen, (0,1) is down. So yes cw 90 should be (0,1).
  // Using [cos sin; -sin cos] with deg=90: cos0=0, sin90=1 => [0 1; -1 0] * (1,0) = (0,-1) not correct.
  // Using standard [cos -sin; sin cos] with deg = -90 (cw): cos(-90)=0, sin(-90)=-1 => [0 1; -1 0] * (1,0) = (0,-1) still wrong.
  // Let's brute: we want (1,0) -> (0,1) after 90 cw in Y-down.
  // So matrix should be [0 -?]. Solve: [a c; b d] * [1;0] = [a;b] = [0;1] => a=0,b=1
  // And (0,1) after 90 cw should go to (-1,0): [c;d] = [-1;0]
  // So matrix = [0 -1; 1 0] which is standard CCW 90: [cos -sin; sin cos] with cos0 sin1 => [0 -1;1 0]
  // So CCW in math = CW in Y-down? Because Y axis flipped. So we can use standard CCW formula and interpret deg as clockwise positive in Y-down.
  // Thus we use standard formula with deg directly.
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, tx:0, ty:0 };
}

export function multiply(m1: Matrix3x3, m2: Matrix3x3): Matrix3x3 {
  // m = m1 * m2
  // [a1 c1 tx1]   [a2 c2 tx2]   [a1*a2 + c1*b2, a1*c2 + c1*d2, a1*tx2 + c1*ty2 + tx1]
  // [b1 d1 ty1] * [b2 d2 ty2] = [b1*a2 + d1*b2, b1*c2 + d1*d2, b1*tx2 + d1*ty2 + ty1]
  // [0  0  1 ]   [0  0  1 ]    [0,0,1]
  assertFiniteMatrix(m1); assertFiniteMatrix(m2);
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty
  };
}

export function transformPoint(m: Matrix3x3, p: Vec2): Vec2 {
  return vec2(
    m.a * p.x + m.c * p.y + m.tx,
    m.b * p.x + m.d * p.y + m.ty
  );
}

export function transformVector(m: Matrix3x3, v: Vec2): Vec2 {
  // without translation
  return vec2(
    m.a * v.x + m.c * v.y,
    m.b * v.x + m.d * v.y
  );
}

export function determinant(m: Matrix3x3): number {
  return m.a * m.d - m.b * m.c;
}

export function isInvertible(m: Matrix3x3, tol = EPS): boolean {
  return Math.abs(determinant(m)) > tol;
}

export function inverse(m: Matrix3x3): Matrix3x3 {
  const det = determinant(m);
  if (Math.abs(det) < EPS) {
    throw new Error(`TRANSFORM_SINGULAR: determinant ${det}`);
  }
  const invDet = 1 / det;
  const a = m.d * invDet;
  const b = -m.b * invDet;
  const c = -m.c * invDet;
  const d = m.a * invDet;
  const tx = -(a * m.tx + c * m.ty);
  const ty = -(b * m.tx + d * m.ty);
  return { a,b,c,d, tx, ty };
}

export function aroundPivot(m: Matrix3x3, pivot: Vec2): Matrix3x3 {
  // T(pivot) * m * T(-pivot)
  const t1 = translation(-pivot.x, -pivot.y);
  const t2 = translation(pivot.x, pivot.y);
  return multiply(multiply(t2, m), t1);
}

export function equals(m1: Matrix3x3, m2: Matrix3x3, tol = EPS): boolean {
  return Math.abs(m1.a - m2.a) <= tol &&
         Math.abs(m1.b - m2.b) <= tol &&
         Math.abs(m1.c - m2.c) <= tol &&
         Math.abs(m1.d - m2.d) <= tol &&
         Math.abs(m1.tx - m2.tx) <= tol &&
         Math.abs(m1.ty - m2.ty) <= tol;
}

export function toString(m: Matrix3x3): string {
  return `[${m.a} ${m.c} ${m.tx}; ${m.b} ${m.d} ${m.ty}; 0 0 1]`;
}
