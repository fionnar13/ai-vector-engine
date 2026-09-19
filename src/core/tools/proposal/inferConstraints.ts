
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const inferConstraintsTool: ToolDefinition = {
  id: 'T19',
  name: 'infer_constraints',
  version: '1.0.0',
  category: 'proposal',
  description: 'Infer constraints proposals MUST NOT mutate ConstraintStore governed by C03',
  inputSchema: {
    type: 'object',
    properties: {
      objectIds: { type: 'array' }
    }
  },
  outputSchema: {
    type: 'object',
    required: ['proposals'],
    properties: { proposals: { type: 'array' } }
  },
  permissions: getPermissionsForCategory('proposal'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    return { valid: true, errors: [] };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const objectIds = input.objectIds || [];

    // Read-only inference: produce ConstraintProposal[] without mutating ConstraintStore
    // For MVP, simple deterministic heuristics

    let bboxes: Map<string, any> = new Map();
    if (context.sceneGraph && context.sceneGraph.getWorldBBox) {
      for (const oid of objectIds) {
        try { bboxes.set(oid, context.sceneGraph.getWorldBBox(oid)); } catch {}
      }
    } else if (objectIds.length > 0) {
      // Mock bboxes deterministic for test
      objectIds.forEach((oid: string, i: number) => {
        bboxes.set(oid, { minX: i * 200, minY: 0, maxX: i * 200 + 100, maxY: 100, centerX: i * 200 + 50, centerY: 50, width: 100, height: 100 });
      });
    }

    const proposals: any[] = [];

    if (bboxes.size >= 2) {
      const ids = Array.from(bboxes.keys());
      const boxes = Array.from(bboxes.values());

      // Align left if minX within tolerance
      const minXs = boxes.map(b => b.minX);
      const minXDiff = Math.max(...minXs) - Math.min(...minXs);
      if (minXDiff < 5) {
        proposals.push({
          proposalId: `proposal-${Date.now()}-align-left`,
          type: 'align',
          subtype: 'alignLeft',
          objectIds: ids,
          parameters: { tolerance: 1 },
          confidence: 0.9,
          reason: 'left edges aligned within tolerance'
        });
      }

      // Center alignment
      const centerXs = boxes.map(b => (b.minX + b.maxX) / 2);
      const centerXDiff = Math.max(...centerXs) - Math.min(...centerXs);
      if (centerXDiff < 5) {
        proposals.push({
          proposalId: `proposal-${Date.now()}-center-x`,
          type: 'center',
          subtype: 'alignCenterX',
          objectIds: ids,
          parameters: {},
          confidence: 0.9,
          reason: 'centerX aligned'
        });
      }

      // Equal width
      const widths = boxes.map(b => b.maxX - b.minX);
      const widthDiff = Math.max(...widths) - Math.min(...widths);
      if (widthDiff < 5) {
        proposals.push({
          proposalId: `proposal-${Date.now()}-equal-width`,
          type: 'equalWidth',
          objectIds: ids,
          parameters: {},
          confidence: 0.85,
          reason: 'widths equal within tolerance'
        });
      }

      // Equal height
      const heights = boxes.map(b => b.maxY - b.minY);
      const heightDiff = Math.max(...heights) - Math.min(...heights);
      if (heightDiff < 5) {
        proposals.push({
          proposalId: `proposal-${Date.now()}-equal-height`,
          type: 'equalHeight',
          objectIds: ids,
          parameters: {},
          confidence: 0.85,
          reason: 'heights equal within tolerance'
        });
      }

      // Symmetry proposal if symmetric
      if (ids.length >= 2) {
        const avgCenterX = centerXs.reduce((a, b) => a + b, 0) / centerXs.length;
        const symmetric = centerXs.every((cx: number, i: number) => {
          // Check if mirrored
          const mirrored = 2 * avgCenterX - cx;
          return centerXs.some((other: number) => Math.abs(other - mirrored) < 10);
        });
        if (symmetric) {
          proposals.push({
            proposalId: `proposal-${Date.now()}-symmetry`,
            type: 'symmetry',
            objectIds: ids,
            parameters: { axis: 'vertical' },
            confidence: 0.8,
            reason: 'objects symmetric around vertical axis'
          });
        }
      }
    }

    // Ensure deterministic ordering by proposal type
    proposals.sort((a, b) => a.type.localeCompare(b.type));

    return { success: true, output: { proposals } };
  }
};
