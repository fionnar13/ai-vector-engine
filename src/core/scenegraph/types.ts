
import { NodeID, ObjectID } from '../ids/index.js';
import { Matrix3x3 } from '../math/matrix3x3.js';

export type SceneNode = {
  readonly id: NodeID;
  readonly objectRef: ObjectID | null;
  readonly parent: NodeID | null;
  readonly children: readonly NodeID[];
  readonly localTransform: Matrix3x3;
};

// Mutable internal version for store
export type MutableSceneNode = {
  id: NodeID;
  objectRef: ObjectID | null;
  parent: NodeID | null;
  children: NodeID[];
  localTransform: Matrix3x3;
};
