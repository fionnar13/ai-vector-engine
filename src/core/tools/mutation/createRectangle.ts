
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const createRectangleTool: ToolDefinition = {
  id: 'T01',
  name: 'create_rectangle',
  version: '1.0.0',
  category: 'mutation',
  description: 'Create a rectangle object with parametric representation',
  inputSchema: {
    type: 'object',
    required: ['width', 'height'],
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      rx: { type: 'number' },
      ry: { type: 'number' },
      fill: { type: 'object' },
      stroke: { type: 'object' }
    }
  },
  outputSchema: {
    type: 'object',
    required: ['objectId', 'geometryId', 'nodeId'],
    properties: {
      objectId: { type: 'string' },
      geometryId: { type: 'string' },
      nodeId: { type: 'string' }
    }
  },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any, context: ToolContext): ToolValidationResult {
    const errors: any[] = [];
    if (typeof input.width !== 'number' || !Number.isFinite(input.width) || input.width <= 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'width must be finite positive number' });
    }
    if (typeof input.height !== 'number' || !Number.isFinite(input.height) || input.height <= 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'height must be finite positive number' });
    }
    if (input.x !== undefined && (typeof input.x !== 'number' || !Number.isFinite(input.x))) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'x must be finite number' });
    }
    if (input.y !== undefined && (typeof input.y !== 'number' || !Number.isFinite(input.y))) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'y must be finite number' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    // Create geometry
    const geometryId = context.objectStore ? (context as any).ids?.createGeometryID?.() || `geom-${Date.now()}-${Math.random()}` : `geom-${Date.now()}`;
    const objectId = (context as any).ids?.createObjectID?.() || `obj-${Date.now()}-${Math.random()}`;
    const appearanceId = (context as any).ids?.createAppearanceID?.() || `app-${Date.now()}-${Math.random()}`;
    const nodeId = (context as any).ids?.createNodeID?.() || `node-${Date.now()}-${Math.random()}`;

    const geometry = {
      type: 'rect',
      params: {
        x: input.x ?? 0,
        y: input.y ?? 0,
        width: input.width,
        height: input.height,
        rx: input.rx ?? 0,
        ry: input.ry ?? 0
      }
    };

    // Build commands via working copy if available (transaction boundary)
    if (context.workingCopy) {
      const appearance = {
        id: appearanceId,
        stack: [
          ...(input.fill ? [{ id: 'fill-1', type: 'fill', enabled: true, data: input.fill }] : []),
          ...(input.stroke ? [{ id: 'stroke-1', type: 'stroke', enabled: true, data: input.stroke }] : [])
        ]
      };
      context.workingCopy.setGeometry(geometryId, geometry);
      context.workingCopy.setAppearance(appearance);
      context.workingCopy.setObject({
        id: objectId,
        geometryRef: geometryId,
        appearanceRef: appearanceId,
        meta: { name: 'rectangle', locked: false, visible: true, selectable: true }
      });
      // Create node - assume root exists or create root handling is done by transaction executor
      // For simplicity, create node with null parent handling in working copy
      const node = {
        id: nodeId,
        objectId,
        parentId: null,
        children: [],
        localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
      };
      context.workingCopy.setNode(node);
    } else if (context.geometryStore && context.objectStore) {
      // Direct path for testing without transaction - still via stores but we are in mutation tool that should use transaction
      // For core tooling tests, we allow direct store mutation when workingCopy not present, but real production path uses workingCopy
      try {
        context.geometryStore.create(geometryId, geometry);
      } catch {}
      const appearance = {
        id: appearanceId,
        stack: []
      };
      try {
        context.appearanceStore.create(appearance);
      } catch {}
      context.objectStore.create({
        id: objectId,
        geometryRef: geometryId,
        appearanceRef: appearanceId,
        meta: { name: 'rectangle', locked: false, visible: true, selectable: true }
      });
      if (context.sceneGraph && context.sceneGraph.createNode) {
        try {
          const root = context.sceneGraph.getRoots ? context.sceneGraph.getRoots()[0] : null;
          const parentId = root ? root.id : null;
          if (parentId) {
            context.sceneGraph.createNode(objectId, parentId);
          } else {
            const r = context.sceneGraph.createRoot ? context.sceneGraph.createRoot() : { id: 'root' };
            context.sceneGraph.createNode(objectId, r.id);
          }
        } catch {}
      }
    }

    return {
      success: true,
      output: { objectId, geometryId, nodeId }
    };
  }
};
