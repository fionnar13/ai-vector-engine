
import { createObjectID, createGeometryID, createAppearanceID, createNodeID, createCommandID, createTransactionID, ObjectID, GeometryID, AppearanceID, NodeID, CommandID, TransactionID } from '../ids/index.js';

export interface IDFactory {
  createObjectID(): ObjectID;
  createGeometryID(): GeometryID;
  createAppearanceID(): AppearanceID;
  createNodeID(): NodeID;
  createCommandID(): CommandID;
  createTransactionID(): TransactionID;
}

export function createIDFactory(): IDFactory {
  return {
    createObjectID: () => createObjectID(),
    createGeometryID: () => createGeometryID(),
    createAppearanceID: () => createAppearanceID(),
    createNodeID: () => createNodeID(),
    createCommandID: () => createCommandID(),
    createTransactionID: () => createTransactionID()
  };
}
