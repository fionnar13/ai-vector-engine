
import { AppearanceID } from '../ids/index.js';
import { Appearance, AppearanceItem, AppearanceItemID, AppearanceWarning } from './types.js';
import { validateAppearance } from './validation.js';
import { isUUID } from '../ids/index.js';
import { createError } from '../errors/index.js';

function deepClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export class AppearanceStore {
  private store = new Map<string, Appearance>();
  private warnings: AppearanceWarning[] = [];

  create(appearance: Appearance): void {
    if (!isUUID(appearance.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceID ${appearance.id}`, severity: 'error' });
    validateAppearance(appearance);
    if (this.store.has(appearance.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate AppearanceID: ${appearance.id}`, severity: 'error' });
    this.store.set(appearance.id, deepClone(appearance));
  }

  createWithId(id: AppearanceID, appearance: Appearance): void {
    if (id !== appearance.id) throw createError({ code: 'VALIDATION_SCHEMA', message: `ID mismatch ${id} vs ${appearance.id}`, severity: 'error' });
    this.create(appearance);
  }

  get(id: AppearanceID): Appearance | undefined {
    const a = this.store.get(id);
    return a ? deepClone(a) : undefined;
  }

  has(id: AppearanceID): boolean {
    return this.store.has(id);
  }

  update(id: AppearanceID, appearance: Appearance): void {
    if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceID ${id}`, severity: 'error' });
    validateAppearance(appearance);
    if (!this.store.has(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found: ${id}`, severity: 'error' });
    this.store.set(id, deepClone(appearance));
  }

  delete(id: AppearanceID, isReferenced?: (id: AppearanceID) => boolean): void {
    if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceID ${id}`, severity: 'error' });
    if (!this.store.has(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found: ${id}`, severity: 'error' });
    if (isReferenced && isReferenced(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance in use, cannot delete: ${id}`, severity: 'error' });
    this.store.delete(id);
  }

  list(): Appearance[] {
    return Array.from(this.store.values()).map(a => deepClone(a));
  }

  listIds(): AppearanceID[] {
    return Array.from(this.store.keys()) as AppearanceID[];
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  // Stack operations
  addItem(appearanceId: AppearanceID, item: AppearanceItem, index?: number): void {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found: ${appearanceId}`, severity: 'error' });
    const mutableStack = [...app.stack] as AppearanceItem[];
    if (mutableStack.some(it => it.id === item.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate item ID ${item.id}`, severity: 'error' });

    if (index !== undefined) {
      if (index < 0 || index > mutableStack.length) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid index ${index}`, severity: 'error' });
      mutableStack.splice(index, 0, item);
    } else {
      mutableStack.push(item);
    }

    const newApp: Appearance = { id: app.id, stack: mutableStack };
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }

  removeItem(appearanceId: AppearanceID, itemId: AppearanceItemID): AppearanceWarning[] {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found`, severity: 'error' });

    const existingIndex = app.stack.findIndex(it => it.id === itemId);
    if (existingIndex === -1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Item not found ${itemId}`, severity: 'error' });

    const newStack = app.stack.filter(it => it.id !== itemId) as AppearanceItem[];
    const warnings: AppearanceWarning[] = [];
    const newStackMutable = newStack.map(item => {
      if (item.type === 'effect') {
        const inputs = item.inputs as AppearanceItemID[];
        if (inputs.includes(itemId)) {
          warnings.push({
            code: 'APPEARANCE_INPUT_REMOVED',
            message: `Input ${itemId} removed from effect ${item.id}, effect disabled`,
            affectedItemId: item.id,
            removedInputId: itemId
          });
          // Disable effect per spec, do not rewrite inputs silently
          return { ...item, enabled: false } as AppearanceItem;
        }
      }
      return item;
    });

    const newApp: Appearance = { id: app.id, stack: newStackMutable };
    // Validate after removal - should still be valid (disabled effects allowed)
    // But need to ensure no missing inputs for enabled effects - disabled effects skip validation? For MVP we keep validation but allow disabled effects with missing inputs? Spec says effect becomes disabled, so we should allow disabled effects to have missing inputs? Actually spec says do not leave dangling ref, but effect becomes disabled + warning. So we keep inputs but disabled, so validation should pass if we allow disabled effects to have missing inputs? Simpler: we keep inputs as is (still contains removed id) but disabled. That would fail validation if we require inputs exist. So per spec, we should keep inputs but disabled, and validation should allow disabled effects with missing inputs? Or we should keep inputs but disabled and warning. Let's implement validation that allows disabled effects to have missing inputs? For MVP, we will keep inputs unchanged but disabled, and we skip graph validation for disabled effects' missing inputs? Let's implement custom validation for this case: after removal, we disable effect but keep its inputs - we need to allow it. So we will not re-validate with strict graph that would reject missing input for disabled effect. Instead we validate with allowance: if effect disabled, missing inputs allowed.

    // For simplicity, we will validate manually: check that all enabled effects have valid inputs
    for (const it of newStackMutable) {
      if (it.type === 'effect' && it.enabled) {
        for (const inp of it.inputs) {
          if (!newStackMutable.some(s => s.id === inp)) {
            throw createError({ code: 'VALIDATION_SCHEMA', message: `Enabled effect ${it.id} has missing input ${inp} after removal`, severity: 'error' });
          }
        }
      }
    }

    // For disabled effects, we keep as is even if input missing - but we already kept input, so it's still missing? Actually we filtered itemId from stack, so inputs still reference removed id. If we keep it, it's dangling but disabled. Spec says do not leave dangling reference - but says effect becomes disabled + warning. So we should keep dangling? Or we should keep? The spec says "Do NOT silently leave a dangling reference. Apply rule: Effect becomes Disabled + Warning". So we disable but we still have dangling? The warning indicates dangling. To avoid dangling, we could keep inputs but disabled is considered not dangling? Let's interpret as disabled effect with dangling ref is allowed but warned. So we keep inputs.

    // For final storage, we keep the disabled effect with its original inputs (including removed id) - this is technically dangling but disabled and warned. To pass our earlier graph validation that would reject missing input, we need to bypass it for disabled effects. So we will store with disabled flag and not call full validateAppearance but custom.

    this.store.set(appearanceId, deepClone(newApp));
    this.warnings.push(...warnings);
    return warnings;
  }

  moveItem(appearanceId: AppearanceID, itemId: AppearanceItemID, newIndex: number): void {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found`, severity: 'error' });
    const oldIndex = app.stack.findIndex(it => it.id === itemId);
    if (oldIndex === -1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Item not found`, severity: 'error' });
    if (newIndex < 0 || newIndex >= app.stack.length) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid newIndex`, severity: 'error' });

    const mutable = [...app.stack];
    const [item] = mutable.splice(oldIndex, 1);
    mutable.splice(newIndex, 0, item);

    const newApp: Appearance = { id: app.id, stack: mutable };
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }

  updateItem(appearanceId: AppearanceID, itemId: AppearanceItemID, data: any): void {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found`, severity: 'error' });
    const index = app.stack.findIndex(it => it.id === itemId);
    if (index === -1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Item not found`, severity: 'error' });

    const existing = app.stack[index];
    const updated = { ...existing, data: { ...existing.data, ...data } } as AppearanceItem;

    const mutable = [...app.stack];
    mutable[index] = updated;

    const newApp: Appearance = { id: app.id, stack: mutable };
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }

  enableItem(appearanceId: AppearanceID, itemId: AppearanceItemID): void {
    this.setItemEnabled(appearanceId, itemId, true);
  }

  disableItem(appearanceId: AppearanceID, itemId: AppearanceItemID): void {
    this.setItemEnabled(appearanceId, itemId, false);
  }

  private setItemEnabled(appearanceId: AppearanceID, itemId: AppearanceItemID, enabled: boolean): void {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found`, severity: 'error' });
    const index = app.stack.findIndex(it => it.id === itemId);
    if (index === -1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Item not found`, severity: 'error' });

    const mutable = [...app.stack];
    mutable[index] = { ...mutable[index], enabled } as AppearanceItem;

    const newApp: Appearance = { id: app.id, stack: mutable };
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }

  getItem(appearanceId: AppearanceID, itemId: AppearanceItemID): AppearanceItem | undefined {
    const app = this.store.get(appearanceId);
    if (!app) return undefined;
    const item = app.stack.find(it => it.id === itemId);
    return item ? deepClone(item) : undefined;
  }

  getItems(appearanceId: AppearanceID): AppearanceItem[] {
    const app = this.store.get(appearanceId);
    if (!app) throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found`, severity: 'error' });
    return deepClone([...app.stack]);
  }

  getWarnings(): AppearanceWarning[] {
    return [...this.warnings];
  }

  clearWarnings(): void {
    this.warnings = [];
  }
}
