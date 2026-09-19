
import { RenderTree, RenderNode } from './types.js';

export class RenderTreeImpl implements RenderTree {
  public version: number;
  public artboardId: string | null;
  public nodes: RenderNode[];
  public nodeMap: Map<string, RenderNode>;

  constructor(version: number, artboardId: string | null, nodes: RenderNode[]) {
    this.version = version;
    this.artboardId = artboardId;
    this.nodes = nodes;
    this.nodeMap = new Map();
    this.buildMap(nodes);
  }

  private buildMap(nodes: RenderNode[]): void {
    for (const node of nodes) {
      this.nodeMap.set(node.nodeId as string, node);
      if (node.children) {
        this.buildMap(node.children);
      }
    }
  }

  getNode(nodeId: string): RenderNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  getAllNodes(): RenderNode[] {
    return Array.from(this.nodeMap.values());
  }
}
