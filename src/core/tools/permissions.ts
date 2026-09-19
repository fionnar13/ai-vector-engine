
import { ToolPermissions, ToolCategory } from './types.js';

export function getPermissionsForCategory(category: ToolCategory): ToolPermissions {
  switch (category) {
    case 'read':
      return { read: ['sceneGraph', 'geometry', 'appearance', 'object', 'semantic', 'constraint', 'spatialIndex'], write: [] };
    case 'proposal':
      return { read: ['sceneGraph', 'geometry', 'appearance', 'object', 'semantic', 'constraint'], write: [] };
    case 'mutation':
      return { read: ['sceneGraph', 'geometry', 'appearance', 'object', 'semantic', 'constraint', 'spatialIndex'], write: ['transaction'] };
    default:
      return { read: [], write: [] };
  }
}
