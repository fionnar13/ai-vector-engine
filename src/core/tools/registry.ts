
import { ToolDefinition, ToolID, ToolCategory, ToolContext, ToolResult, ToolValidationResult } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ID already registered: ${tool.id}`);
    }
    // Freeze definition to enforce immutability after registration
    const frozen = Object.freeze({ ...tool, inputSchema: Object.freeze({ ...tool.inputSchema }), outputSchema: Object.freeze({ ...tool.outputSchema }), permissions: Object.freeze({ ...tool.permissions, read: Object.freeze([...tool.permissions.read]), write: Object.freeze([...tool.permissions.write]) }) });
    this.tools.set(tool.id, frozen as ToolDefinition);
  }

  unregister(toolId: ToolID): void {
    this.tools.delete(toolId);
  }

  get(toolId: ToolID): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  has(toolId: ToolID): boolean {
    return this.tools.has(toolId);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.list().filter(t => t.category === category);
  }

  validate(toolId: ToolID, input: unknown, context: ToolContext): ToolValidationResult {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { valid: false, errors: [{ code: 'TOOL_NOT_FOUND', message: `Tool not found: ${toolId}` }] };
    }
    return tool.validate(input as any, context);
  }

  execute(toolId: ToolID, input: unknown, context: ToolContext): ToolResult {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { success: false, errors: [{ code: 'TOOL_NOT_FOUND', message: `Tool not found: ${toolId}` }] };
    }
    const validation = tool.validate(input as any, context);
    if (!validation.valid) {
      return { success: false, errors: validation.errors.map(e => ({ code: e.code, message: e.message, context: e.context })) };
    }
    // Enforce category invariants
    if (tool.category === 'read') {
      // Read tools must not create transaction - we enforce by checking that context does not have transaction creation in tool
      // Actual enforcement is via permission model and tool implementation
    }
    return tool.execute(input as any, context);
  }
}
