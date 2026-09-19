
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const inferSemanticTool: ToolDefinition = {
  id: 'T20',
  name: 'infer_semantic',
  version: '1.0.0',
  category: 'proposal',
  description: 'Infer semantic proposals MUST NOT directly write to SemanticStore governed by Semantic Contract',
  inputSchema: {
    type: 'object',
    properties: { objectIds: { type: 'array' } }
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

    const proposals: any[] = [];

    for (const oid of objectIds) {
      let geometry: any = null;
      let appearance: any = null;
      let sceneContext: any = {};

      if (context.workingCopy && context.workingCopy.getObject) {
        const obj = context.workingCopy.getObject(oid);
        if (obj) {
          geometry = context.workingCopy.getGeometry(obj.geometryRef);
          appearance = context.workingCopy.getAppearance(obj.appearanceRef);
        }
      } else if (context.objectStore && context.geometryStore) {
        const obj = context.objectStore.get(oid);
        if (obj) {
          geometry = context.geometryStore.get(obj.geometryRef);
          if (context.appearanceStore) appearance = context.appearanceStore.get(obj.appearanceRef);
        }
      }

      // Use existing semantic heuristics if available
      let role = 'unknown';
      let tags: string[] = [];
      let confidence = 0.5;

      if (geometry) {
        if (geometry.type === 'rect') {
          const w = geometry.params?.width || 100;
          const h = geometry.params?.height || 100;
          const area = w * h;
          if (area > 100000) {
            role = 'background';
            tags = ['background', 'shape'];
            confidence = 0.6;
          } else {
            role = 'shape';
            tags = ['shape'];
            confidence = 0.55;
          }
        } else if (geometry.type === 'text') {
          role = 'text';
          tags = ['text'];
          confidence = 0.9;
        } else if (geometry.type === 'ellipse') {
          role = 'shape';
          tags = ['shape', 'ellipse'];
          confidence = 0.55;
        } else {
          role = 'shape';
          tags = ['shape'];
          confidence = 0.5;
        }
      }

      proposals.push({
        proposalId: `semantic-proposal-${oid}-${Date.now()}`,
        objectId: oid,
        role,
        tags,
        confidence,
        source: 'heuristic',
        evidence: [{ signal: 'geometry_type', description: `geometry ${geometry?.type || 'unknown'}`, weight: 0.1 }]
      });
    }

    proposals.sort((a, b) => a.objectId.localeCompare(b.objectId));

    return { success: true, output: { proposals } };
  }
};
