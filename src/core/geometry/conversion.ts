
import { ParametricGeometry, PathGeometry, Contour, Anchor } from './types.js';
import { vec2, Vec2 } from '../math/vec2.js';
import { ellipseToPathAnchors } from './ellipse.js';
import { generateStarVertices } from './star.js';
import { createContour } from './contour.js';
import { createPathGeometry } from './path.js';

let anchorIdCounter = 0;
function nextAnchorId(): string {
  anchorIdCounter++;
  return `anchor_${anchorIdCounter}`;
}
function resetCounterForDeterminism(seed: number = 0) {
  anchorIdCounter = seed;
}

function createCornerAnchor(pos: Vec2): Anchor {
  return { id: nextAnchorId(), position: pos, handleIn: vec2(0,0), handleOut: vec2(0,0), type: 'corner' };
}
function createSmoothAnchor(pos: Vec2, handleIn: Vec2, handleOut: Vec2): Anchor {
  return { id: nextAnchorId(), position: pos, handleIn, handleOut, type: 'smooth' };
}

export function parametricToDerived(geom: ParametricGeometry, deterministicSeed: number = 0): PathGeometry {
  resetCounterForDeterminism(deterministicSeed);
  switch (geom.type) {
    case 'rect': {
      const { x, y, width, height, rx, ry } = geom.params;
      if (rx < 1e-9 && ry < 1e-9) {
        // sharp rectangle: 4 corners
        const anchors = [
          createCornerAnchor(vec2(x, y)),
          createCornerAnchor(vec2(x+width, y)),
          createCornerAnchor(vec2(x+width, y+height)),
          createCornerAnchor(vec2(x, y+height))
        ];
        const contour = createContour(anchors, true, `contour_rect_${deterministicSeed}`, 'cw');
        return createPathGeometry([contour], 'nonZero');
      } else {
        // rounded rectangle - 4 corners with bezier
        // Using kappa for rounded corners
        const kappa = 0.5522847498;
        // For each corner, we need 2 anchors? Actually rounded rect can be 4 anchors with handles
        // Simplified: create 8 anchors? But for determinism and simplicity, we create 4 anchors with handles representing rounded corners
        // Standard: rounded rect with rx,ry: each corner is quarter ellipse
        // We'll create 8 points: top-left start, then corner curve
        // For simplicity MVP: 4 anchors with smooth handles: each corner's handles length = rx*kappa, ry*kappa
        // Let's create contour with 4 anchors but with handles:
        // Top-left (x+rx, y) with out (-rx*k?) Actually need to think
        // Instead create 4 anchors at (x+rx, y), (x+width - rx, y), (x+width, y+ry), (x+width, y+height-ry), (x+width - rx, y+height), (x+rx, y+height), (x, y+height-ry), (x, y+ry) - 8 anchors
        const anchors: Anchor[] = [];
        // top edge start
        anchors.push(createCornerAnchor(vec2(x+rx, y)));
        anchors.push(createCornerAnchor(vec2(x+width - rx, y)));
        // top-right corner curve control via handles on adjacent anchors
        // For simplicity, we make top-right corner as smooth anchor at (x+width, y+ry)?? Actually need more accurate.
        // MVP simplification: use 4 corners with handles: top-left anchor at (x+rx, y) etc? Let's implement 8-anchor version with corner handles
        // Top-right corner: anchor at (x+width, y+ry)?? No.
        // Let's implement proper 8-anchor rounded rect:
        // We'll rebuild anchors list properly
        const rAnchors: Anchor[] = [];
        // 0: top edge left (x+rx, y)
        rAnchors.push({ id: nextAnchorId(), position: vec2(x+rx, y), handleIn: vec2(-rx*kappa,0), handleOut: vec2(rx*kappa,0), type: 'corner' });
        // Actually top edge is line, so handles 0 for top edge anchors
        // Let's do step by step 8 anchors:
        // We'll use approach: each straight edge anchor has 0 handles, each corner anchor has handles
        // 8 anchors:
        // 0: (x+rx, y) - corner start top
        // 1: (x+width - rx, y) - top edge end
        // 2: (x+width, y+ry) - right edge start after top-right corner
        // 3: (x+width, y+height - ry)
        // 4: (x+width - rx, y+height)
        // 5: (x+rx, y+height)
        // 6: (x, y+height - ry)
        // 7: (x, y+ry)
        // And corner curves between 1-2, 3-4, 5-6, 7-0 via handles
        // For corner between 1 and 2: 1's out = (rx*kappa,0), 2's in = (0, -ry*kappa) for top-right
        // Let's build:
        const a0 = { id: nextAnchorId(), position: vec2(x+rx, y), handleIn: vec2(0,0), handleOut: vec2(0,0), type: 'corner' as const };
        const a1 = { id: nextAnchorId(), position: vec2(x+width - rx, y), handleIn: vec2(0,0), handleOut: vec2(rx*kappa,0), type: 'smooth' as const };
        const a2 = { id: nextAnchorId(), position: vec2(x+width, y+ry), handleIn: vec2(0, -ry*kappa), handleOut: vec2(0,0), type: 'smooth' as const };
        const a3 = { id: nextAnchorId(), position: vec2(x+width, y+height - ry), handleIn: vec2(0,0), handleOut: vec2(0, ry*kappa), type: 'smooth' as const };
        const a4 = { id: nextAnchorId(), position: vec2(x+width - rx, y+height), handleIn: vec2(rx*kappa,0), handleOut: vec2(0,0), type: 'smooth' as const };
        const a5 = { id: nextAnchorId(), position: vec2(x+rx, y+height), handleIn: vec2(0,0), handleOut: vec2(-rx*kappa,0), type: 'smooth' as const };
        const a6 = { id: nextAnchorId(), position: vec2(x, y+height - ry), handleIn: vec2(0, ry*kappa), handleOut: vec2(0,0), type: 'smooth' as const };
        const a7 = { id: nextAnchorId(), position: vec2(x, y+ry), handleIn: vec2(0,0), handleOut: vec2(0, -ry*kappa), type: 'smooth' as const };
        // Fix: need handleOut for a1 to go to a2, and handleIn for a2 from a1
        // a1 out should be (rx*kappa,0)?? Actually for top-right corner, curve from (x+width - rx, y) to (x+width, y+ry)
        // a1 out = (rx*k, 0) would go outward beyond? Let's use correct: a1 out = (rx*k,0) is to the right? Actually from a1 to a2, control points: a1 + (rx*k,0) and a2 + (0, -ry*k)
        // a1 at (x+W -rx, y), out (rx*k,0) => control at (x+W -rx + rx*k, y)
        // a2 at (x+W, y+ry), in (0, -ry*k) => control at (x+W, y+ry - ry*k)
        // That's correct for quarter ellipse
        // Similarly other corners
        const contour = createContour([a0,a1,a2,a3,a4,a5,a6,a7], true, `contour_rect_r_${deterministicSeed}`, 'cw');
        return createPathGeometry([contour], 'nonZero');
      }
    }
    case 'ellipse': {
      const anchorsInfo = ellipseToPathAnchors(geom.params);
      const anchors: Anchor[] = anchorsInfo.map(info => ({
        id: nextAnchorId(),
        position: info.position,
        handleIn: info.handleIn,
        handleOut: info.handleOut,
        type: info.type
      }));
      const contour = createContour(anchors, true, `contour_ellipse_${deterministicSeed}`, 'cw');
      return createPathGeometry([contour], 'nonZero');
    }
    case 'polygon': {
      const anchors = geom.params.points.map(p => createCornerAnchor(p));
      const contour = createContour(anchors, true, `contour_poly_${deterministicSeed}`, 'cw');
      return createPathGeometry([contour], 'nonZero');
    }
    case 'star': {
      const verts = generateStarVertices(geom.params);
      const anchors = verts.map(v => createCornerAnchor(v));
      const contour = createContour(anchors, true, `contour_star_${deterministicSeed}`, 'cw');
      return createPathGeometry([contour], 'nonZero');
    }
    case 'line': {
      const a0 = createCornerAnchor(geom.params.start);
      const a1 = createCornerAnchor(geom.params.end);
      const contour = createContour([a0,a1], false, `contour_line_${deterministicSeed}`, 'unknown');
      return createPathGeometry([contour], 'nonZero');
    }
    default:
      throw new Error(`Unsupported parametric type`);
  }
}
