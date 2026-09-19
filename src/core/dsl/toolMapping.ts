
import { DSLNode, ToolIR, DSLError } from './types.js';
import { DSLErrorCodes, createError } from './errors.js';

export function mapToToolIR(node: DSLNode): { ir?: ToolIR; error?: DSLError } {
  const sourceIndex = node.sourceIndex;
  const sourceRef = node.ref;

  switch (node.op) {
    case 'create': {
      const type = node.type as string;
      const args = node.args as any;
      let toolId: string;
      let input: any;

      if (type === 'rect') {
        toolId = 'T01';
        input = {
          x: args.x ?? 0,
          y: args.y ?? 0,
          width: args.width,
          height: args.height,
          rx: args.rx ?? 0,
          ry: args.ry ?? 0,
          fill: args.fill ? { kind: 'solid', color: parseColor(args.fill) } : undefined,
          stroke: args.stroke
        };
      } else if (type === 'ellipse') {
        toolId = 'T02';
        input = {
          cx: args.cx ?? args.x ?? 0,
          cy: args.cy ?? args.y ?? 0,
          rx: args.rx ?? args.width ? args.width / 2 : 50,
          ry: args.ry ?? args.height ? args.height / 2 : 50,
          fill: args.fill
        };
        // Normalize rx/ry if width/height provided
        if (args.width !== undefined && args.rx === undefined) input.rx = args.width / 2;
        if (args.height !== undefined && args.ry === undefined) input.ry = args.height / 2;
      } else if (type === 'path') {
        toolId = 'T03';
        input = {
          contours: args.contours,
          fillRule: args.fillRule ?? 'nonZero'
        };
      } else if (type === 'line' || type === 'polygon' || type === 'star') {
        // Map to path creation for MVP
        toolId = 'T03';
        input = {
          contours: args.contours || [],
          fillRule: args.fillRule ?? 'nonZero',
          primitiveType: type,
          primitiveArgs: args
        };
      } else if (type === 'pointText') {
        toolId = 'T15';
        input = {
          content: args.content,
          position: args.position,
          style: args.style
        };
      } else {
        return { error: createError(DSLErrorCodes.COMPILE_FAILED, `Unsupported create type ${type}`, { type }, sourceIndex, sourceRef) };
      }

      return {
        ir: {
          toolId,
          input,
          sourceInstructionIndex: sourceIndex,
          sourceRef,
          category: 'mutation'
        }
      };
    }

    case 'text': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T15',
          input: {
            content: args.content,
            position: args.position,
            style: args.style
          },
          sourceInstructionIndex: sourceIndex,
          sourceRef,
          category: 'mutation'
        }
      };
    }

    case 'update': {
      // Update maps to transform or appearance or geometry update - for MVP, we map width/height changes to a special update path
      // Since no direct update tool, we will map to transform or recreate via custom handling in executor
      // For simplicity, we map to a generic update IR that executor will handle
      const args = node.args as any;
      // If only fill/opacity, map to appearance
      if (args.fill !== undefined || args.opacity !== undefined || args.stroke !== undefined) {
        return {
          ir: {
            toolId: 'T07',
            input: {
              objectIds: [], // resolved at execution
              fill: args.fill ? { kind: 'solid', color: parseColor(args.fill) } : undefined,
              opacity: args.opacity
            },
            sourceInstructionIndex: sourceIndex,
            sourceRef: node.target,
            targets: node.target ? [node.target] : node.targets,
            category: 'mutation'
          }
        };
      }
      // Otherwise, treat as geometry update - we will need to handle via delete+create or specific tool
      // For MVP, map to transform if x/y, or custom
      return {
        ir: {
          toolId: 'T05', // move as placeholder, executor will handle width/height via custom logic
          input: {
            objectIds: [],
            delta: { x: 0, y: 0 },
            updateArgs: args
          },
          sourceInstructionIndex: sourceIndex,
          sourceRef: node.target,
          targets: node.target ? [node.target] : node.targets,
          category: 'mutation'
        }
      };
    }

    case 'delete': {
      return {
        ir: {
          toolId: 'T04',
          input: {
            objectIds: [] // resolved at execution
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'transform': {
      const args = node.args as any;
      let transform: any;

      if (args.matrix) {
        transform = args.matrix;
      } else if (args.translate) {
        transform = { a: 1, b: 0, c: 0, d: 1, tx: args.translate.x, ty: args.translate.y };
      } else if (args.scale) {
        const sx = typeof args.scale === 'number' ? args.scale : args.scale.x;
        const sy = typeof args.scale === 'number' ? args.scale : (args.scale.y ?? args.scale.x);
        transform = { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
        if (args.translate) {
          transform.tx = args.translate.x;
          transform.ty = args.translate.y;
        }
      } else if (args.rotate !== undefined) {
        const rad = (args.rotate * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        transform = { a: c, b: s, c: -s, d: c, tx: 0, ty: 0 };
      } else {
        return { error: createError(DSLErrorCodes.COMPILE_FAILED, `Invalid transform args`, { args }, sourceIndex) };
      }

      // Check if simple translate - can use T05 move for efficiency
      if (transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1) {
        return {
          ir: {
            toolId: 'T05',
            input: {
              objectIds: [],
              delta: { x: transform.tx, y: transform.ty }
            },
            sourceInstructionIndex: sourceIndex,
            targets: node.target ? [node.target] : node.targets,
            category: 'mutation'
          }
        };
      }

      return {
        ir: {
          toolId: 'T06',
          input: {
            objectIds: [],
            transform
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.target ? [node.target] : node.targets,
          category: 'mutation'
        }
      };
    }

    case 'appearance': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T07',
          input: {
            objectIds: [],
            fill: args.fill ? { kind: 'solid', color: parseColor(args.fill) } : undefined,
            opacity: args.opacity,
            stroke: args.stroke
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.target ? [node.target] : node.targets,
          category: 'mutation'
        }
      };
    }

    case 'group': {
      return {
        ir: {
          toolId: 'T10',
          input: {
            objectIds: []
          },
          sourceInstructionIndex: sourceIndex,
          sourceRef,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'ungroup': {
      return {
        ir: {
          toolId: 'T11',
          input: {
            objectIds: []
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.target ? [node.target] : [],
          category: 'mutation'
        }
      };
    }

    case 'reorder': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T12',
          input: {
            objectIds: [],
            operation: args.operation
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'boolean': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T13',
          input: {
            objectIds: [],
            operation: node.operation,
            fillRule: args.fillRule ?? 'nonZero',
            tolerance: args.tolerance ?? 0.5,
            keepOriginals: args.keepOriginals ?? false
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'align': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T08',
          input: {
            objectIds: [],
            axis: args.axis ?? 'horizontal',
            mode: args.mode ?? 'center'
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'distribute': {
      const args = node.args as any;
      return {
        ir: {
          toolId: 'T09',
          input: {
            objectIds: [],
            axis: args.axis ?? 'horizontal',
            mode: args.mode ?? 'gaps'
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'mutation'
        }
      };
    }

    case 'artboard': {
      // Artboard is handled specially - not a tool, but for MVP we map to a custom IR that executor handles
      return {
        ir: {
          toolId: 'ARTBOARD',
          input: node.args,
          sourceInstructionIndex: sourceIndex,
          category: 'mutation'
        }
      };
    }

    case 'propose_constraint': {
      return {
        ir: {
          toolId: 'T19',
          input: {
            objectIds: []
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.targets,
          category: 'proposal'
        }
      };
    }

    case 'propose_semantic': {
      return {
        ir: {
          toolId: 'T20',
          input: {
            objectIds: []
          },
          sourceInstructionIndex: sourceIndex,
          targets: node.target ? [node.target] : node.targets,
          category: 'proposal'
        }
      };
    }

    default:
      return { error: createError(DSLErrorCodes.COMPILE_FAILED, `Cannot map op ${node.op} to tool`, { op: node.op }, sourceIndex) };
  }
}

function parseColor(color: any): any {
  if (typeof color === 'string') {
    // Simple hex parsing
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r, g, b, a: 1 };
      }
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return { r, g, b, a: 1 };
      }
    }
    return { r: 0, g: 0, b: 0, a: 1, original: color };
  }
  if (typeof color === 'object' && color !== null) {
    return color;
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export const TOOL_MAPPING: Record<string, string> = {
  'create:rect': 'T01',
  'create:ellipse': 'T02',
  'create:path': 'T03',
  'create:line': 'T03',
  'create:polygon': 'T03',
  'create:star': 'T03',
  'create:pointText': 'T15',
  'text': 'T15',
  'delete': 'T04',
  'transform:translate': 'T05',
  'transform:matrix': 'T06',
  'appearance': 'T07',
  'align': 'T08',
  'distribute': 'T09',
  'group': 'T10',
  'ungroup': 'T11',
  'reorder': 'T12',
  'boolean': 'T13',
  'text:outline': 'T14',
  'create:text': 'T15',
  'propose_constraint': 'T19',
  'propose_semantic': 'T20'
};
