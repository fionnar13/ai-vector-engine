
import { ToolID, ToolCategory } from './types.js';

export interface ToolMetadataEntry {
  id: ToolID;
  name: string;
  version: string;
  category: ToolCategory;
  deterministic: boolean;
  description: string;
}

export const CORE_TOOL_METADATA: ToolMetadataEntry[] = [
  { id: 'T01', name: 'create_rectangle', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Create a rectangle object' },
  { id: 'T02', name: 'create_ellipse', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Create an ellipse object' },
  { id: 'T03', name: 'create_path', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Create a path object' },
  { id: 'T04', name: 'delete_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Delete objects' },
  { id: 'T05', name: 'move_object', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Move objects' },
  { id: 'T06', name: 'transform_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Transform objects' },
  { id: 'T07', name: 'apply_fill', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Apply fill to objects' },
  { id: 'T08', name: 'align_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Align objects using WorldBBox' },
  { id: 'T09', name: 'distribute_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Distribute objects' },
  { id: 'T10', name: 'group_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Group objects' },
  { id: 'T11', name: 'ungroup_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Ungroup objects' },
  { id: 'T12', name: 'reorder_objects', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Reorder objects z-order' },
  { id: 'T13', name: 'boolean_operation', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Boolean operation union/difference/intersection' },
  { id: 'T14', name: 'outline_text', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Outline text to path' },
  { id: 'T15', name: 'create_point_text', version: '1.0.0', category: 'mutation', deterministic: true, description: 'Create point text' },
  { id: 'T16', name: 'find_object_by_role', version: '1.0.0', category: 'read', deterministic: true, description: 'Find objects by semantic role' },
  { id: 'T17', name: 'detect_shape_primitive', version: '1.0.0', category: 'read', deterministic: true, description: 'Detect shape primitive' },
  { id: 'T18', name: 'detect_symmetry', version: '1.0.0', category: 'read', deterministic: true, description: 'Detect symmetry' },
  { id: 'T19', name: 'infer_constraints', version: '1.0.0', category: 'proposal', deterministic: true, description: 'Infer constraints proposals' },
  { id: 'T20', name: 'infer_semantic', version: '1.0.0', category: 'proposal', deterministic: true, description: 'Infer semantic proposals' },
];
