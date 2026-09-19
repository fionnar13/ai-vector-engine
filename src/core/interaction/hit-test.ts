
import { NodeID, ObjectID } from '../ids/index.js';
import { Vec2, Matrix3x3 } from '../math/types.js';
import { BBox } from '../geometry/types.js';
import { HitTestResult, HitTestResults, HitTestOptions, InteractionConfig } from './types.js';
import { ViewportTransform } from './viewport.js';

function invertMatrix(m: Matrix3x3): Matrix3x3 {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet
  };
}

function applyMatrix(m: Matrix3x3, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y + m.tx, y: m.b * v.x + m.d * v.y + m.ty };
}

function pointInRect(p: Vec2, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function pointInEllipse(p: Vec2, cx: number, cy: number, rx: number, ry: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - cx) / rx;
  const dy = (p.y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = (yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): { distance: number; closest: Vec2 } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-12) return { distance: Math.hypot(apx, apy), closest: a };
  let t = (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + abx * t, y: a.y + aby * t };
  return { distance: Math.hypot(p.x - closest.x, p.y - closest.y), closest };
}

function flattenPathForHitTest(geometry: any, tolerance = 0.5): Vec2[][] {
  // Very simplified flattening - reuse existing logic for MVP
  // For rect/ellipse/polygon/star/line we handle separately
  // For path, we approximate each contour as polyline of anchors
  const contours: Vec2[][] = [];
  for (const contour of geometry.contours || []) {
    const pts: Vec2[] = [];
    for (const anchor of contour.anchors || []) {
      pts.push(anchor.position);
    }
    if (pts.length > 0) contours.push(pts);
  }
  return contours;
}

function pointInPath(pathGeometry: any, point: Vec2, fillRule: string): boolean {
  const contours = flattenPathForHitTest(pathGeometry);
  if (contours.length === 0) return false;

  // For evenOdd, we need to count crossings for all contours
  // For nonZero, we need winding number
  // MVP: use evenOdd for all, but respect fillRule parameter for distinction
  let inside = false;
  let winding = 0;

  for (const poly of contours) {
    if (poly.length < 3) continue;
    // EvenOdd test
    let cInside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = (yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) cInside = !cInside;
    }

    if (fillRule === 'evenOdd') {
      if (cInside) inside = !inside;
    } else {
      // nonZero - winding
      // Simplified: use evenOdd for MVP but preserve distinction in API
      // For accurate nonZero, compute winding
      let w = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (yi <= point.y) {
          if (yj > point.y) {
            if ((xj - xi) * (point.y - yi) - (point.x - xi) * (yj - yi) > 0) w++;
          }
        } else {
          if (yj <= point.y) {
            if ((xj - xi) * (point.y - yi) - (point.x - xi) * (yj - yi) < 0) w--;
          }
        }
      }
      if (w !== 0) inside = true;
    }
  }

  return inside;
}

function distanceToPath(pathGeometry: any, point: Vec2): number {
  const contours = flattenPathForHitTest(pathGeometry);
  let minDist = Infinity;
  for (const poly of contours) {
    for (let i = 0; i < poly.length - 1; i++) {
      const d = distancePointToSegment(point, poly[i], poly[i + 1]).distance;
      if (d < minDist) minDist = d;
    }
    // Close contour
    if (poly.length > 2) {
      const d = distancePointToSegment(point, poly[poly.length - 1], poly[0]).distance;
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

export interface HitTestStores {
  objectStore: any;
  geometryStore: any;
  appearanceStore: any;
  sceneGraph: any;
  spatialIndex?: any;
}

export class HitTester {
  private stores: HitTestStores;
  private config: InteractionConfig;

  constructor(stores: HitTestStores, config: Partial<InteractionConfig> = {}) {
    this.stores = stores;
    this.config = {
      hitTolerance: config.hitTolerance ?? 5,
      dragThreshold: config.dragThreshold ?? 3,
      anchorHitTolerance: config.anchorHitTolerance ?? 8,
      handleHitTolerance: config.handleHitTolerance ?? 8,
      keyboardMoveStep: config.keyboardMoveStep ?? 1,
      keyboardMoveStepShift: config.keyboardMoveStepShift ?? 10,
      selectionMode: config.selectionMode ?? 'intersects',
      allowLockedSelection: config.allowLockedSelection ?? false,
      allowHiddenSelection: config.allowHiddenSelection ?? false,
      pivotMode: config.pivotMode ?? 'selectionCenter'
    };
  }

  hitTest(worldPoint: Vec2, options: HitTestOptions = {}): HitTestResults {
    const candidates = this.getCandidates(worldPoint);
    const hits: HitTestResult[] = [];

    // Z-order: traverse candidates in reverse SceneGraph order (topmost first)
    // We need to sort candidates by SceneGraph depth/order - for MVP, we use the order from getCandidates which is already deterministic
    // Then we reverse to get topmost first, but we must also respect parent-child ordering
    // For correct Z-order, we sort by depth and by SceneGraph children order

    const ordered = this.sortByZOrder(candidates);

    // Reverse for topmost first
    const topFirst = [...ordered].reverse();

    for (const nodeId of topFirst) {
      const result = this.testNode(nodeId, worldPoint, options);
      if (result && result.kind !== 'none') {
        hits.push(result);
      }
    }

    // Sort hits by distance (closest first) but preserve Z-order for overlapping at same distance?
    // For deterministic results, sort by Z-order first (topmost wins) then distance
    // Actually for hit testing we want topmost hit first, so we keep topFirst order
    // But we also want deterministic distance ordering for anchor/handle hits

    return { hits };
  }

  hitTestTopmost(worldPoint: Vec2, options: HitTestOptions = {}): HitTestResult | null {
    const results = this.hitTest(worldPoint, options);
    return results.hits.length > 0 ? results.hits[0] : null;
  }

  private getCandidates(worldPoint: Vec2): NodeID[] {
    // Try SpatialIndex first
    if (this.stores.spatialIndex) {
      try {
        const candidates = this.stores.spatialIndex.queryPoint(worldPoint, this.config.hitTolerance);
        if (candidates && candidates.length > 0) {
          return candidates;
        }
      } catch {
        // Fallback to SceneGraph traversal
      }
    }

    // Fallback: traverse SceneGraph for all nodes
    const allNodes = this.stores.sceneGraph.getAllNodes ? this.stores.sceneGraph.getAllNodes() : [];
    return allNodes.map((n: any) => n.id as NodeID);
  }

  private sortByZOrder(nodeIds: NodeID[]): NodeID[] {
    // For deterministic Z-order, we need to sort by SceneGraph order
    // We can build a map of nodeId -> order index via DFS traversal of SceneGraph
    const orderMap = new Map<string, number>();
    let index = 0;

    const visit = (node: any) => {
      orderMap.set(node.id, index++);
      for (const childId of node.children || []) {
        const child = this.stores.sceneGraph.findNode(childId);
        if (child) visit(child);
      }
    };

    const roots = this.stores.sceneGraph.getRoots ? this.stores.sceneGraph.getRoots() : [];
    for (const root of roots) {
      visit(root);
    }

    // Sort by orderMap index (ascending = back to front, so lower index is behind)
    return [...nodeIds].sort((a, b) => {
      const oa = orderMap.get(a as string) ?? 0;
      const ob = orderMap.get(b as string) ?? 0;
      return oa - ob;
    });
  }

  private testNode(nodeId: NodeID, worldPoint: Vec2, options: HitTestOptions): HitTestResult | null {
    const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
    if (!sceneNode) return null;

    const objectId = sceneNode.objectRef as ObjectID | null;

    // Hidden check
    if (objectId) {
      const obj = this.stores.objectStore.get(objectId);
      if (!obj) return null;
      if (obj.meta?.visible === false && !options.includeHidden && !this.config.allowHiddenSelection) {
        return null;
      }
      if (obj.meta?.locked === true && !options.includeLocked && !this.config.allowLockedSelection) {
        // For MVP, locked objects cannot be selected - return null or locked diagnostic
        // According to spec, return either no hit or locked hit diagnostic - we return null for no selectable hit
        return null;
      }
    } else {
      // Group node - no geometry, not directly hittable unless we have special group hit test
      // For MVP, groups are not hittable themselves, only their children
      return null;
    }

    // Get world transform
    const worldTransform = this.stores.sceneGraph.getWorldTransform
      ? this.stores.sceneGraph.getWorldTransform(nodeId as string)
      : sceneNode.localTransform;

    const invWorld = invertMatrix(worldTransform);
    const localPoint = applyMatrix(invWorld, worldPoint);

    const obj = this.stores.objectStore.get(objectId);
    const geometry = this.stores.geometryStore.get(obj.geometryRef);
    const appearance = this.stores.appearanceStore.get(obj.appearanceRef);

    if (!geometry) return null;

    // Check anchor/handle first if PathGeometry
    if (geometry.type === 'path' && geometry.contours) {
      const anchorHit = this.hitTestAnchors(geometry, localPoint, worldPoint, nodeId, objectId);
      if (anchorHit) return anchorHit;
    }

    // Fill hit test
    const fillResult = this.testFill(geometry, localPoint, worldPoint, nodeId, objectId);
    if (fillResult) return fillResult;

    // Stroke hit test
    const strokeResult = this.testStroke(geometry, appearance, localPoint, worldPoint, nodeId, objectId);
    if (strokeResult) return strokeResult;

    return null;
  }

  private hitTestAnchors(
    geometry: any,
    localPoint: Vec2,
    worldPoint: Vec2,
    nodeId: NodeID,
    objectId: ObjectID | null
  ): HitTestResult | null {
    const tolerance = this.config.anchorHitTolerance;
    let closest: { index: number; kind: 'position' | 'in' | 'out'; distance: number } | null = null;

    for (let ci = 0; ci < geometry.contours.length; ci++) {
      const contour = geometry.contours[ci];
      for (let ai = 0; ai < contour.anchors.length; ai++) {
        const anchor = contour.anchors[ai];
        const pos = anchor.position;
        const dist = Math.hypot(localPoint.x - pos.x, localPoint.y - pos.y);
        if (dist <= tolerance) {
          if (!closest || dist < closest.distance) {
            closest = { index: ai, kind: 'position', distance: dist };
          }
        }

        // Handles
        if (anchor.handleIn) {
          const handleInPos = { x: pos.x + anchor.handleIn.x, y: pos.y + anchor.handleIn.y };
          const distIn = Math.hypot(localPoint.x - handleInPos.x, localPoint.y - handleInPos.y);
          if (distIn <= tolerance) {
            if (!closest || distIn < closest.distance) {
              closest = { index: ai, kind: 'in', distance: distIn };
            }
          }
        }
        if (anchor.handleOut) {
          const handleOutPos = { x: pos.x + anchor.handleOut.x, y: pos.y + anchor.handleOut.y };
          const distOut = Math.hypot(localPoint.x - handleOutPos.x, localPoint.y - handleOutPos.y);
          if (distOut <= tolerance) {
            if (!closest || distOut < closest.distance) {
              closest = { index: ai, kind: 'out', distance: distOut };
            }
          }
        }
      }
    }

    if (closest) {
      return {
        nodeId,
        objectId,
        kind: closest.kind === 'position' ? 'anchor' : 'handle',
        distance: closest.distance,
        worldPoint,
        localPoint,
        anchorIndex: closest.index,
        handleKind: closest.kind === 'position' ? undefined : closest.kind
      };
    }

    return null;
  }

  private testFill(
    geometry: any,
    localPoint: Vec2,
    worldPoint: Vec2,
    nodeId: NodeID,
    objectId: ObjectID | null
  ): HitTestResult | null {
    let inside = false;
    let distance = 0;

    switch (geometry.type) {
      case 'rect': {
        const { x, y, width, height } = geometry.params;
        inside = pointInRect(localPoint, { x, y, width, height });
        if (inside) {
          distance = 0;
        }
        break;
      }
      case 'ellipse': {
        const { cx, cy, rx, ry } = geometry.params;
        inside = pointInEllipse(localPoint, cx, cy, rx, ry);
        if (inside) distance = 0;
        break;
      }
      case 'polygon': {
        const points = geometry.params.points || [];
        inside = pointInPolygon(localPoint, points);
        if (inside) distance = 0;
        break;
      }
      case 'star': {
        // For star, generate vertices and test point in polygon
        // Simplified: use outer points
        const params = geometry.params;
        // Generate star vertices - simplified
        const vertices: Vec2[] = [];
        const count = params.points * 2;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count - Math.PI / 2 + ((params.rotationDegrees || 0) * Math.PI) / 180;
          const radius = i % 2 === 0 ? params.outerRadius : params.innerRadius;
          vertices.push({
            x: params.center.x + Math.cos(angle) * radius,
            y: params.center.y + Math.sin(angle) * radius
          });
        }
        inside = pointInPolygon(localPoint, vertices);
        if (inside) distance = 0;
        break;
      }
      case 'line': {
        // Line has no fill
        inside = false;
        break;
      }
      case 'path': {
        const fillRule = geometry.fillRule || 'nonZero';
        inside = pointInPath(geometry, localPoint, fillRule);
        if (inside) distance = 0;
        break;
      }
      default: {
        if (geometry.contours) {
          inside = pointInPath(geometry, localPoint, geometry.fillRule || 'nonZero');
          if (inside) distance = 0;
        }
        break;
      }
    }

    if (inside) {
      return {
        nodeId,
        objectId,
        kind: 'fill',
        distance,
        worldPoint,
        localPoint
      };
    }

    return null;
  }

  private testStroke(
    geometry: any,
    appearance: any,
    localPoint: Vec2,
    worldPoint: Vec2,
    nodeId: NodeID,
    objectId: ObjectID | null
  ): HitTestResult | null {
    if (!appearance || !appearance.stack) return null;

    // Find stroke width
    let strokeWidth = 0;
    for (const item of appearance.stack) {
      if (item.type === 'stroke' && item.enabled) {
        strokeWidth = Math.max(strokeWidth, item.data?.width || 1);
      }
    }

    if (strokeWidth <= 0) return null;

    const tolerance = this.config.hitTolerance;
    const hitThreshold = strokeWidth / 2 + tolerance;

    let distance = Infinity;

    switch (geometry.type) {
      case 'rect': {
        const { x, y, width, height } = geometry.params;
        // Distance to rect border
        const distLeft = Math.abs(localPoint.x - x);
        const distRight = Math.abs(localPoint.x - (x + width));
        const distTop = Math.abs(localPoint.y - y);
        const distBottom = Math.abs(localPoint.y - (y + height));
        // Check if near border
        const nearHorizontal = localPoint.x >= x && localPoint.x <= x + width && (distTop <= hitThreshold || distBottom <= hitThreshold);
        const nearVertical = localPoint.y >= y && localPoint.y <= y + height && (distLeft <= hitThreshold || distRight <= hitThreshold);
        if (nearHorizontal || nearVertical) {
          distance = Math.min(distLeft, distRight, distTop, distBottom);
        }
        break;
      }
      case 'ellipse': {
        const { cx, cy, rx, ry } = geometry.params;
        if (rx <= 0 || ry <= 0) break;
        // Approximate distance to ellipse border
        const dx = (localPoint.x - cx) / rx;
        const dy = (localPoint.y - cy) / ry;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        // Distance to border in normalized space * average radius
        const avgR = (rx + ry) / 2;
        distance = Math.abs(distFromCenter - 1) * avgR;
        break;
      }
      case 'line': {
        const { start, end } = geometry.params;
        if (start && end) {
          distance = distancePointToSegment(localPoint, start, end).distance;
        }
        break;
      }
      case 'polygon': {
        const points = geometry.params.points || [];
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          const d = distancePointToSegment(localPoint, a, b).distance;
          if (d < minDist) minDist = d;
        }
        distance = minDist;
        break;
      }
      case 'path': {
        distance = distanceToPath(geometry, localPoint);
        break;
      }
      default: {
        if (geometry.contours) {
          distance = distanceToPath(geometry, localPoint);
        }
        break;
      }
    }

    if (distance <= hitThreshold) {
      return {
        nodeId,
        objectId,
        kind: 'stroke',
        distance,
        worldPoint,
        localPoint
      };
    }

    return null;
  }

  // For marquee selection - test if node BBox intersects marquee
  testBBoxIntersection(bbox: BBox, marquee: BBox, mode: 'intersects' | 'contained'): boolean {
    if (mode === 'contained') {
      return bbox.minX >= marquee.minX && bbox.maxX <= marquee.maxX && bbox.minY >= marquee.minY && bbox.maxY <= marquee.maxY;
    } else {
      // intersects
      return !(bbox.maxX < marquee.minX || bbox.minX > marquee.maxX || bbox.maxY < marquee.minY || bbox.minY > marquee.maxY);
    }
  }
}
