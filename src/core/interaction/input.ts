
import { Vec2 } from '../math/types.js';

export interface Modifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export type PointerInputType = 'down' | 'move' | 'up' | 'cancel';

export interface PointerInput {
  readonly pointerId: number;
  readonly type: PointerInputType;
  readonly position: Vec2;
  readonly worldPosition?: Vec2;
  readonly buttons: number;
  readonly pressure?: number;
  readonly modifiers: Modifiers;
  readonly timestamp: number;
}

export type KeyboardInputType = 'down' | 'up';

export interface KeyboardInput {
  readonly type: KeyboardInputType;
  readonly key: string;
  readonly modifiers: Modifiers;
  readonly timestamp: number;
}

export function createModifiers(shift=false, ctrl=false, alt=false, meta=false): Modifiers {
  return { shift, ctrl, alt, meta };
}

export function createPointerInput(
  pointerId: number,
  type: PointerInputType,
  position: Vec2,
  buttons = 1,
  modifiers: Modifiers = createModifiers(),
  pressure = 1,
  timestamp = Date.now()
): PointerInput {
  return { pointerId, type, position, buttons, pressure, modifiers, timestamp };
}

export function createKeyboardInput(
  type: KeyboardInputType,
  key: string,
  modifiers: Modifiers = createModifiers(),
  timestamp = Date.now()
): KeyboardInput {
  return { type, key, modifiers, timestamp };
}
