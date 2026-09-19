
/**
 * IDs - type-safe UUIDv4
 * Rule: stable, never reused
 */

export type Brand<K, T> = K & { __brand: T };

function uuidv4(): string {
  // RFC4122 v4, using crypto if available else Math.random fallback (still valid for MVP)
  // Node 19+ has crypto.randomUUID
  // @ts-ignore
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export type DocumentID = Brand<string, 'DocumentID'>;
export type ObjectID = Brand<string, 'ObjectID'>;
export type GeometryID = Brand<string, 'GeometryID'>;
export type AppearanceID = Brand<string, 'AppearanceID'>;
export type ConstraintID = Brand<string, 'ConstraintID'>;
export type NodeID = Brand<string, 'NodeID'>;
export type TransactionID = Brand<string, 'TransactionID'>;
export type CommandID = Brand<string, 'CommandID'>;
export type EventID = Brand<string, 'EventID'>;
export type IntentID = Brand<string, 'IntentID'>;
export type PlanID = Brand<string, 'PlanID'>;
export type AssetID = Brand<string, 'AssetID'>;

export function createDocumentID(): DocumentID { return uuidv4() as DocumentID; }
export function createObjectID(): ObjectID { return uuidv4() as ObjectID; }
export function createGeometryID(): GeometryID { return uuidv4() as GeometryID; }
export function createAppearanceID(): AppearanceID { return uuidv4() as AppearanceID; }
export function createConstraintID(): ConstraintID { return uuidv4() as ConstraintID; }
export function createNodeID(): NodeID { return uuidv4() as NodeID; }
export function createTransactionID(): TransactionID { return uuidv4() as TransactionID; }
export function createCommandID(): CommandID { return uuidv4() as CommandID; }
export function createEventID(): EventID { return uuidv4() as EventID; }
export function createIntentID(): IntentID { return uuidv4() as IntentID; }
export function createPlanID(): PlanID { return uuidv4() as PlanID; }
export function createAssetID(): AssetID { return uuidv4() as AssetID; }

export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function assertUUID(id: string, ctx?: string): void {
  if (!isUUID(id)) throw new Error(`Invalid UUID${ctx?' in '+ctx:''}: ${id}`);
}
