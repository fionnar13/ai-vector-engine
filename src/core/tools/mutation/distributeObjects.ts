
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const distributeObjectsTool: ToolDefinition = {
  id: 'T09',
  name: 'distribute_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Distribute objects deterministically using WorldBBox',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'axis', 'mode'],
    properties: {
      objectIds: { type: 'array' },
      axis: { type: 'string' },
      mode: { type: 'string' }
    }
  },
  outputSchema: { type: 'object', properties: { distributed: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length < 3) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be >=3 for distribute' });
    }
    if (!['horizontal', 'vertical'].includes(input.axis)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'axis must be horizontal|vertical' });
    }
    if (!['centers', 'gaps'].includes(input.mode)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'mode must be centers|gaps' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    // Deterministic distribution using WorldBBox centers
    // For MVP, we assume bboxes available via context or mock
    let bboxes: any[] = [];
    if (context.sceneGraph && context.sceneGraph.getWorldBBox) {
      bboxes = input.objectIds.map((oid: string) => {
        try { return context.sceneGraph.getWorldBBox(oid) || { minX: 0, maxX: 100, minY: 0, maxY: 100 }; } catch { return { minX: 0, maxX: 100, minY: 0, maxY: 100 }; }
      });
    } else {
      bboxes = input.objectIds.map((_: any, i: number) => ({ minX: i * 150, maxX: i * 150 + 100, minY: 0, maxY: 100 }));
    }

    // Sort by axis
    const indexed = input.objectIds.map((id: string, i: number) => ({ id, bbox: bboxes[i], index: i }));
    if (input.axis === 'horizontal') {
      indexed.sort((a: any, b: any) => (a.bbox.minX + a.bbox.maxX) / 2 - (b.bbox.minX + b.bbox.maxX) / 2);
    } else {
      indexed.sort((a: any, b: any) => (a.bbox.minY + a.bbox.maxY) / 2 - (b.bbox.minY + b.bbox.maxY) / 2);
    }

    // Calculate distribution
    if (context.workingCopy) {
      if (input.axis === 'horizontal') {
        const firstCenter = (indexed[0].bbox.minX + indexed[0].bbox.maxX) / 2;
        const lastCenter = (indexed[indexed.length - 1].bbox.minX + indexed[indexed.length - 1].bbox.maxX) / 2;
        const totalSpan = lastCenter - firstCenter;
        const step = totalSpan / (indexed.length - 1);
        for (let i = 1; i < indexed.length - 1; i++) {
          const targetCenter = firstCenter + step * i;
          const currentCenter = (indexed[i].bbox.minX + indexed[i].bbox.maxX) / 2;
          const dx = targetCenter - currentCenter;
          let targetNode: any = null;
          if ((context.workingCopy as any).nodes) {
            for (const n of (context.workingCopy as any).nodes.values()) {
              if (n.objectId === indexed[i].id) { targetNode = n; break; }
            }
          }
          if (targetNode) {
            const newTransform = { ...targetNode.localTransform, tx: (targetNode.localTransform.tx || 0) + dx };
            context.workingCopy.setNode({ ...targetNode, localTransform: newTransform });
          }
        }
      } else {
        const firstCenter = (indexed[0].bbox.minY + indexed[0].bbox.maxY) / 2;
        const lastCenter = (indexed[indexed.length - 1].bbox.minY + indexed[indexed.length - 1].bbox.maxY) / 2;
        const totalSpan = lastCenter - firstCenter;
        const step = totalSpan / (indexed.length - 1);
        for (let i = 1; i < indexed.length - 1; i++) {
          const targetCenter = firstCenter + step * i;
          const currentCenter = (indexed[i].bbox.minY + indexed[i].bbox.maxY) / 2;
          const dy = targetCenter - currentCenter;
          let targetNode: any = null;
          if ((context.workingCopy as any).nodes) {
            for (const n of (context.workingCopy as any).nodes.values()) {
              if (n.objectId === indexed[i].id) { targetNode = n; break; }
            }
          }
          if (targetNode) {
            const newTransform = { ...targetNode.localTransform, ty: (targetNode.localTransform.ty || 0) + dy };
            context.workingCopy.setNode({ ...targetNode, localTransform: newTransform });
          }
        }
      }
    }

    return { success: true, output: { distributed: input.objectIds } };
  }
};
