
import { RenderCommand } from './types.js';
import { RenderNode } from './types.js';
import { Matrix3x3 } from '../math/types.js';

export function createSaveCommand(): RenderCommand {
  return { type: 'Save' };
}

export function createRestoreCommand(): RenderCommand {
  return { type: 'Restore' };
}

export function createSetTransformCommand(matrix: Matrix3x3): RenderCommand {
  return { type: 'SetTransform', payload: { matrix } };
}

export function createSetOpacityCommand(opacity: number): RenderCommand {
  return { type: 'SetOpacity', payload: { opacity } };
}

export function createBeginPathCommand(): RenderCommand {
  return { type: 'BeginPath' };
}

export function createMoveToCommand(x: number, y: number): RenderCommand {
  return { type: 'MoveTo', payload: { x, y } };
}

export function createLineToCommand(x: number, y: number): RenderCommand {
  return { type: 'LineTo', payload: { x, y } };
}

export function createCubicToCommand(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): RenderCommand {
  return { type: 'CubicTo', payload: { cp1x, cp1y, cp2x, cp2y, x, y } };
}

export function createClosePathCommand(): RenderCommand {
  return { type: 'ClosePath' };
}

export function createFillCommand(fillRule: string, color: any): RenderCommand {
  return { type: 'Fill', payload: { fillRule, color } };
}

export function createStrokeCommand(color: any, width: number): RenderCommand {
  return { type: 'Stroke', payload: { color, width } };
}

export function createDrawTextCommand(text: string, x: number, y: number, style: any): RenderCommand {
  return { type: 'DrawText', payload: { text, x, y, style } };
}

export function generateCommandsForNode(node: RenderNode): RenderCommand[] {
  const commands: RenderCommand[] = [];

  if (!node.visible) return commands;

  commands.push(createSaveCommand());
  commands.push(createSetTransformCommand(node.worldTransform));
  commands.push(createSetOpacityCommand(node.effectiveOpacity));

  if (node.geometry) {
    commands.push(createBeginPathCommand());

    const geom = node.geometry;

    if (geom.type === 'rect' && geom.params) {
      const { x, y, width, height, rx, ry } = geom.params;
      // Simple rect path
      if (rx || ry) {
        // Rounded rect - simplified as rect for MVP command generation
        commands.push(createMoveToCommand(x + (rx || 0), y));
        commands.push(createLineToCommand(x + width - (rx || 0), y));
        commands.push(createLineToCommand(x + width, y + height));
        commands.push(createLineToCommand(x, y + height));
        commands.push(createClosePathCommand());
      } else {
        commands.push(createMoveToCommand(x, y));
        commands.push(createLineToCommand(x + width, y));
        commands.push(createLineToCommand(x + width, y + height));
        commands.push(createLineToCommand(x, y + height));
        commands.push(createClosePathCommand());
      }
    } else if (geom.type === 'ellipse' && geom.params) {
      const { cx, cy, rx, ry } = geom.params;
      // Approximate ellipse with bezier - for commands we emit a marker
      commands.push(createMoveToCommand(cx + rx, cy));
      // In real backend, ellipse would be drawn via ellipse command, here we approximate
      commands.push({ type: 'DrawText', payload: { text: `ellipse ${cx},${cy} rx=${rx} ry=${ry}`, x: cx, y: cy, style: {} } } as any);
    } else if (geom.type === 'path' && geom.pathData) {
      const path = geom.pathData;
      for (const contour of path.contours || []) {
        if (contour.anchors && contour.anchors.length > 0) {
          const first = contour.anchors[0];
          commands.push(createMoveToCommand(first.position.x, first.position.y));
          for (let i = 1; i < contour.anchors.length; i++) {
            const anchor = contour.anchors[i];
            const prev = contour.anchors[i - 1];
            // Check if bezier
            if (prev.handleOut && anchor.handleIn && (prev.handleOut.x !== 0 || prev.handleOut.y !== 0 || anchor.handleIn.x !== 0 || anchor.handleIn.y !== 0)) {
              commands.push(createCubicToCommand(
                prev.position.x + prev.handleOut.x,
                prev.position.y + prev.handleOut.y,
                anchor.position.x + anchor.handleIn.x,
                anchor.position.y + anchor.handleIn.y,
                anchor.position.x,
                anchor.position.y
              ));
            } else {
              commands.push(createLineToCommand(anchor.position.x, anchor.position.y));
            }
          }
          if (contour.closed) commands.push(createClosePathCommand());
        }
      }
    } else if (geom.type === 'line' && geom.params) {
      const { start, end } = geom.params;
      if (start && end) {
        commands.push(createMoveToCommand(start.x, start.y));
        commands.push(createLineToCommand(end.x, end.y));
      }
    } else if (geom.type === 'text' && geom.params) {
      const { x, y, content, fontSize, fontFamily } = geom.params;
      commands.push(createDrawTextCommand(content || '', x || 0, y || 0, { fontSize, fontFamily }));
    }
  }

  // Fill and stroke
  if (node.appearance) {
    for (const fill of node.appearance.fills) {
      commands.push(createFillCommand('nonZero', fill.color));
    }
    for (const stroke of node.appearance.strokes) {
      if (stroke.width > 0) {
        commands.push(createStrokeCommand(stroke.color, stroke.width));
      }
    }
  }

  commands.push(createRestoreCommand());

  // Children commands will be generated by traversing children after this node

  return commands;
}

export function generateCommandsForTree(nodes: RenderNode[]): RenderCommand[] {
  const allCommands: RenderCommand[] = [];

  function traverse(nodeList: RenderNode[]) {
    for (const node of nodeList) {
      if (!node.visible) continue;
      const cmds = generateCommandsForNode(node);
      allCommands.push(...cmds);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);

  return allCommands;
}
