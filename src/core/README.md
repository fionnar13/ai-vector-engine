
# Foundation Core

Purpose: Provide zero-dependency primitives for entire engine.

Public API:
- Vec2: add, subtract, multiply, dot, cross, length, normalize
- Matrix3x3: identity, translation, scale, rotationDegrees, multiply, inverse, transformPoint
- BBox: create, union, intersects, transform
- IDs: type-safe UUIDv4 branded
- Errors: structured AppError with code, severity, recovery
- EventBus: publish/subscribe deterministic

Invariants:
- No NaN/Infinity in geometry
- Matrix determinant checked for singularity
- IDs never reused
- Events ordered deterministically
