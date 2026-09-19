
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

export class Journal {
  constructor(){ this.added=[]; this.removed=[]; this.modified=[]; }
  add(store,id){ this.added.push({store,id}); }
  remove(store,id){ this.removed.push({store,id}); }
  modify(store,id){ this.modified.push({store,id}); }
  hasAdded(store,id){ return this.added.some(e=>e.store===store&&e.id===id); }
  hasModified(store,id){ return this.modified.some(e=>e.store===store&&e.id===id); }
  removeAdded(store,id){ this.added=this.added.filter(e=>!(e.store===store&&e.id===id)); }
  getAdded(){ return [...this.added]; }
  getRemoved(){ return [...this.removed]; }
  getModified(){ return [...this.modified]; }
  normalize(){
    const dedup=(refs)=>{ const seen=new Set(); const res=[]; for(const r of refs){ const k=`${r.store}:${r.id}`; if(!seen.has(k)){ seen.add(k); res.push(r);} } return res; };
    this.added=dedup(this.added); this.removed=dedup(this.removed); this.modified=dedup(this.modified);
    const addedKeys=new Set(this.added.map(r=>`${r.store}:${r.id}`));
    const removedKeys=new Set(this.removed.map(r=>`${r.store}:${r.id}`));
    const both=new Set([...addedKeys].filter(k=>removedKeys.has(k)));
    if(both.size>0){
      this.added=this.added.filter(r=>!both.has(`${r.store}:${r.id}`));
      this.removed=this.removed.filter(r=>!both.has(`${r.store}:${r.id}`));
      this.modified=this.modified.filter(r=>!both.has(`${r.store}:${r.id}`));
    }
  }
  toDiff(){ this.normalize(); return {added:this.getAdded(), removed:this.getRemoved(), modified:this.getModified()}; }
  clear(){ this.added=[]; this.removed=[]; this.modified=[]; }
}

export class WorkingCopy {
  constructor(journal){ this.journal=journal; this.objects=new Map(); this.geometries=new Map(); this.appearances=new Map(); this.nodes=new Map();
    this.originalObjects=new Set(); this.originalGeometries=new Set(); this.originalAppearances=new Set(); this.originalNodes=new Set();
    this.deletedObjects=new Set(); this.deletedGeometries=new Set(); this.deletedAppearances=new Set(); this.deletedNodes=new Set();
  }
  loadObject(id, canonical){ if(canonical){ this.objects.set(id, deepClone(canonical)); this.originalObjects.add(id);} }
  loadGeometry(id, canonical){ if(canonical){ this.geometries.set(id, deepClone(canonical)); this.originalGeometries.add(id);} }
  loadAppearance(id, canonical){ if(canonical){ this.appearances.set(id, deepClone(canonical)); this.originalAppearances.add(id);} }
  loadNode(id, canonical){ if(canonical){ this.nodes.set(id, deepClone(canonical)); this.originalNodes.add(id);} }
  getObject(id){ const o=this.objects.get(id); return o?deepClone(o):undefined; }
  getGeometry(id){ const g=this.geometries.get(id); return g?deepClone(g):undefined; }
  getAppearance(id){ const a=this.appearances.get(id); return a?deepClone(a):undefined; }
  getNode(id){ const n=this.nodes.get(id); return n?deepClone(n):undefined; }
  hasObject(id){ return this.objects.has(id); }
  hasGeometry(id){ return this.geometries.has(id); }
  hasAppearance(id){ return this.appearances.has(id); }
  hasNode(id){ return this.nodes.has(id); }
  setObject(obj){
    if(!this.originalObjects.has(obj.id) && !this.objects.has(obj.id)) this.journal.add('object', obj.id);
    else if(this.originalObjects.has(obj.id) && !this.journal.hasModified('object', obj.id) && !this.journal.hasAdded('object', obj.id)) this.journal.modify('object', obj.id);
    this.objects.set(obj.id, deepClone(obj));
  }
  setGeometry(id, geom){
    if(!this.originalGeometries.has(id) && !this.geometries.has(id)) this.journal.add('geometry', id);
    else if(this.originalGeometries.has(id) && !this.journal.hasModified('geometry', id) && !this.journal.hasAdded('geometry', id)) this.journal.modify('geometry', id);
    this.geometries.set(id, deepClone(geom));
  }
  setAppearance(app){
    const id=app.id;
    if(!this.originalAppearances.has(id) && !this.appearances.has(id)) this.journal.add('appearance', id);
    else if(this.originalAppearances.has(id) && !this.journal.hasModified('appearance', id) && !this.journal.hasAdded('appearance', id)) this.journal.modify('appearance', id);
    this.appearances.set(id, deepClone(app));
  }
  setNode(node){
    if(!this.originalNodes.has(node.id) && !this.nodes.has(node.id)) this.journal.add('node', node.id);
    else if(this.originalNodes.has(node.id) && !this.journal.hasModified('node', node.id) && !this.journal.hasAdded('node', node.id)) this.journal.modify('node', node.id);
    this.nodes.set(node.id, deepClone(node));
  }
  deleteObject(id){
    if(this.objects.has(id) || this.originalObjects.has(id)){
      if(this.journal.hasAdded('object', id)) this.journal.removeAdded('object', id);
      else this.journal.remove('object', id);
      this.objects.delete(id); this.deletedObjects.add(id);
    }
  }
  deleteGeometry(id){
    if(this.geometries.has(id) || this.originalGeometries.has(id)){
      if(this.journal.hasAdded('geometry', id)) this.journal.removeAdded('geometry', id);
      else this.journal.remove('geometry', id);
      this.geometries.delete(id); this.deletedGeometries.add(id);
    }
  }
  deleteAppearance(id){
    if(this.appearances.has(id) || this.originalAppearances.has(id)){
      if(this.journal.hasAdded('appearance', id)) this.journal.removeAdded('appearance', id);
      else this.journal.remove('appearance', id);
      this.appearances.delete(id); this.deletedAppearances.add(id);
    }
  }
  deleteNode(id){
    if(this.nodes.has(id) || this.originalNodes.has(id)){
      if(this.journal.hasAdded('node', id)) this.journal.removeAdded('node', id);
      else this.journal.remove('node', id);
      this.nodes.delete(id); this.deletedNodes.add(id);
    }
  }
  getObjects(){ return new Map(this.objects); }
  getGeometries(){ return new Map(this.geometries); }
  getAppearances(){ return new Map(this.appearances); }
  getNodes(){ return new Map(this.nodes); }
  getOriginalObjects(){ return new Set(this.originalObjects); }
  getOriginalGeometries(){ return new Set(this.originalGeometries); }
  getOriginalAppearances(){ return new Set(this.originalAppearances); }
  getOriginalNodes(){ return new Set(this.originalNodes); }
  getDeletedObjects(){ return new Set(this.deletedObjects); }
  getDeletedGeometries(){ return new Set(this.deletedGeometries); }
  getDeletedAppearances(){ return new Set(this.deletedAppearances); }
  getDeletedNodes(){ return new Set(this.deletedNodes); }
  getJournal(){ return this.journal; }
}

export function createDiff(added, removed, modified){
  return {added: Object.freeze([...added]), removed: Object.freeze([...removed]), modified: Object.freeze([...modified])};
}

export function createSnapshot(objects, geometries, appearances, nodes){
  return {
    objects: new Map(Array.from(objects.entries()).map(([k,v])=>[k,deepClone(v)])),
    geometries: new Map(Array.from(geometries.entries()).map(([k,v])=>[k,deepClone(v)])),
    appearances: new Map(Array.from(appearances.entries()).map(([k,v])=>[k,deepClone(v)])),
    nodes: new Map(Array.from(nodes.entries()).map(([k,v])=>[k,deepClone(v)]))
  };
}

export function createTransaction({id, parentId, commands, deterministic, source, toolId, description}){
  return {
    id: id || uuid(),
    parentId: parentId || null,
    commands: Object.freeze([...commands]),
    status: 'pending',
    diff: null,
    inverse: null,
    deterministic,
    metadata: Object.freeze({source, toolId, description}),
    createdAt: Date.now()
  };
}

export class TransactionBuilder {
  constructor(){ this.commands=[]; this.source='user'; }
  begin({source, toolId, description, parentId, id}){ this.source=source; this.toolId=toolId; this.description=description; this.parentId=parentId||null; this.id=id||null; this.commands=[]; return this; }
  addCommand(cmd){ this.commands.push(cmd); return this; }
  build(){
    if(this.commands.length===0) throw new Error('Transaction must have at least one command');
    const deterministic=this.commands.every(c=>c.deterministic);
    return createTransaction({id:this.id||uuid(), parentId:this.parentId, commands:this.commands, deterministic, source:this.source, toolId:this.toolId, description:this.description});
  }
}

export class CommandRegistry {
  constructor(){ this.factories=new Map(); }
  register(type, factory){ if(this.factories.has(type)) throw new Error(`Already registered ${type}`); this.factories.set(type,factory); }
  create(type, input){ const f=this.factories.get(type); if(!f) throw new Error(`Not found ${type}`); return f(input); }
  has(type){ return this.factories.has(type); }
  list(){ return Array.from(this.factories.keys()); }
}

export class HistoryManager {
  constructor(){ this.transactions=[]; this.currentIndex=-1; }
  canUndo(){ return this.currentIndex>=0; }
  canRedo(){ return this.currentIndex < this.transactions.length-1; }
  push(tx){ if(tx.status!=='committed') throw new Error('Only committed transactions can be pushed'); if(this.currentIndex < this.transactions.length-1){ this.transactions=this.transactions.slice(0,this.currentIndex+1); } this.transactions.push(tx); this.currentIndex=this.transactions.length-1; }
  current(){ if(this.currentIndex<0||this.currentIndex>=this.transactions.length) return null; return this.transactions[this.currentIndex]; }
  getAll(){ return [...this.transactions]; }
  getCurrentIndex(){ return this.currentIndex; }
  getTransactionToUndo(){ if(!this.canUndo()) return null; return this.transactions[this.currentIndex]; }
  getTransactionToRedo(){ if(!this.canRedo()) return null; return this.transactions[this.currentIndex+1]; }
  moveBack(){ if(!this.canUndo()) throw new Error('HISTORY_EMPTY'); this.currentIndex--; }
  moveForward(){ if(!this.canRedo()) throw new Error('HISTORY_NO_REDO'); this.currentIndex++; }
  clear(){ this.transactions=[]; this.currentIndex=-1; }
  size(){ return this.transactions.length; }
}

export class EventBus {
  constructor(){ this.listeners=new Map(); this.history=[]; }
  subscribe(type, listener){ if(!this.listeners.has(type)) this.listeners.set(type,new Set()); this.listeners.get(type).add(listener); return ()=>this.unsubscribe(type,listener); }
  unsubscribe(type, listener){ this.listeners.get(type)?.delete(listener); }
  publish(event){
    const full={id:uuid(), timestamp:Date.now(), version:1, ...event};
    this.history.push(full);
    const specific=this.listeners.get(event.type); if(specific) for(const l of specific) l(full);
    const wildcard=this.listeners.get('*'); if(wildcard) for(const l of wildcard) l(full);
  }
  getHistory(){ return [...this.history]; }
  clear(){ this.history=[]; this.listeners.clear(); }
}

export class TransactionExecutor {
  constructor(stores, eventBus, historyManager){ this.stores=stores; this.eventBus=eventBus; this.historyManager=historyManager; }

  execute(transaction){
    if(transaction.status!=='pending') throw new Error('Transaction must be pending');
    transaction.status='executing';
    const journal=new Journal();
    const workingCopy=new WorkingCopy(journal);
    try{
      this.loadAffectedEntities(transaction, workingCopy);
      const beforeSnapshot=this.captureSnapshot(workingCopy);
      const idFactory={createObjectID:()=>uuid(), createGeometryID:()=>uuid(), createAppearanceID:()=>uuid(), createNodeID:()=>uuid(), createCommandID:()=>uuid(), createTransactionID:()=>uuid()};
      const ctx={workingCopy, ids:idFactory};
      for(const cmd of transaction.commands){
        const result=cmd.execute(ctx);
        if(!result.success) throw new Error(`TRANSACTION_COMMAND_FAILED: ${cmd.id} - ${result.error}`);
      }
      this.validateWorkingCopy(workingCopy);
      journal.normalize();
      const diff=createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());

      // Inverse
      const inverseCommands=[]; let canUseCommands=true;
      for(let i=transaction.commands.length-1;i>=0;i--){
        const cmd=transaction.commands[i];
        if(cmd.getInverse){ const inv=cmd.getInverse(); if(inv) inverseCommands.push(inv); else canUseCommands=false; } else canUseCommands=false;
      }
      let inverse;
      if(canUseCommands && inverseCommands.length===transaction.commands.length) inverse={type:'commands', commands:inverseCommands};
      else inverse={type:'snapshot', before:beforeSnapshot};

      this.commit(workingCopy, diff);
      transaction.status='committed'; transaction.diff=diff; transaction.inverse=inverse;
      this.publishEvents(transaction, diff);
      this.historyManager.push(transaction);
      return transaction;
    }catch(e){
      transaction.status='failed';
      throw e;
    }
  }

  undo(){
    const toUndo=this.historyManager.getTransactionToUndo();
    if(!toUndo) throw new Error('HISTORY_EMPTY');
    const inverseTx=this.createInverseTransaction(toUndo);
    const journal=new Journal();
    const workingCopy=new WorkingCopy(journal);
    try{
      this.loadAffectedEntities(toUndo, workingCopy);
      this.loadAffectedEntities(inverseTx, workingCopy);
      // Also need to load entities from snapshot if snapshot restore
      if(toUndo.inverse?.type==='snapshot'){
        for(const [id,obj] of toUndo.inverse.before.objects){ if(!workingCopy.hasObject(id)) workingCopy.loadObject(id, this.stores.objectStore.get(id)); }
        for(const [id,geom] of toUndo.inverse.before.geometries){ if(!workingCopy.hasGeometry(id)) workingCopy.loadGeometry(id, this.stores.geometryStore.get(id)); }
        for(const [id,app] of toUndo.inverse.before.appearances){ if(!workingCopy.hasAppearance(id)) workingCopy.loadAppearance(id, this.stores.appearanceStore.get(id)); }
        for(const [id,node] of toUndo.inverse.before.nodes){ if(!workingCopy.hasNode(id)) workingCopy.loadNode(id, this.stores.sceneGraph.findNode(id)); }
        // Also load current state for entities that will be restored
        for(const [id] of toUndo.inverse.before.objects){ /* already */ }
      }
      const idFactory={createObjectID:()=>uuid(), createGeometryID:()=>uuid(), createAppearanceID:()=>uuid(), createNodeID:()=>uuid(), createCommandID:()=>uuid(), createTransactionID:()=>uuid()};
      const ctx={workingCopy, ids:idFactory};
      for(const cmd of inverseTx.commands){
        const res=cmd.execute(ctx);
        if(!res.success) throw new Error(`Undo command failed: ${res.error}`);
      }
      this.validateWorkingCopy(workingCopy);
      journal.normalize();
      const diff=createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());
      this.commit(workingCopy, diff);
      this.publishEvents(inverseTx, diff);
      this.historyManager.moveBack();
      return inverseTx;
    }catch(e){ throw e; }
  }

  redo(){
    const toRedo=this.historyManager.getTransactionToRedo();
    if(!toRedo) throw new Error('HISTORY_NO_REDO');
    const journal=new Journal();
    const workingCopy=new WorkingCopy(journal);
    try{
      this.loadAffectedEntities(toRedo, workingCopy);
      const idFactory={createObjectID:()=>uuid(), createGeometryID:()=>uuid(), createAppearanceID:()=>uuid(), createNodeID:()=>uuid(), createCommandID:()=>uuid(), createTransactionID:()=>uuid()};
      const ctx={workingCopy, ids:idFactory};
      for(const cmd of toRedo.commands){
        const res=cmd.execute(ctx);
        if(!res.success) throw new Error('Redo command failed');
      }
      this.validateWorkingCopy(workingCopy);
      journal.normalize();
      const diff=createDiff(journal.getAdded(), journal.getRemoved(), journal.getModified());
      this.commit(workingCopy, diff);
      this.publishEvents(toRedo, diff);
      this.historyManager.moveForward();
      return toRedo;
    }catch(e){ throw e; }
  }

  createInverseTransaction(original){
    if(original.inverse?.type==='commands'){
      return createTransaction({id:uuid(), parentId:original.id, commands:[...original.inverse.commands], deterministic:true, source:'system', description:`undo ${original.id}`});
    } else if(original.inverse?.type==='snapshot'){
      const snapshot=original.inverse.before;
      const restoreCommands=this.createRestoreCommands(snapshot, original);
      return createTransaction({id:uuid(), parentId:original.id, commands:restoreCommands, deterministic:true, source:'system', description:`undo snapshot ${original.id}`});
    } else throw new Error('Transaction has no inverse');
  }

  createRestoreCommands(snapshot, original){
    const commands=[];
    // For undo of a transaction that created objects, we need to delete them if they were added
    // And restore objects that were modified/deleted

    // Determine what was added in original transaction
    const addedInOriginal=original.diff?.added || [];
    const removedInOriginal=original.diff?.removed || [];
    const modifiedInOriginal=original.diff?.modified || [];

    // For added entities, delete them on undo
    for(const ref of addedInOriginal){
      if(ref.store==='object') commands.push(createDeleteObjectCommand({objectId:ref.id}));
      else if(ref.store==='geometry') commands.push({id:uuid(), toolId:'delete_geometry', input:{geometryId:ref.id}, deterministic:true, execute:(ctx)=>{ ctx.workingCopy.deleteGeometry(ref.id); return {success:true}; }, getAffectedIds:()=>({geometries:[ref.id]})});
      else if(ref.store==='appearance') commands.push({id:uuid(), toolId:'delete_appearance', input:{appearanceId:ref.id}, deterministic:true, execute:(ctx)=>{ ctx.workingCopy.deleteAppearance(ref.id); return {success:true}; }, getAffectedIds:()=>({appearances:[ref.id]})});
      else if(ref.store==='node') commands.push(createDeleteNodeCommand({nodeId:ref.id}));
    }

    // For removed entities, restore them from snapshot
    for(const [id,obj] of snapshot.objects){
      // If object was removed in original, we need to restore it
      if(removedInOriginal.some(r=>r.store==='object' && r.id===id)){
        commands.push(createCreateObjectCommand({object:obj}));
      } else if(modifiedInOriginal.some(r=>r.store==='object' && r.id===id)){
        commands.push(createUpdateObjectCommand({object:obj}));
      }
    }
    for(const [id,geom] of snapshot.geometries){
      if(removedInOriginal.some(r=>r.store==='geometry' && r.id===id) || modifiedInOriginal.some(r=>r.store==='geometry' && r.id===id)){
        commands.push(createUpdateGeometryCommand({geometryId:id, geometry:geom}));
      }
    }
    for(const [id,app] of snapshot.appearances){
      if(removedInOriginal.some(r=>r.store==='appearance' && r.id===id) || modifiedInOriginal.some(r=>r.store==='appearance' && r.id===id)){
        commands.push(createUpdateAppearanceCommand({appearanceId:id, appearance:app}));
      }
    }
    for(const [id,node] of snapshot.nodes){
      if(removedInOriginal.some(r=>r.store==='node' && r.id===id) || modifiedInOriginal.some(r=>r.store==='node' && r.id===id)){
        commands.push(createCreateNodeCommand({node}));
      }
    }

    // If no commands from snapshot logic, fallback to generic restore
    if(commands.length===0){
      for(const [id,obj] of snapshot.objects) commands.push(createCreateObjectCommand({object:obj}));
      for(const [id,geom] of snapshot.geometries) commands.push(createUpdateGeometryCommand({geometryId:id, geometry:geom}));
      for(const [id,app] of snapshot.appearances) commands.push(createUpdateAppearanceCommand({appearanceId:id, appearance:app}));
    }

    return commands;
  }

  loadAffectedEntities(transaction, workingCopy){
    const affected={objects:new Set(), geometries:new Set(), appearances:new Set(), nodes:new Set()};
    for(const cmd of transaction.commands){
      if(cmd.getAffectedIds){
        const ids=cmd.getAffectedIds();
        if(ids?.objects) ids.objects.forEach(id=>affected.objects.add(id));
        if(ids?.geometries) ids.geometries.forEach(id=>affected.geometries.add(id));
        if(ids?.appearances) ids.appearances.forEach(id=>affected.appearances.add(id));
        if(ids?.nodes) ids.nodes.forEach(id=>affected.nodes.add(id));
      }
      // Also extract geometry/appearance refs from create object commands
      if(cmd.input && cmd.input.object){
        const obj=cmd.input.object;
        if(obj.geometryRef) affected.geometries.add(obj.geometryRef);
        if(obj.appearanceRef) affected.appearances.add(obj.appearanceRef);
      }
    }
    for(const id of affected.objects){ const obj=this.stores.objectStore.get(id); workingCopy.loadObject(id,obj); }
    // Auto-load geometry and appearance referenced by objects
    for(const id of affected.objects){
      const obj=this.stores.objectStore.get(id);
      if(obj){
        if(obj.geometryRef && !affected.geometries.has(obj.geometryRef)){
          const geom=this.stores.geometryStore.get(obj.geometryRef);
          if(geom){ workingCopy.loadGeometry(obj.geometryRef, geom); affected.geometries.add(obj.geometryRef); }
        }
        if(obj.appearanceRef && !affected.appearances.has(obj.appearanceRef)){
          const app=this.stores.appearanceStore.get(obj.appearanceRef);
          if(app){ workingCopy.loadAppearance(obj.appearanceRef, app); affected.appearances.add(obj.appearanceRef); }
        }
      }
    }
    for(const id of affected.geometries){ const geom=this.stores.geometryStore.get(id); workingCopy.loadGeometry(id,geom); }
    for(const id of affected.appearances){ const app=this.stores.appearanceStore.get(id); workingCopy.loadAppearance(id,app); }
    for(const id of affected.nodes){ const node=this.stores.sceneGraph.findNode(id); workingCopy.loadNode(id,node); }
  }

  captureSnapshot(workingCopy){
    const objects=new Map(), geometries=new Map(), appearances=new Map(), nodes=new Map();
    for(const id of workingCopy.getOriginalObjects()){ const obj=this.stores.objectStore.get(id); if(obj) objects.set(id,obj); }
    for(const id of workingCopy.getOriginalGeometries()){ const geom=this.stores.geometryStore.get(id); if(geom) geometries.set(id,geom); }
    for(const id of workingCopy.getOriginalAppearances()){ const app=this.stores.appearanceStore.get(id); if(app) appearances.set(id,app); }
    for(const id of workingCopy.getOriginalNodes()){ const node=this.stores.sceneGraph.findNode(id); if(node) nodes.set(id,node); }
    return createSnapshot(objects, geometries, appearances, nodes);
  }

  validateWorkingCopy(workingCopy){
    for(const [id,obj] of workingCopy.getObjects()){
      const geomId=obj.geometryRef, appId=obj.appearanceRef;
      const geomExists=workingCopy.hasGeometry(geomId) || this.stores.geometryStore.has(geomId);
      if(!geomExists && !workingCopy.getDeletedGeometries().has(geomId)) throw new Error(`Reference integrity: Object ${id} -> Geometry ${geomId} not found`);
      const appExists=workingCopy.hasAppearance(appId) || this.stores.appearanceStore.has(appId);
      if(!appExists && !workingCopy.getDeletedAppearances().has(appId)) throw new Error(`Reference integrity: Object ${id} -> Appearance ${appId} not found`);
    }
  }

  commit(workingCopy, diff){
    for(const ref of diff.removed){
      if(ref.store==='object'){ try{ this.stores.objectStore.delete(ref.id); }catch{} }
      else if(ref.store==='geometry'){ try{ this.stores.geometryStore.delete(ref.id); }catch{} }
      else if(ref.store==='appearance'){ try{ this.stores.appearanceStore.delete(ref.id); }catch{} }
      else if(ref.store==='node'){ if(this.stores.sceneGraph.removeNode) try{ this.stores.sceneGraph.removeNode(ref.id); }catch{} }
    }
    for(const ref of [...diff.added, ...diff.modified]){
      if(ref.store==='object'){
        const obj=workingCopy.getObjects().get(ref.id);
        if(obj){ if(this.stores.objectStore.has(ref.id)) this.stores.objectStore.update(ref.id,obj); else this.stores.objectStore.create(obj); }
      } else if(ref.store==='geometry'){
        const geom=workingCopy.getGeometries().get(ref.id);
        if(geom){ if(this.stores.geometryStore.has(ref.id)) this.stores.geometryStore.update(ref.id,geom); else this.stores.geometryStore.create(ref.id,geom); }
      } else if(ref.store==='appearance'){
        const app=workingCopy.getAppearances().get(ref.id);
        if(app){ if(this.stores.appearanceStore.has(ref.id)) this.stores.appearanceStore.update(ref.id,app); else this.stores.appearanceStore.create(app); }
      } else if(ref.store==='node'){
        const node=workingCopy.getNodes().get(ref.id);
        if(node){
          const existing=this.stores.sceneGraph.findNode(ref.id);
          if(!existing){
            // Create via sceneGraph API if available, else direct map
            if(this.stores.sceneGraph.createNodeFromSnapshot) this.stores.sceneGraph.createNodeFromSnapshot(node);
            else if(this.stores.sceneGraph.nodes) this.stores.sceneGraph.nodes.set(ref.id, node);
          } else {
            if(this.stores.sceneGraph.updateNode) this.stores.sceneGraph.updateNode(ref.id, node);
            else if(this.stores.sceneGraph.nodes) this.stores.sceneGraph.nodes.set(ref.id, node);
          }
        }
      }
    }
  }

  publishEvents(transaction, diff){
    for(const ref of diff.added){ if(ref.store==='object') this.eventBus.publish({type:'ObjectCreated', source:transaction.metadata.source, transactionId:transaction.id, payload:{objectId:ref.id}}); }
    for(const ref of diff.modified){
      if(ref.store==='object') this.eventBus.publish({type:'ObjectUpdated', source:transaction.metadata.source, transactionId:transaction.id, payload:{objectId:ref.id}});
      if(ref.store==='node') this.eventBus.publish({type:'SceneGraphChanged', source:transaction.metadata.source, transactionId:transaction.id, payload:{nodeId:ref.id}});
    }
    for(const ref of diff.removed){ if(ref.store==='object') this.eventBus.publish({type:'ObjectDeleted', source:transaction.metadata.source, transactionId:transaction.id, payload:{objectId:ref.id}}); }
    this.eventBus.publish({type:'TransactionCommitted', source:transaction.metadata.source, transactionId:transaction.id, payload:{transactionId:transaction.id, diff:{added:diff.added.length, removed:diff.removed.length, modified:diff.modified.length}}});
  }
}

// Commands
export function createCreateObjectCommand(input){
  return {
    id: uuid(),
    toolId: 'create_object',
    input,
    deterministic: true,
    execute(ctx){ if(!input.object||!input.object.id) return {success:false, error:'Object missing id'}; ctx.workingCopy.setObject(input.object); return {success:true}; },
    getAffectedIds(){ return {objects:[input.object.id]}; },
    getInverse(){ return createDeleteObjectCommand({objectId:input.object.id}); }
  };
}

export function createDeleteObjectCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'delete_object',
    input,
    deterministic: true,
    execute(ctx){
      const existing=ctx.workingCopy.getObject(input.objectId);
      if(existing) before=existing;
      else {
        // Try to load from stores? For JS runtime we already loaded
      }
      ctx.workingCopy.deleteObject(input.objectId);
      return {success:true};
    },
    getAffectedIds(){ return {objects:[input.objectId]}; },
    getInverse(){
      if(!before) return null;
      return createCreateObjectCommand({object:before});
    }
  };
}

export function createUpdateObjectCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'update_object',
    input,
    deterministic: true,
    execute(ctx){ const existing=ctx.workingCopy.getObject(input.object.id); if(existing) before=existing; ctx.workingCopy.setObject(input.object); return {success:true}; },
    getAffectedIds(){ return {objects:[input.object.id]}; },
    getInverse(){ if(!before) return null; return createUpdateObjectCommand({object:before}); }
  };
}

export function createMoveObjectCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'move_object',
    input,
    deterministic: true,
    execute(ctx){
      const obj=ctx.workingCopy.getObject(input.objectId);
      if(!obj) return {success:false, error:`Object not found ${input.objectId}`};
      const geomId=obj.geometryRef;
      const geom=ctx.workingCopy.getGeometry(geomId);
      if(geom && geom.params && geom.params.x!==undefined){
        before={x:geom.params.x, y:geom.params.y};
        const newGeom={...geom, params:{...geom.params, x:geom.params.x+input.dx, y:geom.params.y+input.dy}};
        ctx.workingCopy.setGeometry(geomId, newGeom);
      } else {
        // For generic, store in object meta
        ctx.workingCopy.setObject({...obj, meta:{...obj.meta, _pos:{x:(obj.meta?._pos?.x||0)+input.dx, y:(obj.meta?._pos?.y||0)+input.dy}}});
      }
      return {success:true};
    },
    getAffectedIds(){ return {objects:[input.objectId]}; },
    getInverse(){ return createMoveObjectCommand({objectId:input.objectId, dx:-input.dx, dy:-input.dy}); }
  };
}

export function createTransformObjectCommand(input){
  return {
    id: uuid(),
    toolId: 'transform_object',
    input,
    deterministic: true,
    execute(ctx){ const obj=ctx.workingCopy.getObject(input.objectId); if(!obj) return {success:false, error:'Object not found'}; ctx.workingCopy.setObject({...obj}); return {success:true}; },
    getAffectedIds(){ return {objects:[input.objectId]}; }
  };
}

export function createUpdateGeometryCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'update_geometry',
    input,
    deterministic: true,
    execute(ctx){ const existing=ctx.workingCopy.getGeometry(input.geometryId); if(existing) before=existing; ctx.workingCopy.setGeometry(input.geometryId, input.geometry); return {success:true}; },
    getAffectedIds(){ return {geometries:[input.geometryId]}; },
    getInverse(){ if(!before) return null; return createUpdateGeometryCommand({geometryId:input.geometryId, geometry:before}); }
  };
}

export function createUpdateAppearanceCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'update_appearance',
    input,
    deterministic: true,
    execute(ctx){ const existing=ctx.workingCopy.getAppearance(input.appearanceId); if(existing) before=existing; ctx.workingCopy.setAppearance(input.appearance); return {success:true}; },
    getAffectedIds(){ return {appearances:[input.appearanceId]}; },
    getInverse(){ if(!before) return null; return createUpdateAppearanceCommand({appearanceId:input.appearanceId, appearance:before}); }
  };
}

export function createCreateNodeCommand(input){
  return {
    id: uuid(),
    toolId: 'create_node',
    input,
    deterministic: true,
    execute(ctx){ ctx.workingCopy.setNode(input.node); return {success:true}; },
    getAffectedIds(){ return {nodes:[input.node.id]}; },
    getInverse(){ return createDeleteNodeCommand({nodeId:input.node.id}); }
  };
}

export function createDeleteNodeCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'delete_node',
    input,
    deterministic: true,
    execute(ctx){ const existing=ctx.workingCopy.getNode(input.nodeId); if(existing) before=existing; ctx.workingCopy.deleteNode(input.nodeId); return {success:true}; },
    getAffectedIds(){ return {nodes:[input.nodeId]}; },
    getInverse(){ if(!before) return null; return createCreateNodeCommand({node:before}); }
  };
}

export function createReparentNodeCommand(input){
  let oldParentId=null;
  return {
    id: uuid(),
    toolId: 'reparent_node',
    input,
    deterministic: true,
    execute(ctx){
      const node=ctx.workingCopy.getNode(input.nodeId);
      if(!node) return {success:false, error:`Node not found ${input.nodeId}`};
      oldParentId=node.parent;
      const newNode={...node, parent:input.newParentId};
      ctx.workingCopy.setNode(newNode);
      if(oldParentId){
        const oldParent=ctx.workingCopy.getNode(oldParentId);
        if(oldParent){ const newChildren=oldParent.children.filter(c=>c!==input.nodeId); ctx.workingCopy.setNode({...oldParent, children:newChildren}); }
      }
      if(input.newParentId){
        const newParent=ctx.workingCopy.getNode(input.newParentId);
        if(newParent){ const newChildren=[...newParent.children, input.nodeId]; ctx.workingCopy.setNode({...newParent, children:newChildren}); }
      }
      return {success:true};
    },
    getAffectedIds(){ const ids=[input.nodeId]; if(oldParentId) ids.push(oldParentId); if(input.newParentId) ids.push(input.newParentId); return {nodes:ids}; },
    getInverse(){ if(oldParentId===undefined) return null; return createReparentNodeCommand({nodeId:input.nodeId, newParentId:oldParentId}); }
  };
}

export function createSetZOrderCommand(input){
  let oldIndex=-1;
  return {
    id: uuid(),
    toolId: 'set_z_order',
    input,
    deterministic: true,
    execute(ctx){
      const parent=ctx.workingCopy.getNode(input.parentId);
      if(!parent) return {success:false, error:`Parent not found ${input.parentId}`};
      oldIndex=parent.children.indexOf(input.childId);
      if(oldIndex===-1) return {success:false, error:'Child not found'};
      const children=[...parent.children]; children.splice(oldIndex,1); children.splice(input.newIndex,0,input.childId);
      ctx.workingCopy.setNode({...parent, children}); return {success:true};
    },
    getAffectedIds(){ return {nodes:[input.parentId]}; },
    getInverse(){ if(oldIndex===-1) return null; return createSetZOrderCommand({parentId:input.parentId, childId:input.childId, newIndex:oldIndex}); }
  };
}
