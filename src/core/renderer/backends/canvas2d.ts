
// Canvas2DAdapter - Browser-specific layer
// This file is the ONLY place where window/document/CanvasRenderingContext2D may appear

import { RenderCommand, RenderTree, RenderResult } from '../types.js';
import { createDiagnostic } from '../diagnostics.js';

export interface Canvas2DAdapter {
  getContext(): CanvasRenderingContext2D | null;
  clear(): void;
  resize(width: number, height: number): void;
}

export class BrowserCanvasAdapter implements Canvas2DAdapter {
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  getContext(): CanvasRenderingContext2D | null {
    return this.canvas.getContext('2d');
  }

  clear(): void {
    const ctx = this.getContext();
    if (ctx) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }
}

export class Canvas2DRenderer {
  private adapter: Canvas2DAdapter;

  constructor(adapter: Canvas2DAdapter) {
    this.adapter = adapter;
  }

  renderCommands(commands: RenderCommand[]): RenderResult {
    const ctx = this.adapter.getContext();
    if (!ctx) {
      return {
        success: false,
        renderedNodeCount: 0,
        skippedNodeCount: 0,
        diagnostics: [createDiagnostic('RENDER_CANVAS_FAILURE', 'Failed to get 2D context', 'error')]
      };
    }

    let renderedCount = 0;

    try {
      for (const cmd of commands) {
        switch (cmd.type) {
          case 'Save':
            ctx.save();
            break;
          case 'Restore':
            ctx.restore();
            break;
          case 'SetTransform': {
            const m = cmd.payload.matrix;
            ctx.setTransform(m.a, m.b, m.c, m.d, m.tx, m.ty);
            break;
          }
          case 'SetOpacity': {
            ctx.globalAlpha = cmd.payload.opacity;
            break;
          }
          case 'BeginPath':
            ctx.beginPath();
            break;
          case 'MoveTo':
            ctx.moveTo(cmd.payload.x, cmd.payload.y);
            break;
          case 'LineTo':
            ctx.lineTo(cmd.payload.x, cmd.payload.y);
            break;
          case 'CubicTo':
            ctx.bezierCurveTo(cmd.payload.cp1x, cmd.payload.cp1y, cmd.payload.cp2x, cmd.payload.cp2y, cmd.payload.x, cmd.payload.y);
            break;
          case 'ClosePath':
            ctx.closePath();
            break;
          case 'Fill': {
            const color = cmd.payload.color;
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            // @ts-ignore - fillRule support
            ctx.fill(cmd.payload.fillRule === 'evenOdd' ? 'evenodd' : 'nonzero');
            renderedCount++;
            break;
          }
          case 'Stroke': {
            const color = cmd.payload.color;
            ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            ctx.lineWidth = cmd.payload.width;
            ctx.stroke();
            renderedCount++;
            break;
          }
          case 'DrawText': {
            const { text, x, y, style } = cmd.payload;
            ctx.font = `${style.fontStyle || ''} ${style.fontWeight || ''} ${style.fontSize || 16}px ${style.fontFamily || 'system-ui'}`.trim();
            ctx.fillText(text, x, y);
            renderedCount++;
            break;
          }
          default:
            break;
        }
      }

      return {
        success: true,
        renderedNodeCount: renderedCount,
        skippedNodeCount: 0,
        diagnostics: []
      };
    } catch (e: any) {
      return {
        success: false,
        renderedNodeCount: 0,
        skippedNodeCount: 0,
        diagnostics: [createDiagnostic('RENDER_CANVAS_FAILURE', `Canvas render failed: ${e.message}`, 'error')]
      };
    }
  }
}
