// Simple JS implementation of stores mirroring TS logic for runtime tests
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export class GeometryStore {
  constructor(){ this.store=new Map(); }
  create(id, geom){
    if(!isUUID(id)) throw new Error(`Invalid GeometryID ${id}`);
    if(this.store.has(id)) throw new Error(`Duplicate GeometryID ${id}`);
    if(!geom || !geom.type) throw new Error('Geometry missing');
    this.store.set(id, deepClone(geom));
  }
  get(id){ const g=this.store.get(id); return g?deepClone(g):undefined; }
  has(id){ return this.store.has(id); }
  update(id, geom){
    if(!this.store.has(id)) throw new Error(`Geometry not found ${id}`);
    this.store.set(id, deepClone(geom));
  }
  delete(id, isReferenced){
    if(!this.store.has(id)) throw new Error(`Geometry not found ${id}`);
    if(isReferenced && isReferenced(id)) throw new Error(`Geometry in use ${id}`);
    this.store.delete(id);
  }
  listIds(){ return Array.from(this.store.keys()); }
  size(){ return this.store.size; }
  clear(){ this.store.clear(); }
}

export class AppearanceStore {
  constructor(){ this.store=new Map(); }
  validateAppearance(app){
    if(!app || !Array.isArray(app.stack)) throw new Error('Appearance stack must be array');
    const seen=new Set(), idToIndex=new Map();
    for(let i=0;i<app.stack.length;i++){
      const item=app.stack[i];
      if(!item.id) throw new Error(`AppearanceItem id invalid at ${i}`);
      if(seen.has(item.id)) throw new Error(`Duplicate AppearanceItem ID: ${item.id}`);
      seen.add(item.id); idToIndex.set(item.id,i);
      if(item.type==='effect'){
        if(!Array.isArray(item.inputs)) throw new Error(`Effect inputs must be array`);
        for(const ref of item.inputs){
          if(!idToIndex.has(ref)){
            const existsLater=app.stack.slice(i+1).some(it=>it.id===ref);
            if(existsLater) throw new Error(`Forward reference ${item.id} -> ${ref}`);
            else throw new Error(`Invalid effect reference ${item.id} -> ${ref}`);
          }
        }
      }
    }
    const graph=new Map();
    for(const it of app.stack){
      graph.set(it.id, it.type==='effect'?[...it.inputs]:[]);
    }
    const visited=new Set(), rec=new Set();
    function hasCycle(node){
      if(!visited.has(node)){
        visited.add(node); rec.add(node);
        for(const nb of (graph.get(node)||[])){
          if(!visited.has(nb) && hasCycle(nb)) return true;
          if(rec.has(nb)) return true;
        }
      }
      rec.delete(node); return false;
    }
    for(const id of seen){ if(hasCycle(id)) throw new Error(`Appearance cycle at ${id}`); }
  }
  create(arg1, arg2){
    let id, app;
    if(arg2===undefined){ app=arg1; id=app.id; } else { id=arg1; app=arg2; }
    if(!isUUID(id)) throw new Error(`Invalid AppearanceID ${id}`);
    if(app.id && id!==app.id) throw new Error(`ID mismatch`);
    if(!app.id) app={...app, id};
    this.validateAppearance(app);
    if(this.store.has(id)) throw new Error(`Duplicate AppearanceID ${id}`);
    this.store.set(id, deepClone(app));
  }
  get(id){ const a=this.store.get(id); return a?deepClone(a):undefined; }
  has(id){ return this.store.has(id); }
  update(id, app){
    if(!this.store.has(id)) throw new Error(`Appearance not found ${id}`);
    if(id!==app.id) throw new Error(`ID mismatch`);
    this.validateAppearance(app);
    this.store.set(id, deepClone(app));
  }
  delete(id, isReferenced){
    if(!this.store.has(id)) throw new Error(`Appearance not found ${id}`);
    if(isReferenced && isReferenced(id)) throw new Error(`Appearance in use ${id}`);
    this.store.delete(id);
  }
  listIds(){ return Array.from(this.store.keys()); }
  size(){ return this.store.size; }
  clear(){ this.store.clear(); }
}

export class ObjectStore {
  constructor(deps){ this.store=new Map(); this.deps=deps; }
  validateObject(obj){
    if(!obj.id) throw new Error('Object id missing');
    if(!isUUID(obj.id)) throw new Error(`Invalid ObjectID ${obj.id}`);
    if(!obj.geometryRef) throw new Error('geometryRef missing');
    if(!obj.appearanceRef) throw new Error('appearanceRef missing');
    if(!isUUID(obj.geometryRef)) throw new Error(`Invalid GeometryID ${obj.geometryRef}`);
    if(!isUUID(obj.appearanceRef)) throw new Error(`Invalid AppearanceID ${obj.appearanceRef}`);
    if(obj.parent!==undefined) throw new Error('Object must not have parent field - hierarchy owned by SceneGraph');
    if(this.deps && this.deps.hasGeometry && !this.deps.hasGeometry(obj.geometryRef)) throw new Error(`Geometry not found ${obj.geometryRef}`);
    if(this.deps && this.deps.hasAppearance && !this.deps.hasAppearance(obj.appearanceRef)) throw new Error(`Appearance not found ${obj.appearanceRef}`);
  }
  create(obj){
    this.validateObject(obj);
    if(this.store.has(obj.id)) throw new Error(`Duplicate ObjectID ${obj.id}`);
    this.store.set(obj.id, deepClone(obj));
  }
  get(id){ const o=this.store.get(id); return o?deepClone(o):undefined; }
  has(id){ return this.store.has(id); }
  update(id, obj){
    if(!this.store.has(id)) throw new Error(`Object not found ${id}`);
    if(id!==obj.id) throw new Error(`ID mismatch`);
    this.validateObject(obj);
    this.store.set(id, deepClone(obj));
  }
  delete(id){ this.store.delete(id); }
  isGeometryReferenced(geomId){ for(const o of this.store.values()){ if(o.geometryRef===geomId) return true; } return false; }
  isAppearanceReferenced(appId){ for(const o of this.store.values()){ if(o.appearanceRef===appId) return true; } return false; }
  listIds(){ return Array.from(this.store.keys()); }
  size(){ return this.store.size; }
  clear(){ this.store.clear(); }
}

export class DocumentStore {
  constructor(){
    this.geometryStore=new GeometryStore();
    this.appearanceStore=new AppearanceStore();
    this.objectStore=new ObjectStore({hasGeometry:(id)=>this.geometryStore.has(id), hasAppearance:(id)=>this.appearanceStore.has(id)});
  }
  createGeometry(id, geom){ this.geometryStore.create(id, geom); }
  createAppearance(id, app){ this.appearanceStore.create(id, app); }
  createObject(obj){ this.objectStore.create(obj); }
  getGeometry(id){ return this.geometryStore.get(id); }
  getAppearance(id){ return this.appearanceStore.get(id); }
  getObject(id){ return this.objectStore.get(id); }
  deleteGeometry(id){ this.geometryStore.delete(id, (gid)=>this.objectStore.isGeometryReferenced(gid)); }
  deleteAppearance(id){ this.appearanceStore.delete(id, (aid)=>this.objectStore.isAppearanceReferenced(aid)); }
  deleteObject(id){ this.objectStore.delete(id); }
}
