
# Geometry Kernel - Phase 3.02

Purpose: Provide deterministic, pure, browser-independent vector geometry primitives.

Public API:
- Rect: createRect, normalize, rectBBox, isDegenerate
- Ellipse: createEllipse, ellipseBBox, ellipseArea, ellipseToPathAnchors (kappa=0.5522847498 approximation)
- Polygon: createPolygon, polygonArea, polygonSignedArea, polygonOrientation, polygonBBox
- Star: createStar, generateStarVertices (deterministic), starBBox
- Line: createLine, lineLength, lineMidpoint, lineBBox, isDegenerateLine
- Bezier: evaluateCubicBezier, cubicBezierDerivative, cubicBezierExtrema, cubicBezierBBox, evaluateQuadraticBezier, quadraticToCubic, quadraticBezierBBox
- Contour: createAnchor, createContour, signedAreaOfContour, computeOrientation, isDegenerateContour
- Path: createPathGeometry, pathBBox, pathExactBBox, isDegeneratePath
- BBox: contourExactBBox, pathExactBBox (exact via curve extrema, not just control points)
- Flatten: flattenPath with tolerance, deterministic, maxDepth 12, closed remains closed
- Validation: validatePathGeometry, checkDegenerate, fillRule validation
- Intersection: detectSelfIntersections (flatten-based), hasSelfIntersection
- Distance: distancePointToSegment, distancePointToBezier, pointOnSegment, pointInPolygon (nonZero/evenOdd)
- Conversion: parametricToDerived (deterministic, seed-based anchor IDs), rect rounded with 8 anchors, ellipse with 4 smooth anchors
- Detection: detectParametricShape (safe return null if not confident) - foundation for AI tool detect_shape_primitive
- Transform: transformAnchor, transformContour, transformPathGeometry, transformParametricGeometry - pure, no mutation, orientation flips if det<0

Invariants:
- handleIn/handleOut are relative vectors, not absolute
- Parametric remains parametric until explicit parametricToDerived
- Derived is cache, never replaces canonical
- Orientation: In Y-down, positive signed area = cw on screen (documented)
- FillRule separate from orientation: orientation is geometric (cw/ccw), fillRule is rendering semantics (nonZero/evenOdd)
- Tolerance: internal float64, equality 1e-9, degenerate <1e-10
- No UI, no Renderer, no SceneGraph, no filesystem dependencies
- Deterministic: same input => same output, anchor IDs deterministic via seed

Known Limitations:
- Boolean production engine is Phase 3.11, not here
- Star detection not yet implemented (returns null)
- Polygon orientation for self-intersecting polygons returns unknown if area < tolerance
