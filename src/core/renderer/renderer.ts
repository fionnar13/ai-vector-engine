
import { RenderTreeBuilder } from './render-tree-builder.js';
import { RenderTree, RendererConfig, RenderResult, Viewport, Artboard, RenderCommand } from './types.js';
import { InvalidationTracker } from './invalidation.js';
import { EventBus } from '../events/index.js';
import { generateCommandsForTree } from './render-commands.js';
import { createDiagnostic } from './diagnostics.js';
import { RenderTreeImpl } from './render-tree.js';

export class Renderer {
  private builder: RenderTreeBuilder;
  private eventBus: EventBus | null = null;
  private invalidation: InvalidationTracker;
  private renderTree: RenderTree | null = null;
  private config: RendererConfig = {};
  private diagnostics: any[] = [];
  private unsubscribe: (() => void) | null = null;
  private stores: any;

  constructor(stores: any, eventBus?: EventBus) {
    this.stores = stores;
    this.builder = new RenderTreeBuilder(stores);
    this.invalidation = new InvalidationTracker();
    this.eventBus = eventBus || null;

    if (this.eventBus) {
      this.subscribeToEvents();
    }
  }

  private subscribeToEvents(): void {
    if (!this.eventBus) return;

    this.unsubscribe = this.eventBus.subscribe('TransactionCommitted', (event: any) => {
      // Determine affected nodes from event payload
      const diff = event.payload?.diff;
      if (diff) {
        // For MVP, if diff has many changes, invalidate all
        // Otherwise, we could invalidate specific nodes
        // For simplicity, we invalidate all on any transaction committed
        // A more optimized version would track specific nodeIds
        this.invalidateAll();
      } else {
        this.invalidateAll();
      }
    });
  }

  initialize(config: RendererConfig): void {
    this.config = config;
    this.invalidation.invalidateAll();
  }

  buildRenderTree(artboard?: Artboard | null): RenderTree {
    const { tree, diagnostics } = this.builder.build(artboard);
    this.renderTree = tree;
    this.diagnostics = diagnostics;
    this.invalidation.clear();
    return tree;
  }

  render(viewport?: Viewport): RenderResult {
    if (!this.renderTree || this.invalidation.needsFullRebuild()) {
      this.buildRenderTree();
    }

    if (!this.renderTree) {
      return {
        success: false,
        renderedNodeCount: 0,
        skippedNodeCount: 0,
        diagnostics: [createDiagnostic('RENDER_INVALID_GEOMETRY', 'No RenderTree', 'error')]
      };
    }

    // Viewport culling
    let nodesToRender = this.renderTree.nodes;
    let skipped = 0;
    let rendered = 0;

    // For MVP, we count visible nodes
    function countNodes(nodes: any[]): { rendered: number; skipped: number } {
      let r = 0;
      let s = 0;
      for (const node of nodes) {
        if (!node.visible) {
          s++;
          continue;
        }
        // Viewport culling would check BBox intersection here
        // For MVP, we render all visible
        r++;
        if (node.children) {
          const childCount = countNodes(node.children);
          r += childCount.rendered;
          s += childCount.skipped;
        }
      }
      return { rendered: r, skipped: s };
    }

    const counts = countNodes(nodesToRender);
    rendered = counts.rendered;
    skipped = counts.skipped;

    const commands = generateCommandsForTree(this.renderTree.nodes);

    return {
      success: true,
      renderedNodeCount: rendered,
      skippedNodeCount: skipped,
      diagnostics: this.diagnostics,
      commands
    };
  }

  invalidate(nodeIds: any[]): void {
    this.invalidation.invalidate(nodeIds);
  }

  invalidateAll(): void {
    this.invalidation.invalidateAll();
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.renderTree = null;
    this.invalidation.clear();
  }

  getRenderTree(): RenderTree | null {
    return this.renderTree;
  }

  getInvalidationTracker(): InvalidationTracker {
    return this.invalidation;
  }
}
