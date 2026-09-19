
import { ConstraintID, ObjectID } from '../ids/index.js';
import { Vec2 } from '../math/vec2.js';
import { BBox } from '../math/bbox.js';
import { Matrix3x3 } from '../math/matrix3x3.js';

export type ConstraintType =
  | 'horizontal'
  | 'vertical'
  | 'alignLeft'
  | 'alignRight'
  | 'alignTop'
  | 'alignBottom'
  | 'alignCenterX'
  | 'alignCenterY'
  | 'equalWidth'
  | 'equalHeight'
  | 'fixedDistance';

export type ConstraintStrength = 'required' | 'strong' | 'weak';
export type ConstraintSource = 'user' | 'ai';

export interface Constraint {
  readonly id: ConstraintID;
  readonly type: ConstraintType;
  readonly objectIds: ObjectID[];
  readonly parameters?: {
    readonly distance?: number;
    readonly tolerance?: number;
  };
  readonly enabled: boolean;
  readonly strength: ConstraintStrength;
  readonly source: ConstraintSource;
  readonly createdAt: number;
}

export interface ConstraintViolation {
  readonly constraintId: ConstraintID;
  readonly type: ConstraintType;
  readonly objectIds: ObjectID[];
  readonly error: number;
  readonly tolerance: number;
}

export interface ConstraintCorrection {
  readonly objectId: ObjectID;
  readonly translation: Vec2;
  readonly reason: ConstraintID;
}

export interface ConstraintSolveContext {
  readonly objectIds: ObjectID[];
  getWorldBBox(objectId: ObjectID): BBox | null;
  getWorldTransform(objectId: ObjectID): Matrix3x3 | null;
  getLocalTransform?(objectId: ObjectID): Matrix3x3 | null;
  getParentWorldTransform?(objectId: ObjectID): Matrix3x3 | null;
  readonly tolerance: number;
}

export interface ConstraintSolveResult {
  readonly status: 'satisfied' | 'corrected' | 'unsatisfiable';
  readonly corrections: ConstraintCorrection[];
  readonly violations: ConstraintViolation[];
  readonly iterations: number;
}

export interface ConstraintProposal {
  readonly type: ConstraintType;
  readonly objectIds: ObjectID[];
  readonly parameters?: { distance?: number };
  readonly confidence: number;
}
