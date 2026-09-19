
function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || typeof id==='string' && id.length>0; }
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

export function validateSolidColor(color){
  if(!color || typeof color!=='object') throw new Error('SolidColor missing');
  const {r,g,b,a}=color;
  for(const [name,val] of [['r',r],['g',g],['b',b],['a',a]]){
    if(!Number.isFinite(val)) throw new Error(`Color ${name} not finite`);
    if(Number.isNaN(val)) throw new Error(`Color ${name} NaN`);
  }
  if(r<0||r>255) throw new Error(`Color r out of range ${r}`);
  if(g<0||g>255) throw new Error(`Color g out of range`);
  if(b<0||b>255) throw new Error(`Color b out of range`);
  if(a<0||a>1) throw new Error(`Color a out of range`);
}

export function createSolidColor(r,g,b,a=1){ const c={r,g,b,a}; validateSolidColor(c); return c; }

export function validateFillData(data){
  if(!data || data.kind!=='solid') throw new Error('Fill kind must be solid');
  validateSolidColor(data.color);
  if(!Number.isFinite(data.opacity)||data.opacity<0||data.opacity>1) throw new Error(`Fill opacity out of range ${data.opacity}`);
}

export function validateStrokeData(data){
  if(!data) throw new Error('StrokeData missing');
  validateSolidColor(data.color);
  if(!Number.isFinite(data.width)||data.width<0) throw new Error(`Stroke width >=0`);
  if(Number.isNaN(data.width)) throw new Error('Stroke width NaN');
  const caps=new Set(['butt','round','square']);
  const joins=new Set(['miter','round','bevel']);
  if(!caps.has(data.cap)) throw new Error(`Invalid cap ${data.cap}`);
  if(!joins.has(data.join)) throw new Error(`Invalid join ${data.join}`);
  if(!Number.isFinite(data.miterLimit)||data.miterLimit<=0) throw new Error(`miterLimit >0`);
  if(data.alignment!=='center') throw new Error('Only center alignment');
  if(!Number.isFinite(data.opacity)||data.opacity<0||data.opacity>1) throw new Error('Stroke opacity range');
}

export function validateEffectData(data){
  if(!data || typeof data.effectType!=='string' || data.effectType.length===0) throw new Error('EffectType must be non-empty');
  if(!data.parameters || typeof data.parameters!=='object') throw new Error('Effect parameters must be object');
  for(const [k,v] of Object.entries(data.parameters)){
    if(typeof v!=='number' && typeof v!=='string' && typeof v!=='boolean') throw new Error(`Effect param ${k} invalid type`);
    if(typeof v==='number' && !Number.isFinite(v)) throw new Error(`Effect param ${k} not finite`);
  }
}

export function validateAppearanceGraph(appearance){
  if(!appearance || !Array.isArray(appearance.stack)) throw new Error('Appearance stack missing');
  const seen=new Set(), idToIndex=new Map();
  for(let i=0;i<appearance.stack.length;i++){
    const item=appearance.stack[i];
    if(!item.id) throw new Error(`Item id missing at ${i}`);
    if(seen.has(item.id)) throw new Error(`Duplicate AppearanceItem ID: ${item.id}`);
    seen.add(item.id); idToIndex.set(item.id,i);
    if(item.type==='effect'){
      const inputs=item.inputs;
      if(!Array.isArray(inputs)) throw new Error(`Effect inputs must be array for ${item.id}`);
      const inputSeen=new Set();
      for(const inp of inputs){
        if(inputSeen.has(inp)) throw new Error(`Duplicate input ${inp} in effect ${item.id}`);
        inputSeen.add(inp);
        if(inp===item.id) throw new Error(`Self-reference in effect ${item.id}`);
        if(!idToIndex.has(inp)){
          const existsLater=appearance.stack.slice(i+1).some(it=>it.id===inp);
          if(existsLater) throw new Error(`Forward reference: ${item.id} -> ${inp}`);
          else throw new Error(`Missing input: ${item.id} -> ${inp}`);
        }
      }
    }
  }
  // Cycle DFS
  const graph=new Map();
  for(const item of appearance.stack){
    graph.set(item.id, item.type==='effect'?[...item.inputs]:[]);
  }
  const globalVisited=new Set(), globalRec=new Set();
  function dfsCycle(nodeId){
    if(!globalVisited.has(nodeId)){
      globalVisited.add(nodeId); globalRec.add(nodeId);
      for(const nb of (graph.get(nodeId)||[])){
        if(!globalVisited.has(nb) && dfsCycle(nb)) return true;
        if(globalRec.has(nb)) return true;
      }
    }
    globalRec.delete(nodeId); return false;
  }
  for(const id of seen){ if(dfsCycle(id)) throw new Error(`Cycle detected involving ${id}`); }
}

export function validateAppearanceItem(item, seenSoFar){
  if(!item || typeof item!=='object') throw new Error('AppearanceItem missing');
  if(!item.id || typeof item.id!=='string') throw new Error('AppearanceItem id invalid');
  if(seenSoFar && seenSoFar.has(item.id)) throw new Error(`Duplicate ID ${item.id}`);
  if(typeof item.enabled!=='boolean') throw new Error('enabled must be boolean');
  if(!['fill','stroke','effect'].includes(item.type)) throw new Error(`Invalid type ${item.type}`);
  if(item.parent!==undefined || item.children!==undefined) throw new Error('AppearanceItem must NOT have parent/children');
  if(item.type==='fill') validateFillData(item.data);
  else if(item.type==='stroke') validateStrokeData(item.data);
  else if(item.type==='effect') validateEffectData(item.data);
}

export function validateAppearance(appearance){
  if(!appearance || typeof appearance!=='object') throw new Error('Appearance missing');
  if(!isUUID(appearance.id)) throw new Error(`Invalid AppearanceID ${appearance.id}`);
  if(!Array.isArray(appearance.stack)) throw new Error('Appearance stack must be array');
  const seen=new Set();
  for(const item of appearance.stack){ validateAppearanceItem(item, seen); seen.add(item.id); }
  validateAppearanceGraph(appearance);
}

export class AppearanceStore {
  constructor(){ this.store=new Map(); this.warnings=[]; }
  create(appearance){
    if(!isUUID(appearance.id)) throw new Error(`Invalid AppearanceID ${appearance.id}`);
    validateAppearance(appearance);
    if(this.store.has(appearance.id)) throw new Error(`Duplicate AppearanceID ${appearance.id}`);
    this.store.set(appearance.id, deepClone(appearance));
  }
  createWithId(id, appearance){ if(id!==appearance.id) throw new Error('ID mismatch'); this.create(appearance); }
  get(id){ const a=this.store.get(id); return a?deepClone(a):undefined; }
  has(id){ return this.store.has(id); }
  update(id, appearance){
    if(!isUUID(id)) throw new Error(`Invalid AppearanceID ${id}`);
    validateAppearance(appearance);
    if(!this.store.has(id)) throw new Error(`Appearance not found ${id}`);
    this.store.set(id, deepClone(appearance));
  }
  delete(id, isReferenced){
    if(!isUUID(id)) throw new Error(`Invalid AppearanceID`);
    if(!this.store.has(id)) throw new Error(`Appearance not found`);
    if(isReferenced && isReferenced(id)) throw new Error(`Appearance in use ${id}`);
    this.store.delete(id);
  }
  list(){ return Array.from(this.store.values()).map(a=>deepClone(a)); }
  listIds(){ return Array.from(this.store.keys()); }
  size(){ return this.store.size; }
  clear(){ this.store.clear(); }
  addItem(appearanceId, item, index){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    if(app.stack.some(it=>it.id===item.id)) throw new Error(`Duplicate item ID ${item.id}`);
    const mutable=[...app.stack];
    if(index!==undefined){
      if(index<0||index>mutable.length) throw new Error(`Invalid index ${index}`);
      mutable.splice(index,0,item);
    }else mutable.push(item);
    const newApp={id:app.id, stack:mutable};
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }
  removeItem(appearanceId, itemId){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    const existingIndex=app.stack.findIndex(it=>it.id===itemId);
    if(existingIndex===-1) throw new Error(`Item not found ${itemId}`);
    const newStack=app.stack.filter(it=>it.id!==itemId);
    const warnings=[];
    const newStackMutable=newStack.map(item=>{
      if(item.type==='effect' && item.inputs.includes(itemId)){
        warnings.push({code:'APPEARANCE_INPUT_REMOVED', message:`Input ${itemId} removed from effect ${item.id}, effect disabled`, affectedItemId:item.id, removedInputId:itemId});
        return {...item, enabled:false};
      }
      return item;
    });
    // Validate enabled effects still have valid inputs
    for(const it of newStackMutable){
      if(it.type==='effect' && it.enabled){
        for(const inp of it.inputs){
          if(!newStackMutable.some(s=>s.id===inp)) throw new Error(`Enabled effect ${it.id} has missing input ${inp}`);
        }
      }
    }
    const newApp={id:app.id, stack:newStackMutable};
    this.store.set(appearanceId, deepClone(newApp));
    this.warnings.push(...warnings);
    return warnings;
  }
  moveItem(appearanceId, itemId, newIndex){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    const oldIndex=app.stack.findIndex(it=>it.id===itemId);
    if(oldIndex===-1) throw new Error('Item not found');
    if(newIndex<0||newIndex>=app.stack.length) throw new Error('Invalid newIndex');
    const mutable=[...app.stack];
    const [item]=mutable.splice(oldIndex,1);
    mutable.splice(newIndex,0,item);
    const newApp={id:app.id, stack:mutable};
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }
  updateItem(appearanceId, itemId, data){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    const index=app.stack.findIndex(it=>it.id===itemId);
    if(index===-1) throw new Error('Item not found');
    const existing=app.stack[index];
    const updated={...existing, data:{...existing.data, ...data}};
    const mutable=[...app.stack];
    mutable[index]=updated;
    const newApp={id:app.id, stack:mutable};
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }
  enableItem(appearanceId, itemId){ this.setItemEnabled(appearanceId,itemId,true); }
  disableItem(appearanceId, itemId){ this.setItemEnabled(appearanceId,itemId,false); }
  setItemEnabled(appearanceId, itemId, enabled){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    const index=app.stack.findIndex(it=>it.id===itemId);
    if(index===-1) throw new Error('Item not found');
    const mutable=[...app.stack];
    mutable[index]={...mutable[index], enabled};
    const newApp={id:app.id, stack:mutable};
    validateAppearance(newApp);
    this.store.set(appearanceId, deepClone(newApp));
  }
  getItem(appearanceId, itemId){
    const app=this.store.get(appearanceId);
    if(!app) return undefined;
    const item=app.stack.find(it=>it.id===itemId);
    return item?deepClone(item):undefined;
  }
  getItems(appearanceId){
    const app=this.store.get(appearanceId);
    if(!app) throw new Error('Appearance not found');
    return deepClone([...app.stack]);
  }
  getWarnings(){ return [...this.warnings]; }
  clearWarnings(){ this.warnings=[]; }
}

export function resolveAppearance(appearance){
  const fills=[], strokes=[], effects=[];
  for(const item of appearance.stack){
    if(item.type==='fill') fills.push({id:item.id, color:item.data.color, opacity:item.data.opacity, enabled:item.enabled});
    else if(item.type==='stroke') strokes.push({id:item.id, color:item.data.color, width:item.data.width, cap:item.data.cap, join:item.data.join, miterLimit:item.data.miterLimit, alignment:item.data.alignment, opacity:item.data.opacity, enabled:item.enabled});
    else if(item.type==='effect') effects.push({id:item.id, effectType:item.data.effectType, parameters:item.data.parameters, inputs:item.inputs, enabled:item.enabled});
  }
  return {id:appearance.id, fills: Object.freeze(fills), strokes: Object.freeze(strokes), effects: Object.freeze(effects)};
}

export function serializeAppearance(appearance){
  const obj={id:appearance.id, stack:appearance.stack.map(item=>({id:item.id, type:item.type, enabled:item.enabled, inputs:item.type==='effect'?[...item.inputs]:undefined, data:item.data}))};
  return JSON.stringify(obj);
}

export function deserializeAppearance(json){
  const parsed=JSON.parse(json);
  if(!parsed.id || !Array.isArray(parsed.stack)) throw new Error('Invalid serialized Appearance');
  const appearance={id:parsed.id, stack:parsed.stack.map(it=>({id:it.id, type:it.type, enabled:it.enabled, inputs:it.inputs, data:it.data}))};
  validateAppearance(appearance);
  return appearance;
}

export function computeStrokeBBox(worldBBox, strokeWidth){
  if(strokeWidth===0) return {...worldBBox};
  const half=strokeWidth/2;
  return {minX:worldBBox.minX-half, minY:worldBBox.minY-half, maxX:worldBBox.maxX+half, maxY:worldBBox.maxY+half};
}
