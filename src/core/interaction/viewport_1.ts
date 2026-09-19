
import { Vec2 } from '../math/types.js';
import { Matrix3x3 } from '../math/types.js';

export interface ViewportTransform {
  screenToWorld(point: Vec2): Vec2;
  worldToScreen(point: Vec2): Vec2;
  getMatrix(): Matrix3x3;
  getInverseMatrix(): Matrix3x3;
}

function invertMatrix(m: Matrix3x3): Matrix3x3 {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet
  };
}

function applyMatrix(m: Matrix3x3, v: Vec2): Vec2 {
  return {
    x: m.a * v.x + m.c * v.y + m.tx,
    y: m.b * v.x + m.d * v.y + m.ty
  };
}

export class ViewportTransformImpl implements ViewportTransform {
  private matrix: Matrix3x3;
  private invMatrix: Matrix3x3;

  constructor(matrix?: Matrix3x3) {
    this.matrix = matrix || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    this.invMatrix = invertMatrix(this.matrix);
  }

  setMatrix(matrix: Matrix3x3): void {
    this.matrix = matrix;
    this.invMatrix = invertMatrix(matrix);
  }

  screenToWorld(point: Vec2): Vec2 {
    return applyMatrix(this.invMatrix, point);
  }

  worldToScreen(point: Vec2): Vec2 {
    return applyMatrix(this.matrix, point);
  }

  getMatrix(): Matrix3x3 {
    return { ...this.matrix };
  }

  getInverseMatrix(): Matrix3x3 {
    return { ...this.invMatrix };
  }
}

export function createViewportTransform(matrix?: Matrix3x3): ViewportTransform {
  return new ViewportTransformImpl(matrix);
}
