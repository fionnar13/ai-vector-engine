
import { ToolRegistry } from './registry.js';
import { createRectangleTool } from './mutation/createRectangle.js';
import { createEllipseTool } from './mutation/createEllipse.js';
import { createPathTool } from './mutation/createPath.js';
import { deleteObjectsTool } from './mutation/deleteObjects.js';
import { moveObjectTool } from './mutation/moveObject.js';
import { transformObjectsTool } from './mutation/transformObjects.js';
import { applyFillTool } from './mutation/applyFill.js';
import { alignObjectsTool } from './mutation/alignObjects.js';
import { distributeObjectsTool } from './mutation/distributeObjects.js';
import { groupObjectsTool } from './mutation/groupObjects.js';
import { ungroupObjectsTool } from './mutation/ungroupObjects.js';
import { reorderObjectsTool } from './mutation/reorderObjects.js';
import { booleanOperationTool } from './mutation/booleanOperation.js';
import { outlineTextTool } from './mutation/outlineText.js';
import { createPointTextTool } from './mutation/createPointText.js';
import { findObjectByRoleTool } from './read/findObjectByRole.js';
import { detectShapePrimitiveTool } from './read/detectShapePrimitive.js';
import { detectSymmetryTool } from './read/detectSymmetry.js';
import { inferConstraintsTool } from './proposal/inferConstraints.js';
import { inferSemanticTool } from './proposal/inferSemantic.js';

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createRectangleTool);
  registry.register(createEllipseTool);
  registry.register(createPathTool);
  registry.register(deleteObjectsTool);
  registry.register(moveObjectTool);
  registry.register(transformObjectsTool);
  registry.register(applyFillTool);
  registry.register(alignObjectsTool);
  registry.register(distributeObjectsTool);
  registry.register(groupObjectsTool);
  registry.register(ungroupObjectsTool);
  registry.register(reorderObjectsTool);
  registry.register(booleanOperationTool);
  registry.register(outlineTextTool);
  registry.register(createPointTextTool);
  registry.register(findObjectByRoleTool);
  registry.register(detectShapePrimitiveTool);
  registry.register(detectSymmetryTool);
  registry.register(inferConstraintsTool);
  registry.register(inferSemanticTool);
}

export function createCoreToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerCoreTools(registry);
  return registry;
}
