
import { ObjectID, GeometryID, AppearanceID } from '../ids/index.js';
import { Geometry } from '../geometry/types.js';
import { Appearance } from '../appearance/types.js';

export interface GraphicObjectMeta {
  name: string;
  locked: boolean;
  visible: boolean;
  selectable: boolean;
  createdBy?: 'user' | 'ai' | 'system';
}

export interface GraphicObject {
  readonly id: ObjectID;
  readonly geometryRef: GeometryID;
  readonly appearanceRef: AppearanceID;
  readonly meta: GraphicObjectMeta;
}

export type { Appearance, AppearanceItem, FillItem, StrokeItem, EffectItem } from '../appearance/types.js';
export type { SolidColor, FillData, StrokeData, EffectData, ResolvedAppearance } from '../appearance/types.js';

export interface Document {
  readonly id: string;
}
