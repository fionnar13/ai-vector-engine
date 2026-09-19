
import { GraphicObject } from './types.js';
import { isUUID } from '../ids/index.js';
import { createError } from '../errors/index.js';
import { Geometry } from '../geometry/types.js';
import { validateGeometry as validateGeomKernel } from '../geometry/validation.js';
import { validateAppearance as validateAppearanceEngine } from '../appearance/validation.js';

export function validateObjectID(id: string): void {
  if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID: ${id}`, severity: 'error' });
}

export function validateGraphicObject(obj: GraphicObject): void {
  if (!obj || typeof obj !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'GraphicObject missing', severity: 'error' });
  if (!isUUID(obj.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID ${obj.id}`, severity: 'error' });
  if (!isUUID(obj.geometryRef)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid GeometryID ${obj.geometryRef}`, severity: 'error' });
  if (!isUUID(obj.appearanceRef)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceID ${obj.appearanceRef}`, severity: 'error' });
  if (!obj.meta || typeof obj.meta.name !== 'string') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Object meta invalid', severity: 'error' });
  if ((obj as any).parent !== undefined) throw createError({ code: 'VALIDATION_SCHEMA', message: 'GraphicObject must NOT have parent field', severity: 'error' });
  if ((obj as any).children !== undefined) throw createError({ code: 'VALIDATION_SCHEMA', message: 'GraphicObject must NOT have children field', severity: 'error' });
  if ((obj as any).worldTransform !== undefined) throw createError({ code: 'VALIDATION_SCHEMA', message: 'GraphicObject must NOT have worldTransform field', severity: 'error' });
}

export function validateGeometryID(id: string): void {
  if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid GeometryID: ${id}`, severity: 'error' });
}

export function validateGeometry(geom: Geometry): void {
  if (!geom || typeof geom !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Geometry missing', severity: 'error' });
  if (geom.type === 'path') {
    validateGeomKernel(geom as any);
  } else {
    if (!(geom as any).params) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Parametric geometry params missing', severity: 'error' });
  }
}

export function validateAppearance(appearance: any): void {
  validateAppearanceEngine(appearance);
}
