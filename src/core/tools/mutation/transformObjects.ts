
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const transformObjectsTool: ToolDefinition = {
  id: 'T06',
  name: 'transform_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Transform objects using Matrix3x3 a c tx / b d ty / 0 0 1 Y-down column vectors',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'transform'],
    properties: {
      objectIds: { type: 'array' },
      transform: { type: 'object' },
      pivot: { type: 'object' }
    }
  },
  outputSchema: { type: 'object', properties: { transformed: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds required' });
    }
    const m = input.transform;
    if (!m || typeof m.a !== 'number' || typeof m.b !== 'number' || typeof m.c !== 'number' || typeof m.d !== 'number' || typeof m.tx !== 'number' || typeof m.ty !== 'number') {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'transform must be Matrix3x3 {a,b,c,d,tx,ty}' });
    } else {
      for (const k of ['a', 'b', 'c', 'd', 'tx', 'ty']) {
        if (!Number.isFinite(m[k])) errors.push({ code: 'VALIDATION_SCHEMA', message: `${k} must be finite` });
      }
      const det = m.a * m.d - m.b * m.c;
      if (Math.abs(det) < 1e-12) {
        errors.push({ code: 'TRANSFORM_SINGULAR', message: 'Transform is singular' });
      }
    }
    if (input.pivot) {
      if (typeof input.pivot.x !== 'number' || typeof input.pivot.y !== 'number' || !Number.isFinite(input.pivot.x) || !Number.isFinite(input.pivot.y)) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: 'pivot must be finite Vec2' });
      }
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const multiply = (m1: any, m2: any) => ({
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
      ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty
    });

    if (context.workingCopy) {
      for (const oid of input.objectIds) {
        let targetNode: any = null;
        if ((context.workingCopy as any).nodes) {
          for (const n of (context.workingCopy as any).nodes.values()) {
            if (n.objectId === oid || n.id === oid) { targetNode = n; break; }
          }
        }
        if (targetNode) {
          let newTransform = multiply(input.transform, targetNode.localTransform);
          // If pivot provided, need to adjust: T(pivot) * transform * T(-pivot) * local
          if (input.pivot) {
            const tNeg = { a: 1, b: 0, c: 0, d: 1, tx: -input.pivot.x, ty: -input.pivot.y };
            const tPos = { a: 1, b: 0, c: 0, d: 1, tx: input.pivot.x, ty: input.pivot.y };
            newTransform = multiply(tPos, multiply(input.transform, multiply(tNeg, targetNode.localTransform)));
          }
          context.workingCopy.setNode({ ...targetNode, localTransform: newTransform });
        }
      }
      return { success: true, output: { transformed: input.objectIds } };
    }

    return { success: true, output: { transformed: input.objectIds } };
  }
};
