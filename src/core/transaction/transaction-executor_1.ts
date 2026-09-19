
import { Transaction, createTransaction } from './transaction.js';
import { WorkingCopy } from './working-copy.js';
import { Journal } from './journal.js';
import { createDiff } from './diff.js';
import { DocumentSnapshot, createSnapshot } from './snapshot.js';
import { EventBus } from '../events/index.js';
import { createTransactionID } from '../ids/index.js';
import { createError } from '../errors/index.js';
import { CommandContext } from './command-context.js';
import { createIDFactory } from './id-factory.js';
import { HistoryManager } from './history-manager.js';

export interface CanonicalStores {
  objectStore: any;
  geometryStore: any;
  appearanceStore: any;
  sceneGraph: any;
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

      // Capture inverse
      const inverseCommands: any[] = [];
      let canUseCommands = true;
      for (let i = transaction.commands.length - 1; i >= 0; i--) {
        const cmd = transaction.commands[i];
        if ((cmd as any).getInverse) {
          const inv = (cmd as any).getInverse();
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

    // Execute inverse transaction but with special handling to not push as new history
    const journal = new Journal();
    const workingCopy = new WorkingCopy(journal);

    try {
      this.loadAffectedEntitiesForUndo(toUndo, workingCopy, inverseTx);
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

      // Publish events for undo
      this.publishEvents(inverseTx, diff);

      // Move history pointer back
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
      const { createSnapshotRestoreCommand } = require('./commands/snapshot-restore.js'); // Will be replaced
      // For MVP, we create a custom transaction that restores snapshot via direct commands
      // We'll create a snapshot restore command dynamically

      // Import via dynamic
      const restoreCommands = this.createRestoreCommands(snapshot);
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

  private createRestoreCommands(snapshot: DocumentSnapshot): any[] {
    const commands: any[] = [];
    // This will be implemented via snapshot-restore command
    // For now, we create simple commands that restore objects
    // We need to import create commands
    // Since we cannot use dynamic require in ESM, we create inline commands

    // Object restore
    for (const [id, obj] of snapshot.objects) {
      commands.push({
        id: `restore-${id}`,
        toolId: 'snapshot-restore',
        input: { type: 'object', object: obj },
        deterministic: true,
        execute: (ctx: any) => {
          ctx.workingCopy.setObject(obj);
          return { success: true };
        },
        getAffectedIds: () => ({ objects: [id] })
      });
    }
    for (const [id, geom] of snapshot.geometries) {
      commands.push({
        id: `restore-geom-${id}`,
        toolId: 'snapshot-restore',
        input: { type: 'geometry', id, geometry: geom },
        deterministic: true,
        execute: (ctx: any) => {
          ctx.workingCopy.setGeometry(id as any, geom);
          return { success: true };
        },
        getAffectedIds: () => ({ geometries: [id] })
      });
    }
    for (const [id, app] of snapshot.appearances) {
      commands.push({
        id: `restore-app-${id}`,
        toolId: 'snapshot-restore',
        input: { type: 'appearance', appearance: app },
        deterministic: true,
        execute: (ctx: any) => {
          ctx.workingCopy.setAppearance(app);
          return { success: true };
        },
        getAffectedIds: () => ({ appearances: [id] })
      });
    }
    // Nodes
    for (const [id, node] of snapshot.nodes) {
      commands.push({
        id: `restore-node-${id}`,
        toolId: 'snapshot-restore',
        input: { type: 'node', node },
        deterministic: true,
        execute: (ctx: any) => {
          ctx.workingCopy.setNode(node);
          return { success: true };
        },
        getAffectedIds: () => ({ nodes: [id] })
      });
    }

    return commands;
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
    }

    for (const id of affected.objects) {
      const obj = this.stores.objectStore.get(id as any);
      workingCopy.loadObject(id as any, obj);
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

  private loadAffectedEntitiesForUndo(original: Transaction, workingCopy: WorkingCopy, inverseTx: Transaction): void {
    // For undo, we need to load entities affected by both original and inverse
    this.loadAffectedEntities(original, workingCopy);
    this.loadAffectedEntities(inverseTx, workingCopy);
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
          // For SceneGraph, we need to handle creation via working copy commit
          // For MVP, if node exists, update its transform via setLocalTransform, else create
          const existing = this.stores.sceneGraph.findNode(ref.id as any);
          if (!existing) {
            // Create node - we need to use sceneGraph API
            // For simplicity, we store node directly if sceneGraph has internal map access
            // This is a simplification for MVP
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
