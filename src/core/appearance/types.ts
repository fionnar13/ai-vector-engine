
import { AppearanceID } from '../ids/index.js';

export type AppearanceItemID = string; // branded UUID pattern, validated via isUUID or string ID

export type SolidColor = {
  readonly r: number; // 0-255
  readonly g: number; // 0-255
  readonly b: number; // 0-255
  readonly a: number; // 0-1
};

export type FillData = {
  readonly kind: 'solid';
  readonly color: SolidColor;
  readonly opacity: number; // 0-1 canonical location for fill opacity
};

export type StrokeData = {
  readonly color: SolidColor;
  readonly width: number; // >=0
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number; // >0
  readonly alignment: 'center'; // MVP only center
  readonly opacity: number; // 0-1
};

export type EffectData = {
  readonly effectType: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
};

export type AppearanceItemType = 'fill' | 'stroke' | 'effect';

export interface BaseAppearanceItem {
  readonly id: AppearanceItemID;
  readonly type: AppearanceItemType;
  readonly enabled: boolean;
  readonly inputs?: readonly AppearanceItemID[]; // for effect only, must reference BEFORE
}

export interface FillItem extends BaseAppearanceItem {
  readonly type: 'fill';
  readonly data: FillData;
  readonly inputs?: undefined;
}

export interface StrokeItem extends BaseAppearanceItem {
  readonly type: 'stroke';
  readonly data: StrokeData;
  readonly inputs?: undefined;
}

export interface EffectItem extends BaseAppearanceItem {
  readonly type: 'effect';
  readonly data: EffectData;
  readonly inputs: readonly AppearanceItemID[];
}

export type AppearanceItem = FillItem | StrokeItem | EffectItem;

export interface Appearance {
  readonly id: AppearanceID;
  readonly stack: readonly AppearanceItem[];
}

// Resolved representation for future Renderer
export interface ResolvedFill {
  readonly id: AppearanceItemID;
  readonly color: SolidColor;
  readonly opacity: number;
  readonly enabled: boolean;
}

export interface ResolvedStroke {
  readonly id: AppearanceItemID;
  readonly color: SolidColor;
  readonly width: number;
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number;
  readonly alignment: 'center';
  readonly opacity: number;
  readonly enabled: boolean;
}

export interface ResolvedEffect {
  readonly id: AppearanceItemID;
  readonly effectType: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly inputs: readonly AppearanceItemID[];
  readonly enabled: boolean;
}

export interface ResolvedAppearance {
  readonly id: AppearanceID;
  readonly fills: readonly ResolvedFill[];
  readonly strokes: readonly ResolvedStroke[];
  readonly effects: readonly ResolvedEffect[];
}

// Warning for dependency handling
export type AppearanceWarningCode = 'APPEARANCE_INPUT_REMOVED';

export interface AppearanceWarning {
  readonly code: AppearanceWarningCode;
  readonly message: string;
  readonly affectedItemId: AppearanceItemID;
  readonly removedInputId: AppearanceItemID;
}
