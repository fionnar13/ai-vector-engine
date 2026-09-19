
import { Transaction, createTransaction } from './transaction.js';
import { WorkingCopy } from './working-copy.js';
import { Journal } from './journal.js';
import { createDiff } from './diff.js';
import { DocumentSnapshot, createSnapshot } from './snapshot.js';
import { EventBus } from '../events/index.js';
import { createTransactionID, createCommandID } from '../ids/index.js';
import { createError } from '../errors/index.js';
import { CommandContext } from './command-context.js';
import { createIDFactory } from './id-factory.js';
import { HistoryManager } from './history-manager.js';
import { Command } from './command.js';

export interface CanonicalStores {
  objectStore: any;
  geometryStore: any;
  appearanceStore: any;
  sceneGraph: any;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class TransactionExecutor {
  private stores: CanonicalStores;
  private eventBus: EventBus;
  private historyManager: HistoryManager;

  constructor(stores: CanonicalStores, eventBus: EventBus, historyManager: HistoryManager) {
    this.stores = stores;
    this.eventBus = eventBus;
    this.historyManager = historyManager;
  }

  execute(transaction: Transaction): Transaction {
    if (transaction.status !== 'pending') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Transaction must be pending', severity: 'error' });

    (transaction as any).status = 'executing';

    const journal = new Journal();
    const workingCopy = new WorkingCopy(journal);

    try {
      this.loadAffectedEntities(transaction, workingCopy);
      const beforeSnapshot = this.captureSnapshot(workingCopy);

      const idFactory = createIDFactory();
      const ctx: CommandContext = { workingCopy, ids: idFactory };

      for (const command of transaction.commands) {
        const result = command.execute(ctx);
        if (!result.success) {
          throw createError({ code: 'VALIDATION_SCHEMA', message: `TRANSACTION_COMMAND_FAILED: ${command.id} - ${result.error}`, severity: 'error' });
        }
      }

      this.validateWorkingCopy(workingCopy);

      journal.normalize();
      const diff = createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());

      // Inverse
      const inverseCommands: Command[] = [];
      let canUseCommands = true;
      for (let i = transaction.commands.length - 1; i >= 0; i--) {
        const cmd = transaction.commands[i];
        const getInverse = (cmd as any).getInverse;
        if (getInverse) {
          const inv = getInverse.call(cmd);
          if (inv) inverseCommands.push(inv);
          else canUseCommands = false;
        } else {
          canUseCommands = false;
        }
      }

      let inverse: any;
      if (canUseCommands && inverseCommands.length === transaction.commands.length) {
        inverse = { type: 'commands', commands: inverseCommands };
      } else {
        inverse = { type: 'snapshot', before: beforeSnapshot };
      }

      this.commit(workingCopy, diff);

      (transaction as any).status = 'committed';
      (transaction as any).diff = diff;
      (transaction as any).inverse = inverse;

      this.publishEvents(transaction, diff);
      this.historyManager.push(transaction);

      return transaction;
    } catch (e: any) {
      (transaction as any).status = 'failed';
      throw e;
    }
  }

  undo(): Transaction | null {
    const toUndo = this.historyManager.getTransactionToUndo();
    if (!toUndo) throw createError({ code: 'VALIDATION_SCHEMA', message: 'HISTORY_EMPTY', severity: 'error' });

    const inverseTx = this.createInverseTransaction(toUndo);

    const journal = new Journal();
    const workingCopy = new WorkingCopy(journal);

    try {
      this.loadAffectedEntities(toUndo, workingCopy);
      this.loadAffectedEntities(inverseTx, workingCopy);

      const idFactory = createIDFactory();
      const ctx: CommandContext = { workingCopy, ids: idFactory };

      for (const cmd of inverseTx.commands) {
        const result = cmd.execute(ctx);
        if (!result.success) throw createError({ code: 'VALIDATION_SCHEMA', message: `Undo command failed: ${result.error}`, severity: 'error' });
      }

      this.validateWorkingCopy(workingCopy);
      journal.normalize();
      const diff = createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());

      this.commit(workingCopy, diff);
      this.publishEvents(inverseTx, diff);
      this.historyManager.moveBack();

      return inverseTx;
    } catch (e) {
      throw e;
    }
  }

  redo(): Transaction | null {
    const toRedo = this.historyManager.getTransactionToRedo();
    if (!toRedo) throw createError({ code: 'VALIDATION_SCHEMA', message: 'HISTORY_NO_REDO', severity: 'error' });

    const journal = new Journal();
    const workingCopy = new WorkingCopy(journal);

    try {
      this.loadAffectedEntities(toRedo, workingCopy);

      const idFactory = createIDFactory();
      const ctx: CommandContext = { workingCopy, ids: idFactory };

      for (const cmd of toRedo.commands) {
        const result = cmd.execute(ctx);
        if (!result.success) throw createError({ code: 'VALIDATION_SCHEMA', message: `Redo command failed`, severity: 'error' });
      }

      this.validateWorkingCopy(workingCopy);
      journal.normalize();
      const diff = createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());

      this.commit(workingCopy, diff);
      this.publishEvents(toRedo, diff);
      this.historyManager.moveForward();

      return toRedo;
    } catch (e) {
      throw e;
    }
  }

  private createInverseTransaction(original: Transaction): Transaction {
    if (original.inverse?.type === 'commands') {
      return createTransaction({
        id: createTransactionID(),
        parentId: original.id,
        commands: [...original.inverse.commands],
        deterministic: true,
        source: 'system',
        description: `undo ${original.id}`
      });
    } else if (original.inverse?.type === 'snapshot') {
      const snapshot = original.inverse.before;
      const restoreCommands = this.createRestoreCommands(snapshot, original);
      return createTransaction({
        id: createTransactionID(),
        parentId: original.id,
        commands: restoreCommands,
        deterministic: true,
        source: 'system',
        description: `undo snapshot ${original.id}`
      });
    } else {
      throw createError({ code: 'VALIDATION_SCHEMA', message: 'Transaction has no inverse', severity: 'error' });
    }
  }

  private createRestoreCommands(snapshot: DocumentSnapshot, original: Transaction): Command[] {
    const commands: Command[] = [];
    const addedInOriginal = (original.diff?.added || []) as any[];
    const removedInOriginal = (original.diff?.removed || []) as any[];
    const modifiedInOriginal = (original.diff?.modified || []) as any[];

    // Delete what was added
    for (const ref of addedInOriginal) {
      if (ref.store === 'object') {
        commands.push(this.createDeleteCommand('object', ref.id));
      } else if (ref.store === 'geometry') {
        commands.push(this.createDeleteCommand('geometry', ref.id));
      } else if (ref.store === 'appearance') {
        commands.push(this.createDeleteCommand('appearance', ref.id));
      } else if (ref.store === 'node') {
        commands.push(this.createDeleteCommand('node', ref.id));
      }
    }

    // Restore what was removed or modified from snapshot
    for (const [id, obj] of snapshot.objects) {
      if (removedInOriginal.some((r: any) => r.store === 'object' && r.id === id) || modifiedInOriginal.some((r: any) => r.store === 'object' && r.id === id)) {
        commands.push(this.createSetCommand('object', id, obj));
      }
    }
    for (const [id, geom] of snapshot.geometries) {
      if (removedInOriginal.some((r: any) => r.store === 'geometry' && r.id === id) || modifiedInOriginal.some((r: any) => r.store === 'geometry' && r.id === id)) {
        commands.push(this.createSetCommand('geometry', id, geom));
      }
    }
    for (const [id, app] of snapshot.appearances) {
      if (removedInOriginal.some((r: any) => r.store === 'appearance' && r.id === id) || modifiedInOriginal.some((r: any) => r.store === 'appearance' && r.id === id)) {
        commands.push(this.createSetCommand('appearance', id, app));
      }
    }
    for (const [id, node] of snapshot.nodes) {
      if (removedInOriginal.some((r: any) => r.store === 'node' && r.id === id) || modifiedInOriginal.some((r: any) => r.store === 'node' && r.id === id)) {
        commands.push(this.createSetCommand('node', id, node));
      }
    }

    if (commands.length === 0) {
      for (const [id, obj] of snapshot.objects) commands.push(this.createSetCommand('object', id, obj));
      for (const [id, geom] of snapshot.geometries) commands.push(this.createSetCommand('geometry', id, geom));
      for (const [id, app] of snapshot.appearances) commands.push(this.createSetCommand('appearance', id, app));
    }

    return commands;
  }

  private createDeleteCommand(store: string, id: string): Command {
    return {
      id: createCommandID(),
      toolId: `delete_${store}`,
      input: { id },
      deterministic: true,
      execute: (ctx: CommandContext) => {
        if (store === 'object') ctx.workingCopy.deleteObject(id as any);
        else if (store === 'geometry') ctx.workingCopy.deleteGeometry(id as any);
        else if (store === 'appearance') ctx.workingCopy.deleteAppearance(id as any);
        else if (store === 'node') ctx.workingCopy.deleteNode(id as any);
        return { success: true };
      },
      getAffectedIds: () => {
        if (store === 'object') return { objects: [id] };
        if (store === 'geometry') return { geometries: [id] };
        if (store === 'appearance') return { appearances: [id] };
        if (store === 'node') return { nodes: [id] };
        return {};
      }
    };
  }

  private createSetCommand(store: string, id: string, data: any): Command {
    return {
      id: createCommandID(),
      toolId: `restore_${store}`,
      input: { id, data },
      deterministic: true,
      execute: (ctx: CommandContext) => {
        if (store === 'object') ctx.workingCopy.setObject(data);
        else if (store === 'geometry') ctx.workingCopy.setGeometry(id as any, data);
        else if (store === 'appearance') ctx.workingCopy.setAppearance(data);
        else if (store === 'node') ctx.workingCopy.setNode(data);
        return { success: true };
      },
      getAffectedIds: () => {
        if (store === 'object') return { objects: [id] };
        if (store === 'geometry') return { geometries: [id] };
        if (store === 'appearance') return { appearances: [id] };
        if (store === 'node') return { nodes: [id] };
        return {};
      }
    };
  }

  private loadAffectedEntities(transaction: Transaction, workingCopy: WorkingCopy): void {
    const affected = {
      objects: new Set<string>(),
      geometries: new Set<string>(),
      appearances: new Set<string>(),
      nodes: new Set<string>()
    };

    for (const cmd of transaction.commands) {
      const getAffected = (cmd as any).getAffectedIds;
      if (getAffected) {
        const ids = getAffected.call(cmd);
        if (ids?.objects) ids.objects.forEach((id: string) => affected.objects.add(id));
        if (ids?.geometries) ids.geometries.forEach((id: string) => affected.geometries.add(id));
        if (ids?.appearances) ids.appearances.forEach((id: string) => affected.appearances.add(id));
        if (ids?.nodes) ids.nodes.forEach((id: string) => affected.nodes.add(id));
      }
      const input = (cmd as any).input;
      if (input?.object) {
        if (input.object.geometryRef) affected.geometries.add(input.object.geometryRef);
        if (input.object.appearanceRef) affected.appearances.add(input.object.appearanceRef);
      }
    }

    for (const id of affected.objects) {
      const obj = this.stores.objectStore.get(id as any);
      workingCopy.loadObject(id as any, obj);
    }

    // Auto-load geometry/appearance referenced by objects
    for (const id of affected.objects) {
      const obj = this.stores.objectStore.get(id as any);
      if (obj) {
        if ((obj as any).geometryRef && !affected.geometries.has((obj as any).geometryRef)) {
          const geom = this.stores.geometryStore.get((obj as any).geometryRef);
          if (geom) {
            workingCopy.loadGeometry((obj as any).geometryRef, geom);
            affected.geometries.add((obj as any).geometryRef);
          }
        }
        if ((obj as any).appearanceRef && !affected.appearances.has((obj as any).appearanceRef)) {
          const app = this.stores.appearanceStore.get((obj as any).appearanceRef);
          if (app) {
            workingCopy.loadAppearance((obj as any).appearanceRef, app);
            affected.appearances.add((obj as any).appearanceRef);
          }
        }
      }
    }

    for (const id of affected.geometries) {
      const geom = this.stores.geometryStore.get(id as any);
      workingCopy.loadGeometry(id as any, geom);
    }
    for (const id of affected.appearances) {
      const app = this.stores.appearanceStore.get(id as any);
      workingCopy.loadAppearance(id as any, app);
    }
    for (const id of affected.nodes) {
      const node = this.stores.sceneGraph.findNode(id as any);
      workingCopy.loadNode(id as any, node);
    }
  }

  private captureSnapshot(workingCopy: WorkingCopy): DocumentSnapshot {
    const objects = new Map<string, any>();
    const geometries = new Map<string, any>();
    const appearances = new Map<string, any>();
    const nodes = new Map<string, any>();

    for (const id of workingCopy.getOriginalObjects()) {
      const obj = this.stores.objectStore.get(id as any);
      if (obj) objects.set(id, obj);
    }
    for (const id of workingCopy.getOriginalGeometries()) {
      const geom = this.stores.geometryStore.get(id as any);
      if (geom) geometries.set(id, geom);
    }
    for (const id of workingCopy.getOriginalAppearances()) {
      const app = this.stores.appearanceStore.get(id as any);
      if (app) appearances.set(id, app);
    }
    for (const id of workingCopy.getOriginalNodes()) {
      const node = this.stores.sceneGraph.findNode(id as any);
      if (node) nodes.set(id, node);
    }

    return createSnapshot(objects, geometries, appearances, nodes);
  }

  private validateWorkingCopy(workingCopy: WorkingCopy): void {
    for (const [id, obj] of workingCopy.getObjects()) {
      const geomId = (obj as any).geometryRef;
      const appId = (obj as any).appearanceRef;
      const geomExists = workingCopy.hasGeometry(geomId) || this.stores.geometryStore.has(geomId);
      if (!geomExists && !workingCopy.getDeletedGeometries().has(geomId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Reference integrity: Object ${id} -> Geometry ${geomId} not found`, severity: 'error' });
      }
      const appExists = workingCopy.hasAppearance(appId) || this.stores.appearanceStore.has(appId);
      if (!appExists && !workingCopy.getDeletedAppearances().has(appId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Reference integrity: Object ${id} -> Appearance ${appId} not found`, severity: 'error' });
      }
    }
  }

  private commit(workingCopy: WorkingCopy, diff: any): void {
    for (const ref of diff.removed) {
      if (ref.store === 'object') {
        try { this.stores.objectStore.delete(ref.id as any); } catch {}
      } else if (ref.store === 'geometry') {
        try { this.stores.geometryStore.delete(ref.id as any); } catch {}
      } else if (ref.store === 'appearance') {
        try { this.stores.appearanceStore.delete(ref.id as any); } catch {}
      } else if (ref.store === 'node') {
        if (this.stores.sceneGraph.removeNode) {
          try { this.stores.sceneGraph.removeNode(ref.id as any); } catch {}
        }
      }
    }

    for (const ref of [...diff.added, ...diff.modified]) {
      if (ref.store === 'object') {
        const obj = workingCopy.getObjects().get(ref.id);
        if (obj) {
          if (this.stores.objectStore.has(ref.id as any)) {
            this.stores.objectStore.update(ref.id as any, obj);
          } else {
            this.stores.objectStore.create(obj);
          }
        }
      } else if (ref.store === 'geometry') {
        const geom = workingCopy.getGeometries().get(ref.id);
        if (geom) {
          if (this.stores.geometryStore.has(ref.id as any)) {
            this.stores.geometryStore.update(ref.id as any, geom);
          } else {
            this.stores.geometryStore.create(ref.id as any, geom);
          }
        }
      } else if (ref.store === 'appearance') {
        const app = workingCopy.getAppearances().get(ref.id);
        if (app) {
          if (this.stores.appearanceStore.has(ref.id as any)) {
            this.stores.appearanceStore.update(ref.id as any, app);
          } else {
            this.stores.appearanceStore.create(app);
          }
        }
      } else if (ref.store === 'node') {
        const node = workingCopy.getNodes().get(ref.id);
        if (node) {
          const existing = this.stores.sceneGraph.findNode(ref.id as any);
          if (!existing) {
            if ((this.stores.sceneGraph as any).createNodeFromSnapshot) {
              (this.stores.sceneGraph as any).createNodeFromSnapshot(node);
            }
          } else {
            if ((this.stores.sceneGraph as any).updateNode) {
              (this.stores.sceneGraph as any).updateNode(ref.id as any, node);
            }
          }
        }
      }
    }
  }

  private publishEvents(transaction: Transaction, diff: any): void {
    for (const ref of diff.added) {
      if (ref.store === 'object') {
        this.eventBus.publish({
          type: 'ObjectCreated',
          source: transaction.metadata.source,
          transactionId: transaction.id,
          payload: { objectId: ref.id }
        } as any);
      }
    }

    for (const ref of diff.modified) {
      if (ref.store === 'object') {
        this.eventBus.publish({
          type: 'ObjectUpdated',
          source: transaction.metadata.source,
          transactionId: transaction.id,
          payload: { objectId: ref.id }
        } as any);
      }
      if (ref.store === 'node') {
        this.eventBus.publish({
          type: 'SceneGraphChanged',
          source: transaction.metadata.source,
          transactionId: transaction.id,
          payload: { nodeId: ref.id }
        } as any);
      }
    }

    for (const ref of diff.removed) {
      if (ref.store === 'object') {
        this.eventBus.publish({
          type: 'ObjectDeleted',
          source: transaction.metadata.source,
          transactionId: transaction.id,
          payload: { objectId: ref.id }
        } as any);
      }
    }

    this.eventBus.publish({
      type: 'TransactionCommitted',
      source: transaction.metadata.source,
      transactionId: transaction.id,
      payload: {
        transactionId: transaction.id,
        diff: {
          added: diff.added.length,
          removed: diff.removed.length,
          modified: diff.modified.length
        }
      }
    } as any);
  }

  restoreSnapshot(snapshot: DocumentSnapshot): void {
    for (const [id, obj] of snapshot.objects) {
      if (this.stores.objectStore.has(id as any)) {
        this.stores.objectStore.update(id as any, obj);
      } else {
        this.stores.objectStore.create(obj);
      }
    }
    for (const [id, geom] of snapshot.geometries) {
      if (this.stores.geometryStore.has(id as any)) {
        this.stores.geometryStore.update(id as any, geom);
      } else {
        this.stores.geometryStore.create(id as any, geom);
      }
    }
    for (const [id, app] of snapshot.appearances) {
      if (this.stores.appearanceStore.has(id as any)) {
        this.stores.appearanceStore.update(id as any, app);
      } else {
        this.stores.appearanceStore.create(app);
      }
    }
  }
}
