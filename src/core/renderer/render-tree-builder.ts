
import { RenderNode, RenderTree, Artboard } from './types.js';
import { Matrix3x3 } from '../math/types.js';
import { RenderTreeImpl } from './render-tree.js';
import { resolveRenderGeometry } from './render-geometry.js';
import { resolveRenderAppearance } from './render-appearance.js';
import { createDiagnostic, DiagnosticCodes } from './diagnostics.js';
import { RenderDiagnostic } from './types.js';

function identityMatrix(): Matrix3x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function multiplyMatrix(parent: Matrix3x3, child: Matrix3x3): Matrix3x3 {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export interface BuilderStores {
  objectStore: any;
  geometryStore: any;
  appearanceStore: any;
  sceneGraph: any;
}

export class RenderTreeBuilder {
  private stores: BuilderStores;
  private version: number = 0;

  constructor(stores: BuilderStores) {
    this.stores = stores;
  }

  build(artboard?: Artboard | null): { tree: RenderTree; diagnostics: RenderDiagnostic[] } {
    this.version++;
    const diagnostics: RenderDiagnostic[] = [];

    const rootNodes = this.getRootNodes();

    const renderNodes: RenderNode[] = [];

    for (const root of rootNodes) {
      const node = this.buildNodeRecursive(root, identityMatrix(), 1, 0, diagnostics);
      if (node) renderNodes.push(node);
    }

    const tree = new RenderTreeImpl(this.version, artboard?.id || null, renderNodes);

    return { tree, diagnostics };
  }

  private getRootNodes(): any[] {
    const sceneGraph = this.stores.sceneGraph;
    if (sceneGraph.getRoots) {
      return sceneGraph.getRoots();
    }
    if (sceneGraph.getAllNodes) {
      const all = sceneGraph.getAllNodes();
      return all.filter((n: any) => !n.parent);
    }
    if (sceneGraph.roots) {
      return Array.from(sceneGraph.roots.values());
    }
    // Fallback
    return [];
  }

  private buildNodeRecursive(
    sceneNode: any,
    parentWorld: Matrix3x3,
    parentOpacity: number,
    depth: number,
    diagnostics: RenderDiagnostic[]
  ): RenderNode | null {
    const localTransform = sceneNode.localTransform || identityMatrix();
    const worldTransform = multiplyMatrix(parentWorld, localTransform);

    const objectId = sceneNode.objectRef || null;
    let geometry = null;
    let appearance = null;
    let visible = true;
    let locked = false;
    let opacity = 1;

    if (objectId) {
      const obj = this.stores.objectStore.get(objectId);
      if (!obj) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_OBJECT, `Object not found: ${objectId}`, 'warning', sceneNode.id));
        visible = false;
      } else {
        visible = obj.meta?.visible !== false;
        locked = obj.meta?.locked === true;
        opacity = obj.meta?.opacity ?? 1;

        const geomId = obj.geometryRef;
        const geom = this.stores.geometryStore.get(geomId);
        if (!geom) {
          diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_GEOMETRY, `Geometry not found: ${geomId}`, 'warning', sceneNode.id));
        } else {
          geometry = resolveRenderGeometry(geom);
        }

        const appId = obj.appearanceRef;
        const app = this.stores.appearanceStore.get(appId);
        if (!app) {
          diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_APPEARANCE, `Appearance not found: ${appId}`, 'warning', sceneNode.id));
          appearance = { fills: [], strokes: [], opacity: 1 };
        } else {
          appearance = resolveRenderAppearance(app, diagnostics);
        }
      }
    } else {
      // Group node - no geometry, no appearance, but may have children
      visible = true;
    }

    // Effective opacity = parentOpacity * localOpacity
    const localOpacity = appearance?.opacity ?? opacity;
    let effectiveOpacity = parentOpacity * localOpacity;
    effectiveOpacity = Math.max(0, Math.min(1, effectiveOpacity));

    // If parent invisible, children also invisible (but we still build for structure, visible false will skip rendering)
    // For MVP, if sceneNode itself has visible flag
    if (sceneNode.visible === false) visible = false;

    const children: RenderNode[] = [];

    // Children in SceneGraph.children order is authoritative for Z-order
    const childIds = sceneNode.children || [];
    for (const childId of childIds) {
      const childNode = this.stores.sceneGraph.findNode(childId);
      if (!childNode) {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_OBJECT, `Child node not found: ${childId}`, 'warning', sceneNode.id));
        continue;
      }
      const childRenderNode = this.buildNodeRecursive(childNode, worldTransform, effectiveOpacity, depth + 1, diagnostics);
      if (childRenderNode) {
        // If parent not visible, child effective visible should also be false
        if (!visible) {
          // Override child visible
          (childRenderNode as any).visible = false;
        }
        children.push(childRenderNode);
      }
    }

    const renderNode: RenderNode = {
      nodeId: sceneNode.id,
      objectId,
      type: objectId ? 'object' : 'group',
      worldTransform: deepClone(worldTransform),
      localTransform: deepClone(localTransform),
      geometry,
      appearance,
      visible,
      locked,
      opacity,
      effectiveOpacity,
      children,
      depth
    };

    return renderNode;
  }
}
