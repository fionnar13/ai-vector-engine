
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const booleanOperationTool: ToolDefinition = {
  id: 'T13',
  name: 'boolean_operation',
  version: '1.0.0',
  category: 'mutation',
  description: 'Boolean operation union/difference/intersection respecting Phase 2.5 Boolean Contract',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'operation'],
    properties: {
      objectIds: { type: 'array' },
      operation: { type: 'string' },
      fillRule: { type: 'string' },
      tolerance: { type: 'number' },
      keepOriginals: { type: 'boolean' }
    }
  },
  outputSchema: { type: 'object', properties: { resultObjectId: { type: 'string' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any, context: ToolContext): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length < 2) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be >=2' });
    }
    if (!['union', 'difference', 'intersection'].includes(input.operation)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'operation must be union|difference|intersection' });
    }
    if (input.fillRule && !['nonZero', 'evenOdd'].includes(input.fillRule)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'invalid fillRule' });
    }
    // Check closed geometry
    if (context.geometryStore || context.workingCopy) {
      for (const oid of input.objectIds) {
        let geom: any = null;
        if (context.workingCopy && context.workingCopy.getObject) {
          const obj = context.workingCopy.getObject(oid);
          if (obj) geom = context.workingCopy.getGeometry(obj.geometryRef);
        } else if (context.objectStore && context.geometryStore) {
          const obj = context.objectStore.get(oid);
          if (obj) geom = context.geometryStore.get(obj.geometryRef);
        }
        if (geom) {
          // Check if open path
          if (geom.type === 'path' && geom.contours) {
            for (const contour of geom.contours) {
              if (!contour.closed) {
                errors.push({ code: 'GEOMETRY_OPEN_PATH', message: `Open path not allowed for boolean: ${oid}` });
              }
            }
          }
          if (geom.type === 'line') {
            errors.push({ code: 'GEOMETRY_OPEN_PATH', message: `Line is open path: ${oid}` });
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    // Call Geometry Boolean service - for MVP we mock the service call
    // Real implementation would call: booleanService.perform(input.objectIds, operation, fillRule, tolerance)
    const resultGeometryId = (context as any).ids?.createGeometryID?.() || `geom-bool-${Date.now()}`;
    const resultObjectId = (context as any).ids?.createObjectID?.() || `obj-bool-${Date.now()}`;
    const resultAppearanceId = (context as any).ids?.createAppearanceID?.() || `app-bool-${Date.now()}`;
    const resultNodeId = (context as any).ids?.createNodeID?.() || `node-bool-${Date.now()}`;

    const resultGeometry = {
      type: 'path',
      contours: [{ anchors: [{ id: 'a1', position: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' }], closed: true }],
      fillRule: input.fillRule ?? 'nonZero',
      booleanResult: true,
      operation: input.operation,
      sourceObjectIds: input.objectIds
    };

    if (context.workingCopy) {
      // Create result
      context.workingCopy.setGeometry(resultGeometryId, resultGeometry);
      context.workingCopy.setAppearance({ id: resultAppearanceId, stack: [] });
      context.workingCopy.setObject({ id: resultObjectId, geometryRef: resultGeometryId, appearanceRef: resultAppearanceId, meta: { name: `boolean-${input.operation}`, locked: false, visible: true, selectable: true } });
      context.workingCopy.setNode({ id: resultNodeId, objectId: resultObjectId, parentId: null, children: [], localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } });

      if (!input.keepOriginals) {
        for (const oid of input.objectIds) {
          context.workingCopy.deleteObject(oid);
        }
      }
    } else if (context.geometryStore) {
      try {
        context.geometryStore.create(resultGeometryId, resultGeometry);
        context.appearanceStore.create({ id: resultAppearanceId, stack: [] });
        context.objectStore.create({ id: resultObjectId, geometryRef: resultGeometryId, appearanceRef: resultAppearanceId, meta: { name: `boolean-${input.operation}`, locked: false, visible: true, selectable: true } });
        if (!input.keepOriginals) {
          for (const oid of input.objectIds) {
            try { context.objectStore.delete(oid); } catch {}
          }
        }
      } catch (e: any) {
        return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: e.message }] };
      }
    }

    return { success: true, output: { resultObjectId, resultGeometryId } };
  }
};
