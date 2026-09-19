
import { Vec2, isFiniteVec2 } from '../math/vec2.js';
import { Matrix3x3 } from '../math/matrix3x3.js';
import { BBox } from '../math/bbox.js';
import { isUUID } from '../ids/index.js';

export function assertFinite(value: number, ctx?: string): void {
  if (!Number.isFinite(value)) throw new Error(`Value not finite${ctx?' in '+ctx:''}: ${value}`);
}
export function assertVec2(v: unknown, ctx?: string): asserts v is Vec2 {
  if (!isFiniteVec2(v)) throw new Error(`Invalid Vec2${ctx?' in '+ctx:''}: ${JSON.stringify(v)}`);
}
export function assertBBox(b: unknown, ctx?: string): asserts b is BBox {
  if (!b || typeof b !== 'object') throw new Error(`Invalid BBox ${ctx||''}`);
  const bb = b as BBox;
  if (![bb.minX,bb.minY,bb.maxX,bb.maxY].every(Number.isFinite)) throw new Error(`BBox not finite ${ctx||''}`);
  if (bb.minX > bb.maxX || bb.minY > bb.maxY) throw new Error(`BBox min>max ${ctx||''}`);
}
export function assertMatrix(m: unknown, ctx?: string): asserts m is Matrix3x3 {
  if (!m || typeof m !== 'object') throw new Error(`Invalid Matrix ${ctx||''}`);
  const mm = m as Matrix3x3;
  if (![mm.a,mm.b,mm.c,mm.d,mm.tx,mm.ty].every(Number.isFinite)) throw new Error(`Matrix not finite ${ctx||''}`);
}
export function assertUUID(id: unknown, ctx?: string): asserts id is string {
  if (typeof id !== 'string' || !isUUID(id)) throw new Error(`Invalid UUID${ctx?' in '+ctx:''}: ${id}`);
}
export function assertDefined<T>(value: T | undefined | null, ctx?: string): asserts value is T {
  if (value === undefined || value === null) throw new Error(`Value undefined/null${ctx?' in '+ctx:''}`);
}
