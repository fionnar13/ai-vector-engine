
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
    if(arg2===undefined){
      app=arg1;
      id=app.id;
    } else {
      id=arg1;
      app=arg2;
    }
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
    this.validateAppearance(app);
    if(!this.store.has(id)) throw new Error(`Appearance not found ${id}`);
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
  setDependencies(deps){ this.deps=deps; }
  create(obj){
    if(!obj || !obj.id) throw new Error('Object missing');
    if(!isUUID(obj.id)) throw new Error(`Invalid ObjectID ${obj.id}`);
    if(obj.parent!==undefined) throw new Error('GraphicObject must NOT have parent field');
    if(obj.children!==undefined) throw new Error('GraphicObject must NOT have children');
    if(obj.worldTransform!==undefined) throw new Error('GraphicObject must NOT have worldTransform');
    if(this.store.has(obj.id)) throw new Error(`Duplicate ObjectID ${obj.id}`);
    if(this.deps){
      if(!this.deps.hasGeometry(obj.geometryRef)) throw new Error(`Geometry not found ${obj.geometryRef}`);
      if(!this.deps.hasAppearance(obj.appearanceRef)) throw new Error(`Appearance not found ${obj.appearanceRef}`);
    }
    this.store.set(obj.id, deepClone(obj));
  }
  get(id){ const o=this.store.get(id); return o?deepClone(o):undefined; }
  has(id){ return this.store.has(id); }
  update(id, patch){
    const existing=this.store.get(id);
    if(!existing) throw new Error(`Object not found ${id}`);
    const updated={...existing, ...patch, id:existing.id, meta:{...existing.meta, ...(patch.meta||{})}};
    if(this.deps){
      if(patch.geometryRef && !this.deps.hasGeometry(patch.geometryRef)) throw new Error(`Geometry not found ${patch.geometryRef}`);
      if(patch.appearanceRef && !this.deps.hasAppearance(patch.appearanceRef)) throw new Error(`Appearance not found ${patch.appearanceRef}`);
    }
    this.store.set(id, deepClone(updated));
  }
  delete(id){
    if(!this.store.has(id)) throw new Error(`Object not found ${id}`);
    this.store.delete(id);
  }
  listIds(){ return Array.from(this.store.keys()); }
  size(){ return this.store.size; }
  clear(){ this.store.clear(); }
  isGeometryReferenced(gid){ for(const o of this.store.values()){ if(o.geometryRef===gid) return true; } return false; }
  isAppearanceReferenced(aid){ for(const o of this.store.values()){ if(o.appearanceRef===aid) return true; } return false; }
}

export class DocumentStore {
  constructor(id){
    this.id=id||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    this.geometryStore=new GeometryStore();
    this.appearanceStore=new AppearanceStore();
    this.objectStore=new ObjectStore({
      hasGeometry: (gid)=>this.geometryStore.has(gid),
      hasAppearance: (aid)=>this.appearanceStore.has(aid)
    });
  }
  createGeometry(id, geom){ this.geometryStore.create(id, geom); }
  createAppearance(id, app){ this.appearanceStore.create(id, app); }
  createObject(obj){ this.objectStore.create(obj); }
  deleteGeometry(id){ this.geometryStore.delete(id, (gid)=>this.objectStore.isGeometryReferenced(gid)); }
  deleteAppearance(id){ this.appearanceStore.delete(id, (aid)=>this.objectStore.isAppearanceReferenced(aid)); }
  deleteObject(id){ this.objectStore.delete(id); }
  getObject(id){ return this.objectStore.get(id); }
  getGeometry(id){ return this.geometryStore.get(id); }
  getAppearance(id){ return this.appearanceStore.get(id); }
  size(){ return {objects:this.objectStore.size(), geometries:this.geometryStore.size(), appearances:this.appearanceStore.size()}; }
  clear(){ this.objectStore.clear(); this.geometryStore.clear(); this.appearanceStore.clear(); }
}
