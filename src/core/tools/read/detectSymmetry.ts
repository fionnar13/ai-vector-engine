
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const detectSymmetryTool: ToolDefinition = {
  id: 'T18',
  name: 'detect_symmetry',
  version: '1.0.0',
  category: 'read',
  description: 'Detect symmetry analytical tool must not create constraint',
  inputSchema: {
    type: 'object',
    required: ['objectIds'],
    properties: {
      objectIds: { type: 'array' },
      axis: { type: 'string' }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      horizontal: { type: 'boolean' },
      vertical: { type: 'boolean' },
      deviation: { type: 'number' }
    }
  },
  permissions: getPermissionsForCategory('read'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds required' });
    }
    if (input.axis && !['horizontal', 'vertical', 'both'].includes(input.axis)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'axis must be horizontal|vertical|both' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    // Analytical: check if objects are symmetric around center
    // For MVP, deterministic calculation using WorldBBox centers
    let bboxes: any[] = [];
    if (context.sceneGraph && context.sceneGraph.getWorldBBox) {
      bboxes = input.objectIds.map((oid: string) => {
        try { return context.sceneGraph.getWorldBBox(oid) || { minX: 0, maxX: 100, minY: 0, maxY: 100 }; } catch { return { minX: 0, maxX: 100, minY: 0, maxY: 100 }; }
      });
    } else {
      bboxes = input.objectIds.map((_: any, i: number) => ({ minX: i * 100, maxX: i * 100 + 50, minY: 0, maxY: 50 }));
    }

    if (bboxes.length < 2) {
      return { success: true, output: { horizontal: false, vertical: false, deviation: 0 } };
    }

    // Check symmetry: for horizontal, check if left/right mirrored around average center X
    const centersX = bboxes.map(b => (b.minX + b.maxX) / 2);
    const centersY = bboxes.map(b => (b.minY + b.maxY) / 2);
    const avgX = centersX.reduce((a: number, b: number) => a + b, 0) / centersX.length;
    const avgY = centersY.reduce((a: number, b: number) => a + b, 0) / centersY.length;

    // For horizontal symmetry, pairs should be equidistant from avgX
    let horizontal = true;
    let vertical = true;
    let deviation = 0;

    // Simple check: sort by X and check mirrored pairs
    const sortedX = [...centersX].sort((a, b) => a - b);
    for (let i = 0; i < Math.floor(sortedX.length / 2); i++) {
      const left = sortedX[i];
      const right = sortedX[sortedX.length - 1 - i];
      const mid = (left + right) / 2;
      deviation += Math.abs(mid - avgX);
      if (Math.abs(mid - avgX) > 10) horizontal = false;
    }

    const sortedY = [...centersY].sort((a, b) => a - b);
    for (let i = 0; i < Math.floor(sortedY.length / 2); i++) {
      const top = sortedY[i];
      const bottom = sortedY[sortedY.length - 1 - i];
      const mid = (top + bottom) / 2;
      deviation += Math.abs(mid - avgY);
      if (Math.abs(mid - avgY) > 10) vertical = false;
    }

    if (input.axis === 'horizontal') vertical = false;
    if (input.axis === 'vertical') horizontal = false;

    return { success: true, output: { horizontal, vertical, deviation } };
  }
};
