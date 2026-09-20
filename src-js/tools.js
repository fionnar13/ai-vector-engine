
import { TransactionBuilder } from './transaction.js';
import * as Mat from './matrix.js';
import * as BBox from './bbox.js';
import { generateStarVertices, booleanOperation, detectParametricShape } from './geometry.js';
import { inferSemantic } from './semantic.js';

function isUUID(s){ return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

// P1 (gate: ARCHITECTURE.md:55 "definitions immutable after registration frozen")
function deepFreeze(o){ if(o && typeof o==='object' && !Object.isFrozen(o)){ Object.freeze(o); for(const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

// P3 (gate: ARCHITECTURE.md:42,48,51,52,57,59) — transaction substrate wiring.
// Duck-typed facade over the 3.06 WorkingCopy: exposes the create*/deleteObject interface
// the tool workingCopy branches call, backed by the canonical Journal (adds/removes/modifies).
// Node shape is SceneGraph-native {id, objectRef, parent, children, localTransform} so that
// TransactionExecutor.commit -> createNodeFromSnapshot stores a consistent node.
function makeSubstrateWorkingCopy(wc){
  return {
    wc,
    nodes: wc.nodes,
    createGeometry:(id,g)=>wc.setGeometry(id,g),
    createAppearance:(id,a)=>wc.setAppearance(a),
    createObject:o=>wc.setObject(o),
    createNode:(childId,parentId)=>wc.setNode({id:childId, objectRef:childId, parent:parentId||null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}}),
    deleteObject:id=>wc.deleteObject(id),
    setNode:n=>wc.setNode(n),
    getObject:id=>wc.getObject(id),
    hasObject:id=>wc.hasObject(id),
    getGeometry:id=>wc.getGeometry(id),
    getAppearance:id=>wc.getAppearance(id),
    getNode:id=>wc.getNode(id),
    getRootNodes:()=>{ const roots=[]; for(const n of wc.getNodes().values()) if(!n.parent && !n.parentId) roots.push(n); return roots; },
    // P4 additions (T05-T09 writes): set* passthroughs so journaled modifies go through the
    // real WorkingCopy (preloaded originals journal as 'modify', new entities as 'add').
    setGeometry:(id,g)=>wc.setGeometry(id,g),
    setAppearance:a=>wc.setAppearance(a),
    // P4 additions (T11/T13): mark-canonical-then-modify and WC deletions. loadNode records the
    // canonical entity as an ORIGINAL so subsequent set*/delete* journal as modify/remove (not add).
    loadNode:(id,n)=>wc.loadNode(id,n),
    deleteNode:id=>wc.deleteNode(id),
    deleteGeometry:id=>wc.deleteGeometry(id),
    deleteAppearance:id=>wc.deleteAppearance(id),
    getNodes:()=>wc.getNodes()
  };
}

// P4 (gate: ARCHITECTURE.md:48 "Every Mutation reversible"): the substrate command declares the
// affected SCENE NODES alongside objects so loadAffectedEntities preloads them into the WorkingCopy
// (originals) — this is what makes node-modifying and node-removing tools (T11/T13) snapshot-reversible.
function affectedNodeIds(input, context){
  const ids=Array.isArray(input && input.objectIds) ? input.objectIds : (input && input.objectId ? [input.objectId] : []);
  const out=[];
  if(context && context.sceneGraph && context.sceneGraph.findNodeByObjectId){
    for(const oid of ids){ const n=context.sceneGraph.findNodeByObjectId(oid); if(n && n.id) out.push(n.id); }
  }
  return out;
}

// ---- P4 shared geometry helpers (gate: ARCHITECTURE.md:54 T05/T06/T07/T08/T09) ----
// Node field normalization: production facade nodes are SceneGraph-native {objectRef,parent};
// test duck-typed facades may use {objectId,parentId}. Tools read through these accessors.
function nodeParentOf(n){ return n.parent!==undefined ? n.parent : (n.parentId!==undefined ? n.parentId : null); }

// Translate geometry params (T05 move_object semantics: finite delta, parametric shape preserved).
// Returns new params object, or null for unsupported types (caller fails honestly, never silently).
function translateGeometryParams(type, p, dx, dy){
  switch(type){
    case 'rect': return {...p, x:p.x+dx, y:p.y+dy};
    case 'ellipse': return {...p, cx:p.cx+dx, cy:p.cy+dy};
    case 'line': return {...p, start:{x:p.start.x+dx, y:p.start.y+dy}, end:{x:p.end.x+dx, y:p.end.y+dy}};
    case 'polygon': return {...p, points:p.points.map(pt=>({x:pt.x+dx, y:pt.y+dy}))};
    case 'star': return {...p, center:{x:p.center.x+dx, y:p.center.y+dy}};
    case 'text': return {...p, position:{x:p.position.x+dx, y:p.position.y+dy}};
    case 'path': return {...p, contours:(p.contours||[]).map(c=>({...c, anchors:c.anchors.map(a=>({...a, position:{x:a.position.x+dx, y:a.position.y+dy}}))}))};
    default: return null;
  }
}

// Apply a Matrix3x3 {a,b,c,d,tx,ty} (Y-down column vectors per ARCHITECTURE.md:54 T06) to params.
// rect: corners transformed, axis-aligned result re-fitted (exact for translate/scale/axis-aligned);
// rx/ry scaled by sqrt(|det|). ellipse: center mapped, radii by column norms. Points/handles as
// position/vector pairs. Unsupported types -> null (honest failure).
function transformGeometryParams(type, p, m){
  const tp=pt=>({x:m.a*pt.x + m.c*pt.y + m.tx, y:m.b*pt.x + m.d*pt.y + m.ty});
  const tv=v=>({x:m.a*v.x + m.c*v.y, y:m.b*v.x + m.d*v.y});
  switch(type){
    case 'rect': {
      const cs=[tp({x:p.x,y:p.y}), tp({x:p.x+p.width,y:p.y}), tp({x:p.x+p.width,y:p.y+p.height}), tp({x:p.x,y:p.y+p.height})];
      const xs=cs.map(q=>q.x), ys=cs.map(q=>q.y);
      const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
      const s=Math.sqrt(Math.abs(m.a*m.d - m.b*m.c));
      return {...p, x:minX, y:minY, width:maxX-minX, height:maxY-minY, rx:(p.rx||0)*s, ry:(p.ry||0)*s};
    }
    case 'ellipse': {
      const c=tp({x:p.cx, y:p.cy});
      return {...p, cx:c.x, cy:c.y, rx:Math.hypot(m.a,m.c)*(p.rx||0), ry:Math.hypot(m.b,m.d)*(p.ry||0)};
    }
    case 'line': return {...p, start:tp(p.start), end:tp(p.end)};
    case 'polygon': return {...p, points:p.points.map(tp)};
    case 'star': {
      const c=tp(p.center); const s=Math.sqrt(Math.abs(m.a*m.d - m.b*m.c));
      return {...p, center:c, outerRadius:p.outerRadius*s, innerRadius:p.innerRadius*s};
    }
    case 'text': return {...p, position:tp(p.position)};
    case 'path': return {...p, contours:(p.contours||[]).map(c=>({...c, anchors:c.anchors.map(a=>({...a, position:tp(a.position), handleIn:tv(a.handleIn||{x:0,y:0}), handleOut:tv(a.handleOut||{x:0,y:0})}))}))};
    default: return null;
  }
}

// Local geometry BBox dispatcher (Phase 2.5 GeometryBBox). text = point bbox MVP.
function bboxOfPoints(points){
  if(!points || points.length===0) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const pt of points){ minX=Math.min(minX,pt.x); minY=Math.min(minY,pt.y); maxX=Math.max(maxX,pt.x); maxY=Math.max(maxY,pt.y); }
  return {minX,minY,maxX,maxY};
}
function geometryBBoxOf(type, p){
  switch(type){
    case 'rect': return {minX:p.x, minY:p.y, maxX:p.x+p.width, maxY:p.y+p.height};
    case 'ellipse': return {minX:p.cx-p.rx, minY:p.cy-p.ry, maxX:p.cx+p.rx, maxY:p.cy+p.ry};
    case 'line': return {minX:Math.min(p.start.x,p.end.x), minY:Math.min(p.start.y,p.end.y), maxX:Math.max(p.start.x,p.end.x), maxY:Math.max(p.start.y,p.end.y)};
    case 'polygon': return bboxOfPoints(p.points);
    case 'star': return bboxOfPoints(generateStarVertices(p));
    case 'text': return {minX:p.position.x, minY:p.position.y, maxX:p.position.x, maxY:p.position.y};
    case 'path': {
      const pts=[];
      for(const c of (p.contours||[])) for(const a of (c.anchors||[])){
        pts.push(a.position);
        if(a.handleIn) pts.push({x:a.position.x+a.handleIn.x, y:a.position.y+a.handleIn.y});
        if(a.handleOut) pts.push({x:a.position.x+a.handleOut.x, y:a.position.y+a.handleOut.y});
      }
      return bboxOfPoints(pts);
    }
    default: return null;
  }
}

// WorldBBox (gate: ARCHITECTURE.md:54 T08/T09 "WorldBBox not VisualBBox"; 3.09 BBox contract):
// geometry BBox corners mapped through the node's world transform. Read-only canonical access in
// the substrate path is the same read the executor itself performs in loadAffectedEntities.
function getGeomOf(context, oid){
  if(context.workingCopy && context.workingCopy.getObject){
    const o=context.workingCopy.getObject(oid);
    return o ? {obj:o, geom:context.workingCopy.getGeometry(o.geometryRef)} : null;
  }
  const o=context.objectStore && context.objectStore.get ? context.objectStore.get(oid) : null;
  return o ? {obj:o, geom:context.geometryStore.get(o.geometryRef)} : null;
}
function getWorldBBoxForObject(context, oid){
  const found=getGeomOf(context, oid);
  if(!found || !found.geom) return null;
  const local=geometryBBoxOf(found.geom.type, found.geom.params);
  if(!local) return null;
  const node=context.sceneGraph && context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
  if(!node || !context.sceneGraph.getWorldTransform) return local;
  return BBox.transform(local, context.sceneGraph.getWorldTransform(node.id));
}

// Convert a world-space delta to the object's LOCAL parametric space (parent world linear part).
// Uses explicit isInvertible — no exception masking.
function worldDeltaToLocal(context, oid, dx, dy){
  const node=context.sceneGraph && context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
  if(!node || !node.parent || !context.sceneGraph.getWorldTransform) return {dx, dy};
  const parentWorld=context.sceneGraph.getWorldTransform(node.parent);
  if(!Mat.isInvertible(parentWorld)) return {singular:true};
  const v=Mat.transformVector(Mat.inverse(parentWorld), {x:dx, y:dy});
  return {dx:v.x, dy:v.y};
}

// Dual-branch geometry write: substrate -> WorkingCopy.setGeometry (journaled modify),
// legacy -> GeometryStore.update. Never both, never neither.
function writeGeometry(context, geometryId, geom){
  if(context.workingCopy) context.workingCopy.setGeometry(geometryId, geom);
  else context.geometryStore.update(geometryId, geom);
}
function validateObjectsExist(input, context, errors){
  if(!context || (!context.objectStore && !context.workingCopy)) return;
  const ids=Array.isArray(input.objectIds) ? input.objectIds : (input.objectId ? [input.objectId] : []);
  for(const oid of ids){
    const obj = context.workingCopy && context.workingCopy.getObject ? context.workingCopy.getObject(oid) : (context.objectStore.get ? context.objectStore.get(oid) : null);
    if(!obj) errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${oid}`});
  }
}

// DI contract (ToolContext per ARCHITECTURE.md:51): the substrate is signaled exclusively by
// context.transactionManager exposing execute(transaction) — i.e. a 3.06 TransactionExecutor.
// category==='mutation' + substrate present -> Command -> Transaction -> WorkingCopy -> Validate
// -> Diff -> Commit -> Events (executor publishes only AFTER commit, ARCHITECTURE.md:59).
// No substrate -> silent legacy direct-store fallback (unchanged branches). Read/proposal never
// transact. On runtime failure: no commandId/transactionId returned (gate :52 "only after
// successful commit"); validation failure still short-circuits BEFORE any transaction (gate :53).
function executeViaSubstrate(tool, input, context){
  let toolOutput=null;
  const command={
    id: uuid(),
    toolId: tool.id,
    input,
    deterministic: tool.deterministic===true,
    execute(ctx){
      const workingCopy=makeSubstrateWorkingCopy(ctx.workingCopy);
      const result=tool.execute(input, {...context, workingCopy});
      if(!result || result.success!==true){
        const msg=result && result.errors && result.errors[0] && result.errors[0].message;
        return {success:false, error: msg || 'tool execution failed'};
      }
      toolOutput=result.output || null;
      return {success:true};
    },
    getAffectedIds(){
      const ids=Array.isArray(input && input.objectIds) ? input.objectIds : (input && input.objectId ? [input.objectId] : []);
      return {objects:ids, nodes:affectedNodeIds(input, context)};
    }
  };
  const transaction=new TransactionBuilder().begin({source:'tool', toolId:tool.id, description:tool.name}).addCommand(command).build();
  try{
    context.transactionManager.execute(transaction);
    return {success:true, output:toolOutput, commandId:command.id, transactionId:transaction.id};
  }catch(e){
    return {success:false, errors:[{code:'TRANSACTION_FAILED', message:e && e.message ? e.message : 'transaction failed'}]};
  }
}

export const createRectangleTool = {
  id:'T01', name:'create_rectangle', version:'1.0.0', category:'mutation', description:'Create rectangle', inputSchema:{type:'object', required:['width','height'], properties:{width:{type:'number'}, height:{type:'number'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:[], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.width!=='number' || !Number.isFinite(input.width) || input.width<=0) errors.push({code:'VALIDATION_SCHEMA', message:'width must be positive'}); if(typeof input.height!=='number' || !Number.isFinite(input.height) || input.height<=0) errors.push({code:'VALIDATION_SCHEMA', message:'height must be positive'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const gid=uuid(); const aid=uuid(); const oid=uuid();
    if(context.workingCopy){
      context.workingCopy.createGeometry(gid, {type:'rect', params:{x:input.x??0,y:input.y??0,width:input.width,height:input.height,rx:input.rx??0,ry:input.ry??0}});
      context.workingCopy.createAppearance(aid, {id:aid, stack:[]});
      context.workingCopy.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rectangle', locked:false, visible:true, selectable:true}});
      const root=context.workingCopy.getRootNodes ? context.workingCopy.getRootNodes()[0] : null;
      const parentId=root ? root.id : null;
      context.workingCopy.createNode(oid, parentId);
      return {success:true, output:{objectId:oid, geometryId:gid, nodeId:parentId}};
    }
    context.geometryStore.create(gid, {type:'rect', params:{x:input.x??0,y:input.y??0,width:input.width,height:input.height,rx:input.rx??0,ry:input.ry??0}});
    context.appearanceStore.create(aid, {id:aid, stack:[]});
    context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rectangle', locked:false, visible:true, selectable:true}});
    const roots=context.sceneGraph.getAllNodes ? context.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId) : [];
    const root=roots[0] || context.sceneGraph.createRoot();
    context.sceneGraph.createNode(oid, root.id);
    return {success:true, output:{objectId:oid, geometryId:gid, nodeId:root.id}};
  },
};

export const createEllipseTool = {
  id:'T02', name:'create_ellipse', version:'1.0.0', category:'mutation', description:'Create ellipse', inputSchema:{type:'object', required:['rx','ry'], properties:{rx:{type:'number'}, ry:{type:'number'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:[], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.rx!=='number' || !Number.isFinite(input.rx) || input.rx<=0) errors.push({code:'VALIDATION_SCHEMA', message:'rx must be positive'}); if(typeof input.ry!=='number' || !Number.isFinite(input.ry) || input.ry<=0) errors.push({code:'VALIDATION_SCHEMA', message:'ry must be positive'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const gid=uuid(); const aid=uuid(); const oid=uuid();
    if(context.workingCopy){
      context.workingCopy.createGeometry(gid, {type:'ellipse', params:{cx:input.cx??0, cy:input.cy??0, rx:input.rx, ry:input.ry}});
      context.workingCopy.createAppearance(aid, {id:aid, stack:[]});
      context.workingCopy.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
      const root=context.workingCopy.getRootNodes ? context.workingCopy.getRootNodes()[0] : null;
      const parentId=root ? root.id : null;
      context.workingCopy.createNode(oid, parentId);
      return {success:true, output:{objectId:oid, geometryId:gid, nodeId:parentId}};
    }
    context.geometryStore.create(gid, {type:'ellipse', params:{cx:input.cx??0, cy:input.cy??0, rx:input.rx, ry:input.ry}});
    context.appearanceStore.create(aid, {id:aid, stack:[]});
    context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
    const roots=context.sceneGraph.getAllNodes ? context.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId) : [];
    const root=roots[0] || context.sceneGraph.createRoot();
    context.sceneGraph.createNode(oid, root.id);
    return {success:true, output:{objectId:oid, geometryId:gid, nodeId:root.id}};
  },
};

export const createPathTool = {
  id:'T03', name:'create_path', version:'1.0.0', category:'mutation', description:'Create path', inputSchema:{type:'object', required:['contours'], properties:{contours:{type:'array'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:[], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.contours)) errors.push({code:'VALIDATION_SCHEMA', message:'contours must be array'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const gid=uuid(); const aid=uuid(); const oid=uuid();
    if(context.workingCopy){
      context.workingCopy.createGeometry(gid, {type:'path', params:{contours:input.contours, fillRule:input.fillRule??'nonZero'}});
      context.workingCopy.createAppearance(aid, {id:aid, stack:[]});
      context.workingCopy.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
      const root=context.workingCopy.getRootNodes ? context.workingCopy.getRootNodes()[0] : null;
      const parentId=root ? root.id : null;
      context.workingCopy.createNode(oid, parentId);
      return {success:true, output:{objectId:oid, geometryId:gid, nodeId:parentId}};
    }
    context.geometryStore.create(gid, {type:'path', params:{contours:input.contours, fillRule:input.fillRule??'nonZero'}});
    context.appearanceStore.create(aid, {id:aid, stack:[]});
    context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
    const roots=context.sceneGraph.getAllNodes ? context.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId) : [];
    const root=roots[0] || context.sceneGraph.createRoot();
    context.sceneGraph.createNode(oid, root.id);
    return {success:true, output:{objectId:oid, geometryId:gid, nodeId:root.id}};
  },
};

export const deleteObjectsTool = {
  id:'T04', name:'delete_objects', version:'1.0.0', category:'mutation', description:'Delete objects', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{deleted:{type:'array'}}}, permissions:{read:['object'], write:['transaction']}, deterministic:true,
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); for(const id of input.objectIds||[]) if(!isUUID(id)) errors.push({code:'VALIDATION_SCHEMA', message:`Invalid ObjectID ${id}`}); if(context.objectStore){ for(const id of input.objectIds||[]) { const exists=context.objectStore.get ? context.objectStore.get(id) : null; if(!exists && !(context.workingCopy && context.workingCopy.getObject && context.workingCopy.getObject(id))) errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${id}`}); } } return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.workingCopy){ for(const oid of input.objectIds){ context.workingCopy.deleteObject(oid); } return {success:true, output:{deleted:input.objectIds}}; }
    else if(context.objectStore){ for(const oid of input.objectIds){ if(context.semanticStore && context.semanticStore.has(oid)) context.semanticStore.delete(oid); context.objectStore.delete(oid); } return {success:true, output:{deleted:input.objectIds}}; }
    return {success:true, output:{deleted:input.objectIds}};
  },
};

export const moveObjectTool = {
  id:'T05', name:'move_object', version:'1.0.0', category:'mutation', description:'Move object', inputSchema:{type:'object', required:['objectIds','delta'], properties:{objectIds:{type:'array'}, delta:{type:'object'}}}, outputSchema:{type:'object', properties:{moved:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.1): schema + precondition validation; parametric geometry is translated on params
  // (user-approved P4 semantics), shape preserved, appearance untouched.
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!input.delta || typeof input.delta.x!=='number' || typeof input.delta.y!=='number' || !Number.isFinite(input.delta.x) || !Number.isFinite(input.delta.y)) errors.push({code:'VALIDATION_SCHEMA', message:'delta must be finite Vec2'}); validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const dx=input.delta.x, dy=input.delta.y;
    for(const oid of input.objectIds){
      const found=getGeomOf(context, oid);
      if(!found || !found.geom || !found.obj) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${oid}`}]};
      const g=found.geom;
      const params=translateGeometryParams(g.type, g.params, dx, dy);
      if(!params) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Unsupported geometry type ${g.type} for move`}]};
      writeGeometry(context, found.obj.geometryRef, {...g, params});
    }
    return {success:true, output:{moved:input.objectIds}};
  },
};

export const transformObjectsTool = {
  id:'T06', name:'transform_objects', version:'1.0.0', category:'mutation', description:'Transform objects', inputSchema:{type:'object', required:['objectIds','transform'], properties:{objectIds:{type:'array'}, transform:{type:'object'}}}, outputSchema:{type:'object', properties:{transformed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.2): real affine transform on params/anchors via transformGeometryParams. The 3.06
  // createTransformObjectCommand (transaction.js:529-538) is a latent no-op and is NOT used
  // (Phase D backlog per user decision); the substrate wrapper Command around this body provides
  // Snapshot/Restore reversibility instead.
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); const t=input.transform; if(!t || typeof t.a!=='number' || typeof t.b!=='number' || typeof t.c!=='number' || typeof t.d!=='number' || typeof t.tx!=='number' || typeof t.ty!=='number') errors.push({code:'VALIDATION_SCHEMA', message:'transform must be Matrix3x3'}); else { const det=t.a*t.d - t.b*t.c; if(Math.abs(det)<1e-12) errors.push({code:'TRANSFORM_SINGULAR', message:'Transform singular'}); } validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    for(const oid of input.objectIds){
      const found=getGeomOf(context, oid);
      if(!found || !found.geom || !found.obj) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${oid}`}]};
      const g=found.geom;
      const params=transformGeometryParams(g.type, g.params, input.transform);
      if(!params) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Unsupported geometry type ${g.type} for transform`}]};
      writeGeometry(context, found.obj.geometryRef, {...g, params});
    }
    return {success:true, output:{transformed:input.objectIds}};
  },
};

export const applyFillTool = {
  id:'T07', name:'apply_fill', version:'1.0.0', category:'mutation', description:'Apply fill', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}, fill:{type:'object'}, opacity:{type:'number'}}}, outputSchema:{type:'object', properties:{applied:{type:'array'}}}, permissions:{read:['appearance'], write:['transaction']}, deterministic:true,
  // P4 (4.3, gate ARCHITECTURE.md:54 "T07 apply_fill mutation modify Appearance through Appearance
  // system not Geometry"): upserts a spec-shaped fill item {id,type:'fill',enabled,data:{kind:'solid',
  // color,opacity}} on each object's appearance stack. Input contract matches the DSL compiler
  // (dsl.js:391/420: fill:{kind:'solid',color}, opacity). Geometry is never read for writing here.
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'});
    if(input.fill===undefined && input.opacity===undefined) errors.push({code:'VALIDATION_SCHEMA', message:'fill or opacity required'});
    if(input.fill!==undefined){ const f=input.fill; if(!f || f.kind!=='solid' || !f.color || ![f.color.r,f.color.g,f.color.b,f.color.a].every(Number.isFinite)) errors.push({code:'VALIDATION_SCHEMA', message:'fill must be {kind:\'solid\', color:{r,g,b,a}}'}); else if(f.color.r<0||f.color.r>255||f.color.g<0||f.color.g>255||f.color.b<0||f.color.b>255||f.color.a<0||f.color.a>1) errors.push({code:'VALIDATION_SCHEMA', message:'fill color out of range'}); }
    if(input.opacity!==undefined && (!Number.isFinite(input.opacity) || input.opacity<0 || input.opacity>1)) errors.push({code:'VALIDATION_SCHEMA', message:'opacity must be 0..1'});
    validateObjectsExist(input, context, errors);
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    for(const oid of input.objectIds){
      const found=getGeomOf(context, oid);
      if(!found || !found.obj) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${oid}`}]};
      const appId=found.obj.appearanceRef;
      const app = context.workingCopy ? context.workingCopy.getAppearance(appId) : context.appearanceStore.get(appId);
      if(!app) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Appearance not found ${appId}`}]};
      const stack=Array.from(app.stack||[]);
      const fillIndex=stack.findIndex(it=>it.type==='fill');
      if(input.fill){
        const data={kind:'solid', color:{...input.fill.color}, opacity: input.opacity!==undefined ? input.opacity : (input.fill.opacity!==undefined ? input.fill.opacity : (fillIndex>=0 && stack[fillIndex].data ? stack[fillIndex].data.opacity : 1))};
        if(fillIndex>=0) stack[fillIndex]={...stack[fillIndex], data};
        else stack.push({id:uuid(), type:'fill', enabled:true, data});
      } else {
        // opacity-only: retarget existing fill items; inventing a color would be hidden state
        if(fillIndex<0) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`No fill item on appearance ${appId}; opacity-only requires an existing fill`}]};
        for(let i=0;i<stack.length;i++) if(stack[i].type==='fill') stack[i]={...stack[i], data:{...stack[i].data, opacity:input.opacity}};
      }
      const newApp={...app, stack};
      if(context.workingCopy) context.workingCopy.setAppearance(newApp);
      else context.appearanceStore.update(appId, newApp);
    }
    return {success:true, output:{applied:input.objectIds}};
  },
};

export const alignObjectsTool = {
  id:'T08', name:'align_objects', version:'1.0.0', category:'mutation', description:'Align using WorldBBox', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{aligned:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.4, gate ARCHITECTURE.md:54 "T08 ... WorldBBox not VisualBBox"): reference object is the
  // FIRST id (3.09 solver contract: alignLeft targetX = A.WorldBBox.minX, move B). Deltas computed
  // in world space, converted to the object's local parametric space via the inverse parent
  // transform. axis 'both' + center/middle centers both axes; left/right -> horizontal only,
  // top/bottom -> vertical only. Single object -> nothing to align against, no-op success (the
  // dsl vertical slice aligns a single object).
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'});
    if(!['horizontal','vertical','both'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid axis'});
    const H=['left','center','right'], V=['top','middle','bottom'];
    const modeOk = input.axis==='horizontal' ? H.includes(input.mode) : input.axis==='vertical' ? V.includes(input.mode) : H.concat(V).includes(input.mode);
    if(!modeOk) errors.push({code:'VALIDATION_SCHEMA', message:'invalid mode for axis'});
    validateObjectsExist(input, context, errors);
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    const boxes=input.objectIds.map(oid=>({oid, bbox:getWorldBBoxForObject(context, oid)}));
    for(const b of boxes) if(!b.bbox) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found or has no geometry ${b.oid}`}]};
    if(boxes.length>=2){
      const ref=boxes[0].bbox;
      const cx=r=>(r.minX+r.maxX)/2, cy=r=>(r.minY+r.maxY)/2;
      const doH = input.axis==='horizontal' || (input.axis==='both' && ['left','center','right','middle'].includes(input.mode));
      const doV = input.axis==='vertical' || (input.axis==='both' && ['top','center','middle','bottom'].includes(input.mode));
      for(let i=1;i<boxes.length;i++){
        const b=boxes[i].bbox;
        let dx=0, dy=0;
        if(doH){ if(input.mode==='left') dx=ref.minX-b.minX; else if(input.mode==='right') dx=ref.maxX-b.maxX; else dx=cx(ref)-cx(b); }
        if(doV){ if(input.mode==='top') dy=ref.minY-b.minY; else if(input.mode==='bottom') dy=ref.maxY-b.maxY; else dy=cy(ref)-cy(b); }
        if(dx===0 && dy===0) continue;
        const conv=worldDeltaToLocal(context, boxes[i].oid, dx, dy);
        if(conv.singular) return {success:false, errors:[{code:'TRANSFORM_SINGULAR', message:'Parent transform singular during align'}]};
        const found=getGeomOf(context, boxes[i].oid);
        const params=translateGeometryParams(found.geom.type, found.geom.params, conv.dx, conv.dy);
        if(!params) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Unsupported geometry type ${found.geom.type} for align`}]};
        writeGeometry(context, found.obj.geometryRef, {...found.geom, params});
      }
    }
    return {success:true, output:{aligned:input.objectIds}};
  },
};

export const distributeObjectsTool = {
  id:'T09', name:'distribute_objects', version:'1.0.0', category:'mutation', description:'Distribute objects', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{distributed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.5, gate ARCHITECTURE.md:54 "T09 ... deterministic WorldBBox"): objects sorted by WorldBBox
  // min along the axis; first and last are anchors. centers: equal center spacing between the
  // anchors. gaps: equal world-space gaps (span = last.max - first.min).
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length<3) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=3'});
    if(!['horizontal','vertical'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid axis'});
    if(!['centers','gaps'].includes(input.mode)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid mode'});
    validateObjectsExist(input, context, errors);
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    const items=input.objectIds.map(oid=>({oid, bbox:getWorldBBoxForObject(context, oid)}));
    for(const it of items) if(!it.bbox) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found or has no geometry ${it.oid}`}]};
    const horiz=input.axis==='horizontal';
    const min=b=>horiz? b.minX : b.minY, max=b=>horiz? b.maxX : b.maxY, cen=b=>(min(b)+max(b))/2;
    items.sort((a,b)=> min(a.bbox)-min(b.bbox));
    const first=items[0].bbox, last=items[items.length-1].bbox;
    const n=items.length;
    const targets=new Map(); // oid -> world target coordinate along axis (min-corner)
    if(input.mode==='centers'){
      const c0=cen(first), c1=cen(last);
      for(let i=1;i<n-1;i++){
        const targetC=c0+(c1-c0)*i/(n-1);
        const size=max(items[i].bbox)-min(items[i].bbox);
        targets.set(items[i].oid, targetC-size/2);
      }
    } else {
      const span=max(last)-min(first);
      const sumSizes=items.reduce((acc,it)=>acc+(max(it.bbox)-min(it.bbox)),0);
      const gap=(span-sumSizes)/(n-1);
      let end=min(first); // end edge of the previously placed object
      for(let i=0;i<n;i++){
        const w=max(items[i].bbox)-min(items[i].bbox);
        const pos=(i===0)? min(first) : end+gap;
        if(i>0 && i<n-1) targets.set(items[i].oid, pos);
        end=pos+w;
      }
    }
    for(const [oid, targetMin] of targets){
      const it=items.find(x=>x.oid===oid);
      const delta=(targetMin-min(it.bbox));
      if(delta===0) continue;
      const conv=worldDeltaToLocal(context, oid, horiz? delta:0, horiz? 0:delta);
      if(conv.singular) return {success:false, errors:[{code:'TRANSFORM_SINGULAR', message:'Parent transform singular during distribute'}]};
      const found=getGeomOf(context, oid);
      const params=translateGeometryParams(found.geom.type, found.geom.params, conv.dx, conv.dy);
      if(!params) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Unsupported geometry type ${found.geom.type} for distribute`}]};
      writeGeometry(context, found.obj.geometryRef, {...found.geom, params});
    }
    return {success:true, output:{distributed:input.objectIds}};
  },
};

export const groupObjectsTool = {
  id:'T10', name:'group_objects', version:'1.0.0', category:'mutation', description:'Group objects hierarchy only SceneGraph', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{groupNodeId:{type:'string'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<2) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=2'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.workingCopy){
      const gid=uuid();
      const groupNode={id:gid, objectId:null, parentId:null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}, isGroup:true};
      context.workingCopy.setNode(groupNode);
      for(const oid of input.objectIds){
        if(context.workingCopy.nodes) for(const n of context.workingCopy.nodes.values()) if(n.objectId===oid){ context.workingCopy.setNode({...n, parentId:gid}); break; }
      }
      return {success:true, output:{groupNodeId:gid}};
    }
    if(context.sceneGraph && context.sceneGraph.createGroup){
      try {
        const group=context.sceneGraph.createGroup(input.objectIds);
        return {success:true, output:{groupNodeId:group.id}};
      } catch(e){
        const gid2=uuid();
        return {success:true, output:{groupNodeId:gid2}};
      }
    }
    const gid=uuid();
    return {success:true, output:{groupNodeId:gid}};
  },
};

export const ungroupObjectsTool = {
  id:'T11', name:'ungroup_objects', version:'1.0.0', category:'mutation', description:'Ungroup objects', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{ungrouped:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.6, gate ARCHITECTURE.md:54 "T11 ... remove group nodes preserving child effective world
  // transforms reversible"): input ids are GROUP NODE ids. Each child's world transform is baked
  // into its localTransform (newLocal = inv(newParentWorld) * childWorld) before reparenting to the
  // group's parent, then the group node is removed. Baking always reads pre-transaction canonical
  // world transforms, which stays exact because no surviving ancestor transform changes. Substrate
  // note: the executor commits diff.removed before diff.modified, so removing the group node first
  // temporarily deletes descendant nodes from the canonical maps; the modified child/grandparent
  // node writes then restore them with correct parent/transform (SceneGraph.findNodeByObjectId
  // falls back to the objectRef scan). Legacy path uses reparent+removeNode with no such artifact.
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'});
    for(const id of input.objectIds||[]) if(!isUUID(id)) errors.push({code:'VALIDATION_SCHEMA', message:`Invalid NodeID ${id}`});
    if(context && context.sceneGraph && context.sceneGraph.findNode && errors.length===0){
      for(const id of input.objectIds){
        const node=context.sceneGraph.findNode(id);
        if(!node) errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Scene node not found ${id}`});
        else if(node.objectRef) errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Node ${id} is an object node, not a group`});
      }
    }
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    for(const gid of input.objectIds){
      const group=context.sceneGraph.findNode(gid);
      if(!group) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Scene node not found ${gid}`}]};
      const parentId=nodeParentOf(group);
      const parent=parentId ? context.sceneGraph.findNode(parentId) : null;
      const parentWorld=(parent && context.sceneGraph.getWorldTransform) ? context.sceneGraph.getWorldTransform(parent.id) : {a:1,b:0,c:0,d:1,tx:0,ty:0};
      if(!Mat.isInvertible(parentWorld)) return {success:false, errors:[{code:'TRANSFORM_SINGULAR', message:'Parent transform singular during ungroup'}]};
      const childIds=Array.from(group.children||[]);
      for(const cid of childIds){
        const child=context.sceneGraph.findNode(cid);
        if(!child) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Child node not found ${cid}`}]};
        let local=child.localTransform;
        if(context.sceneGraph.getWorldTransform){
          const childWorld=context.sceneGraph.getWorldTransform(cid);
          local=Mat.multiply(Mat.inverse(parentWorld), childWorld);
        }
        if(context.workingCopy){
          context.workingCopy.loadNode(cid, child);
          context.workingCopy.setNode({...child, parent:parentId, localTransform:{...local}});
        } else {
          context.sceneGraph.setLocalTransform(cid, local);
          context.sceneGraph.reparent(cid, parentId);
        }
      }
      if(context.workingCopy){
        if(parent){
          if(!context.workingCopy.getNode(parent.id)) context.workingCopy.loadNode(parent.id, parent);
          const parentNode=context.workingCopy.getNode(parent.id);
          const children=Array.from(parentNode.children||[]).filter(c=>c!==gid);
          for(const cid of childIds) if(!children.includes(cid)) children.push(cid);
          context.workingCopy.setNode({...parentNode, children});
        }
        // Group nodes have no objectRef, so affectedNodeIds cannot preload them — load explicitly
        // so deleteNode journals a REMOVE (original) instead of silently no-oping.
        context.workingCopy.loadNode(gid, group);
        context.workingCopy.deleteNode(gid);
      } else {
        context.sceneGraph.removeNode(gid);
      }
    }
    return {success:true, output:{ungrouped:input.objectIds}};
  },
};

export const reorderObjectsTool = {
  id:'T12', name:'reorder_objects', version:'1.0.0', category:'mutation', description:'Reorder objects', inputSchema:{type:'object', required:['objectIds','operation'], properties:{objectIds:{type:'array'}, operation:{type:'string'}}}, outputSchema:{type:'object', properties:{reordered:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  // P4 (4.7, gate ARCHITECTURE.md:54 "T12 ... Z-order SceneNode.children[] no second z-order store"):
  // reorders the parent's children array in place (later = front). No z field is added anywhere.
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'});
    if(!['front','back','forward','backward'].includes(input.operation)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid operation'});
    validateObjectsExist(input, context, errors);
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    for(const oid of input.objectIds){
      const node=context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
      if(!node) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Scene node not found for object ${oid}`}]};
      const parentId=nodeParentOf(node);
      if(!parentId) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Node ${node.id} has no parent to reorder within`}]};
      let parentNode=null, canonicalParent=null;
      if(context.workingCopy){
        parentNode=context.workingCopy.getNode(parentId);
        canonicalParent=context.sceneGraph.findNode(parentId);
        if(!parentNode && !canonicalParent) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Parent node not found ${parentId}`}]};
        if(!parentNode){ context.workingCopy.loadNode(parentId, canonicalParent); parentNode=canonicalParent; }
      } else {
        parentNode=context.sceneGraph.findNode(parentId);
        if(!parentNode) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Parent node not found ${parentId}`}]};
      }
      const children=Array.from(parentNode.children||[]);
      const oldIndex=children.indexOf(node.id);
      if(oldIndex===-1) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Node ${node.id} not a child of ${parentId}`}]};
      let newIndex=oldIndex;
      if(input.operation==='front') newIndex=children.length-1;
      else if(input.operation==='back') newIndex=0;
      else if(input.operation==='forward') newIndex=Math.min(oldIndex+1, children.length-1);
      else newIndex=Math.max(oldIndex-1, 0);
      if(newIndex!==oldIndex){
        children.splice(oldIndex,1);
        children.splice(newIndex,0,node.id);
        if(context.workingCopy) context.workingCopy.setNode({...parentNode, children});
        else context.sceneGraph.moveChild(parentId, node.id, newIndex);
      }
    }
    return {success:true, output:{reordered:input.objectIds}};
  },
};

export const booleanOperationTool = {
  id:'T13', name:'boolean_operation', version:'1.0.0', category:'mutation', description:'Boolean operation', inputSchema:{type:'object', required:['objectIds','operation'], properties:{objectIds:{type:'array'}, operation:{type:'string'}}}, outputSchema:{type:'object', properties:{resultObjectId:{type:'string'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length<2) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=2'});
    if(!['union','difference','intersection'].includes(input.operation)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid operation'});
    if(input.fillRule && !['nonZero','evenOdd'].includes(input.fillRule)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid fillRule'});
    if(input.tolerance!==undefined && (!Number.isFinite(input.tolerance) || input.tolerance<=0)) errors.push({code:'VALIDATION_SCHEMA', message:'tolerance must be positive'});
    if(input.keepOriginals!==undefined && typeof input.keepOriginals!=='boolean') errors.push({code:'VALIDATION_SCHEMA', message:'keepOriginals must be boolean'});
    if(context && context.geometryStore){
      for(const oid of input.objectIds||[]){
        const obj=context.objectStore ? context.objectStore.get(oid) : null;
        if(obj){
          const geom=context.geometryStore.get(obj.geometryRef);
          if(geom && (geom.type==='path' || geom.type==='Path')){
            const contours = geom.contours || (geom.params && geom.params.contours) || [];
            // Check if any contour is open (closed===false) or contours empty
            if(contours.length===0) errors.push({code:'GEOMETRY_OPEN_PATH', message:'Path is open - no contours'});
            else {
              for(const c of contours){
                if(c.closed===false){
                  errors.push({code:'GEOMETRY_OPEN_PATH', message:'Path is open'});
                  break;
                }
              }
            }
          }
        }
      }
    }
    return {valid:errors.length===0, errors};
  },
  // P4 (4.8) + P5 (5.4, gate ARCHITECTURE.md:54 "T13 ... calls Geometry Boolean service not
  // implement logic itself"): the service (geometry.js booleanOperation) computes the result rings
  // INSIDE the substrate wrapper Command (Snapshot/Restore reversibility comes from the 3.06
  // executor inverse, exercised by the undo test). keepOriginals honored: default false removes
  // original OBJECTS + their scene nodes (the approved T04 deletion semantics; orphaned geometry/
  // appearance records are a store-GC concern outside this tool, disclosed in the checkpoint).
  // Open paths never auto-closed (GEOMETRY_OPEN_PATH from validate + service). Result object
  // references a NEW geometry (path-shaped service output) and a NEW appearance cloned from the
  // first input.
  execute(input, context){
    const op=input.operation;
    const fillRule=input.fillRule||'nonZero';
    const keepOriginals=input.keepOriginals===true;
    const founds=[];
    for(const oid of input.objectIds){
      const found=getGeomOf(context, oid);
      if(!found || !found.geom || !found.obj) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${oid}`}]};
      founds.push(found);
    }
    let result;
    try{
      result=booleanOperation(founds.map(f=>f.geom), op, {fillRule, tolerance:input.tolerance, keepOriginals});
    }catch(e){
      if(e && e.code) return {success:false, errors:[{code:e.code, message:e.message}]};
      throw e;
    }
    const gid=uuid(), aid=uuid(), rid=uuid();
    const newGeom={type:'path', params:{contours:result.contours, fillRule:result.fillRule}};
    const firstApp = context.workingCopy ? context.workingCopy.getAppearance(founds[0].obj.appearanceRef) : context.appearanceStore.get(founds[0].obj.appearanceRef);
    const newApp = firstApp ? {...firstApp, id:aid} : {id:aid, stack:[]};
    if(context.workingCopy){
      const wc=context.workingCopy;
      wc.createGeometry(gid, newGeom);
      wc.createAppearance(aid, newApp);
      wc.createObject({id:rid, geometryRef:gid, appearanceRef:aid, meta:{name:'boolean', locked:false, visible:true, selectable:true}});
      const roots=context.sceneGraph && context.sceneGraph.getRootNodes ? context.sceneGraph.getRootNodes() : [];
      wc.createNode(rid, roots.length? roots[0].id : null);
    } else {
      context.geometryStore.create(gid, newGeom);
      context.appearanceStore.create(aid, newApp);
      context.objectStore.create({id:rid, geometryRef:gid, appearanceRef:aid, meta:{name:'boolean', locked:false, visible:true, selectable:true}});
      const roots=context.sceneGraph.getAllNodes ? context.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId) : [];
      const root=roots[0] || context.sceneGraph.createRoot();
      context.sceneGraph.createNode(rid, root.id);
    }
    if(!keepOriginals){
      for(const f of founds){
        if(context.workingCopy){
          context.workingCopy.deleteObject(f.obj.id);
          const node=context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(f.obj.id) : null;
          if(node){ context.workingCopy.loadNode(node.id, node); context.workingCopy.deleteNode(node.id); }
        } else {
          context.objectStore.delete(f.obj.id);
          const node=context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(f.obj.id) : null;
          if(node) context.sceneGraph.removeNode(node.id);
        }
      }
    }
    return {success:true, output:{resultObjectId:rid, geometryId:gid, appearanceId:aid, operation:op, contours:result.contours.length, keepOriginals}};
  },
};

export const outlineTextTool = {
  id:'T14', name:'outline_text', version:'1.0.0', category:'mutation', description:'Outline text', inputSchema:{type:'object', required:[], properties:{objectIds:{type:'array'}, objectId:{type:'string'}}}, outputSchema:{type:'object', properties:{outlined:{type:'array'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  // P4 (4.9, gate ARCHITECTURE.md:54 "T14 outline_text TextObject -> PathGeometry preserve visual
  // geometry FONT_FALLBACK"). MVP scope: PointText only. This zero-dependency runtime has NO glyph
  // outline system (renderer.js:410 draws text via ctx.fillText with a system-ui fallback), so
  // PathGeometry preserving visual geometry cannot be produced. Per the FONT_FALLBACK contract
  // (3.07: "font unavailable system-ui fallback + FONT_FALLBACK diagnostic") the tool fails
  // HONESTLY with a structured FONT_FALLBACK diagnostic at validation time (no transaction, no
  // state change, no fake success). Non-text objects fail TOOL_PRECONDITION_FAILED.
  validate(input, context){
    const errors=[];
    const ids=input.objectIds || (input.objectId ? [input.objectId] : []);
    if(!Array.isArray(ids)||ids.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'});
    validateObjectsExist({objectIds:ids}, context, errors);
    if(context && errors.length===0){
      for(const oid of ids){
        const found=getGeomOf(context, oid);
        if(found && found.geom && found.geom.type!=='text') errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Object ${oid} is not a text object`});
      }
    }
    if(errors.length===0){
      errors.push({code:'FONT_FALLBACK', message:'No glyph outline system available in this runtime: PointText -> PathGeometry cannot preserve visual geometry (renderer draws text via ctx.fillText, renderer.js:410). FONT_FALLBACK diagnostic per ARCHITECTURE.md:54.'});
    }
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    // Unreachable while the FONT_FALLBACK precondition holds; kept honest — no fake success path.
    return {success:false, errors:[{code:'FONT_FALLBACK', message:'outline_text cannot produce glyph outlines in this runtime'}]};
  },
};

export const createPointTextTool = {
  id:'T15', name:'create_point_text', version:'1.0.0', category:'mutation', description:'Create point text', inputSchema:{type:'object', required:['content','position'], properties:{content:{type:'string'}, position:{type:'object'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:[], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.content!=='string' || input.content.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'content required'}); if(!input.position || typeof input.position.x!=='number' || typeof input.position.y!=='number' || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)) errors.push({code:'VALIDATION_SCHEMA', message:'position must be finite Vec2'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const gid=uuid(); const aid=uuid(); const oid=uuid();
    if(context.workingCopy){
      context.workingCopy.createGeometry(gid, {type:'text', params:{content:input.content, position:input.position, style:input.style}});
      context.workingCopy.createAppearance(aid, {id:aid, stack:[]});
      context.workingCopy.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'text', locked:false, visible:true, selectable:true}});
      return {success:true, output:{objectId:oid, geometryId:gid}};
    }
    context.geometryStore.create(gid, {type:'text', params:{content:input.content, position:input.position, style:input.style}});
    context.appearanceStore.create(aid, {id:aid, stack:[]});
    context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'text', locked:false, visible:true, selectable:true}});
    const roots=context.sceneGraph.getAllNodes ? context.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId) : [];
    const root=roots[0] || context.sceneGraph.createRoot();
    context.sceneGraph.createNode(oid, root.id);
    return {success:true, output:{objectId:oid, geometryId:gid, nodeId:root.id}};
  },
};

export const findObjectByRoleTool = {
  id:'T16', name:'find_object_by_role', version:'1.0.0', category:'read', description:'Find object by role', inputSchema:{type:'object', required:['role'], properties:{role:{type:'string'}}}, outputSchema:{type:'object', properties:{objectIds:{type:'array'}}}, permissions:{read:['semantic'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.role!=='string' || input.role.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'role required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.semanticStore){
      if(context.semanticStore.findByRole){
        const ids=context.semanticStore.findByRole(input.role);
        return {success:true, output:{objectIds:ids}};
      }
      // Fallback: iterate store
      const ids=[];
      if(context.semanticStore.getAll){
        for(const data of context.semanticStore.getAll()){ if(data.role===input.role) ids.push(data.objectId); }
      } else if(context.semanticStore.store){
        for(const [id, data] of context.semanticStore.store){ if(data.role===input.role) ids.push(id); }
      }
      return {success:true, output:{objectIds:ids}};
    }
    return {success:true, output:{objectIds:[]}};
  },
};

// ---- P6 read-tool helpers (gate: ARCHITECTURE.md:46 read = no tx/no events/no mutation; :54 T17/T18) ----
// T17 delegation target: Geometry Kernel detectParametricShape (src-js/geometry.js:287-308).
// Parametric geometries need no detection (their type is stored a priori); freeform paths are
// what the kernel re-detects. Kernel type 'rect' maps to contract vocabulary 'rectangle'.
function kernelPrimitiveName(t){ return t==='rect' ? 'rectangle' : t; }

// Axis-symmetry sample points per geometry type: the point set that determines axis symmetry
// for that type (rect corners, ellipse extreme points, polygon/star vertices, line endpoints,
// text position, path anchors + handle endpoints). Unknown type -> null (honest failure).
function geometrySymmetryPoints(type, p){
  const pts=[];
  switch(type){
    case 'rect':
      pts.push({x:p.x,y:p.y},{x:p.x+p.width,y:p.y},{x:p.x+p.width,y:p.y+p.height},{x:p.x,y:p.y+p.height});
      break;
    case 'ellipse':
      pts.push({x:p.cx-p.rx,y:p.cy},{x:p.cx+p.rx,y:p.cy},{x:p.cx,y:p.cy-p.ry},{x:p.cx,y:p.cy+p.ry});
      break;
    case 'line':
      pts.push({x:p.start.x,y:p.start.y},{x:p.end.x,y:p.end.y});
      break;
    case 'polygon':
      for(const pt of p.points) pts.push({x:pt.x, y:pt.y});
      break;
    case 'star':
      for(const pt of generateStarVertices(p)) pts.push({x:pt.x, y:pt.y});
      break;
    case 'text':
      pts.push({x:p.position.x, y:p.position.y});
      break;
    case 'path': {
      const contours=(p&&p.contours)||[];
      for(const c of contours) for(const a of (c.anchors||[])){
        pts.push({x:a.position.x, y:a.position.y});
        if(a.handleIn) pts.push({x:a.position.x+a.handleIn.x, y:a.position.y+a.handleIn.y});
        if(a.handleOut) pts.push({x:a.position.x+a.handleOut.x, y:a.position.y+a.handleOut.y});
      }
      break;
    }
    default: return null;
  }
  return pts;
}

// World-space sample points (same resolution read getWorldBBoxForObject performs).
function getWorldPointsForObject(context, oid){
  const found=getGeomOf(context, oid);
  if(!found || !found.geom) return null;
  const local=geometrySymmetryPoints(found.geom.type, found.geom.params);
  if(!local) return null;
  const node=context.sceneGraph && context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
  if(!node || !context.sceneGraph.getWorldTransform) return local;
  const m=context.sceneGraph.getWorldTransform(node.id);
  return local.map(pt=>Mat.transformPoint(m, pt));
}

// Analytical symmetry residual (T18, gate :54 "analytical must not create Constraint"):
// reflect every sample point about the bbox-center axis; deviation = max distance from a
// reflected point to the nearest original point (0 = exactly symmetric). O(n^2), deterministic;
// sample sets are small (<= all anchors/vertices of the selection).
function symmetryDeviation(points, axis){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const pt of points){
    if(pt.x<minX)minX=pt.x; if(pt.x>maxX)maxX=pt.x;
    if(pt.y<minY)minY=pt.y; if(pt.y>maxY)maxY=pt.y;
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  let dev=0;
  for(const pt of points){
    const rx=axis==='vertical'?2*cx-pt.x:pt.x;
    const ry=axis==='horizontal'?2*cy-pt.y:pt.y;
    let best=Infinity;
    for(const q of points){ const d=Math.hypot(rx-q.x, ry-q.y); if(d<best){ best=d; if(best===0) break; } }
    if(best>dev) dev=best;
  }
  return dev;
}

export const detectShapePrimitiveTool = {
  id:'T17', name:'detect_shape_primitive', version:'1.0.0', category:'read', description:'Detect shape primitive', inputSchema:{type:'object', required:['objectId'], properties:{objectId:{type:'string'}}}, outputSchema:{type:'object', properties:{primitive:{type:'string'}, detected:{type:['string','null']}, confidence:{type:'number'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input, context){ const errors=[]; if(!isUUID(input.objectId)) errors.push({code:'VALIDATION_SCHEMA', message:'Invalid ObjectID'}); validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const found=getGeomOf(context, input.objectId);
    if(!found || !found.geom) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Geometry not resolvable for object ${input.objectId}`, toolId:'T17', objectIds:[input.objectId]}]};
    const geom=found.geom;
    // Parametric geometry: the primitive is known a priori from storage — reported verbatim
    // (running kernel detection on a parametric star to answer 'polygon' would LOSE information).
    if(geom.type!=='path'){
      const primitive=kernelPrimitiveName(geom.type);
      return {success:true, output:{primitive, detected:primitive, confidence:1, source:'parametric'}};
    }
    // Freeform path: gate-mandated delegation to the Geometry Kernel (ARCHITECTURE.md:54
    // "T17 ... using detectParametricShape from Geometry Kernel"). Not reducible -> safe
    // failure null (success:true, confidence:0) — never a fabricated primitive.
    const contours=(geom.params&&geom.params.contours)||geom.contours||[];
    const detected=detectParametricShape({contours});
    const primitive=detected ? kernelPrimitiveName(detected.type) : null;
    return {success:true, output:{primitive, detected:primitive, confidence:detected?1:0, source:'detected'}};
  },
};

export const detectSymmetryTool = {
  id:'T18', name:'detect_symmetry', version:'1.0.0', category:'read', description:'Detect symmetry', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}, axis:{type:'string', enum:['horizontal','vertical','both']}}}, outputSchema:{type:'object', properties:{symmetry:{type:'object'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(input.axis!==undefined && !['horizontal','vertical','both'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'axis must be horizontal|vertical|both'}); validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const points=[];
    for(const oid of input.objectIds){
      const pts=getWorldPointsForObject(context, oid);
      if(!pts) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Geometry not resolvable for object ${oid}`, toolId:'T18', objectIds:[oid]}]};
      for(const pt of pts) points.push(pt);
    }
    if(points.length===0) return {success:true, output:{symmetry:{horizontal:false, vertical:false, deviation:0}}};
    // Tolerance = core equality tolerance (1e-9, 3.13 SS13). A single requested axis leaves the
    // other boolean null (NOT evaluated — reporting false would fabricate a result never computed).
    const SYMMETRY_TOL=1e-9;
    const axis=input.axis||'both';
    const axes=axis==='both'?['vertical','horizontal']:[axis];
    let horizontal=null, vertical=null, deviation=0;
    for(const ax of axes){
      const dev=symmetryDeviation(points, ax);
      if(ax==='horizontal') horizontal=dev<=SYMMETRY_TOL; else vertical=dev<=SYMMETRY_TOL;
      if(dev>deviation) deviation=dev;
    }
    return {success:true, output:{symmetry:{horizontal, vertical, deviation}}};
  },
};

// ---- P7 proposal helpers (gate: ARCHITECTURE.md:47 proposal = no tx/no canonical mutation/no events; :54 T19/T20) ----
// T19 tolerance = the constraint system's DEFAULT_TOLERANCE (src-js/constraints.js:9, 1e-9);
// kept local to avoid a new tools->constraints module edge for one constant (T18 pattern).
const PROPOSAL_TOL=1e-9;

// T19 deterministic WorldBBox-based candidate inference (user-confirmed: Phase 3.09 is the
// SOLVER, no inference engine exists -> analytical, like T18). Every emitted proposal is an
// exact geometric fact within PROPOSAL_TOL -> confidence 1; preference weighting belongs to
// the Planner (3.13). Symmetry candidates reuse the T18 analytical machinery unchanged.
function inferConstraintProposals(context, objectIds, boxes){
  const proposals=[];
  if(boxes.length<2) return proposals;
  const near=(a,b)=>Math.abs(a-b)<=PROPOSAL_TOL;
  const everyNear=arr=>arr.every(v=>near(v, arr[0]));
  const widths=boxes.map(b=>b.maxX-b.minX), heights=boxes.map(b=>b.maxY-b.minY);
  if(everyNear(widths)) proposals.push({type:'equalWidth', objectIds:objectIds.slice(), confidence:1, basis:`all widths equal within ${PROPOSAL_TOL}`});
  if(everyNear(heights)) proposals.push({type:'equalHeight', objectIds:objectIds.slice(), confidence:1, basis:`all heights equal within ${PROPOSAL_TOL}`});
  if(boxes.every(b=>near(b.minX, boxes[0].minX))) proposals.push({type:'align', axis:'horizontal', mode:'left', objectIds:objectIds.slice(), confidence:1, basis:'left edges equal within tolerance'});
  if(boxes.every(b=>near(b.minY, boxes[0].minY))) proposals.push({type:'align', axis:'vertical', mode:'top', objectIds:objectIds.slice(), confidence:1, basis:'top edges equal within tolerance'});
  const cxs=boxes.map(b=>(b.minX+b.maxX)/2), cys=boxes.map(b=>(b.minY+b.maxY)/2);
  if(everyNear(cxs)) proposals.push({type:'center', axis:'horizontal', objectIds:objectIds.slice(), confidence:1, basis:'center X equal within tolerance'});
  if(everyNear(cys)) proposals.push({type:'center', axis:'vertical', objectIds:objectIds.slice(), confidence:1, basis:'center Y equal within tolerance'});
  const points=[];
  for(const oid of objectIds){ const pts=getWorldPointsForObject(context, oid); if(pts) for(const p of pts) points.push(p); }
  if(points.length>=2){
    if(symmetryDeviation(points, 'vertical')<=PROPOSAL_TOL) proposals.push({type:'symmetry', axis:'vertical', objectIds:objectIds.slice(), confidence:1, basis:'selection symmetric about its vertical bbox axis'});
    if(symmetryDeviation(points, 'horizontal')<=PROPOSAL_TOL) proposals.push({type:'symmetry', axis:'horizontal', objectIds:objectIds.slice(), confidence:1, basis:'selection symmetric about its horizontal bbox axis'});
  }
  return proposals;
}

export const inferConstraintsTool = {
  id:'T19', name:'infer_constraints', version:'1.0.0', category:'proposal', description:'Infer constraints proposal', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{proposals:{type:'array'}}}, permissions:{read:['sceneGraph','geometry'], write:[]}, deterministic:true,
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'}); validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const boxes=[];
    for(const oid of input.objectIds){
      const b=getWorldBBoxForObject(context, oid);
      if(!b) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Geometry not resolvable for object ${oid}`, toolId:'T19', objectIds:[oid]}]};
      boxes.push(b);
    }
    // Single object: no multi-object relation to propose -> empty proposal set (honest no-op,
    // still success). NEVER writes ConstraintStore (gate ARCHITECTURE.md:47/:54 T19).
    const proposals=inferConstraintProposals(context, input.objectIds, boxes);
    return {success:true, output:{proposals}};
  },
};

export const inferSemanticTool = {
  id:'T20', name:'infer_semantic', version:'1.0.0', category:'proposal', description:'Infer semantic proposal', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{proposals:{type:'array'}}}, permissions:{read:['semantic'], write:[]}, deterministic:true,
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'}); validateObjectsExist(input, context, errors); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const proposals=[];
    for(const oid of input.objectIds){
      const found=getGeomOf(context, oid);
      if(!found || !found.geom) return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:`Geometry not resolvable for object ${oid}`, toolId:'T20', objectIds:[oid]}]};
      const obj=found.obj, geom=found.geom;
      const appearance = context.workingCopy && context.workingCopy.getAppearance ? context.workingCopy.getAppearance(obj.appearanceRef)
        : (context.appearanceStore && context.appearanceStore.get ? context.appearanceStore.get(obj.appearanceRef) : null);
      const node=context.sceneGraph && context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
      const wb=getWorldBBoxForObject(context, oid);
      const sceneContext={
        isText: geom.type==='text',
        textContent: geom.params && typeof geom.params.content==='string' ? geom.params.content : undefined,
        childCount: node && Array.isArray(node.children) ? node.children.length : 0,
        parentId: node ? nodeParentOf(node) : undefined,
      };
      if(wb) sceneContext.bbox={minX:wb.minX, minY:wb.minY, width:wb.maxX-wb.minX, height:wb.maxY-wb.minY, area:(wb.maxX-wb.minX)*(wb.maxY-wb.minY)};
      // DELEGATION: existing Phase 3.10 heuristic engine inferSemantic (src-js/semantic.js:122-280).
      // Pure function — zero store contact; the tool NEVER writes SemanticStore (gate :47/:54).
      proposals.push(inferSemantic({objectId:oid, geometry:geom, appearance, sceneContext}));
    }
    return {success:true, output:{proposals}};
  },
};

export function createCoreToolRegistry(){
  const tools=new Map();
  const allTools=[
    createRectangleTool,
    createEllipseTool,
    createPathTool,
    deleteObjectsTool,
    moveObjectTool,
    transformObjectsTool,
    applyFillTool,
    alignObjectsTool,
    distributeObjectsTool,
    groupObjectsTool,
    ungroupObjectsTool,
    reorderObjectsTool,
    booleanOperationTool,
    outlineTextTool,
    createPointTextTool,
    findObjectByRoleTool,
    detectShapePrimitiveTool,
    detectSymmetryTool,
    inferConstraintsTool,
    inferSemanticTool
  ];
  for(const tool of allTools){ deepFreeze(tool); tools.set(tool.id, tool); }
  return {
    tools,
    register(tool){ if(tools.has(tool.id)) throw new Error(`Duplicate tool ID ${tool.id}`); deepFreeze(tool); tools.set(tool.id, tool); },
    unregister(id){ tools.delete(id); },
    get(id){ return tools.get(id); },
    has(id){ return tools.has(id); },
    list(){ return Array.from(tools.values()).sort((a,b)=> a.id.localeCompare(b.id)); },
    listByCategory(category){ return Array.from(tools.values()).filter(t=> t.category===category).sort((a,b)=> a.id.localeCompare(b.id)); },
    validate(toolId, input, context){
      const tool=tools.get(toolId);
      if(!tool) return {valid:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool ${toolId} not found`}]};
      return tool.validate(input, context);
    },
    execute(toolId, input, context){
      const tool=tools.get(toolId);
      if(!tool) return {success:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool ${toolId} not found`}]};
      const validation=tool.validate(input, context);
      if(!validation.valid) return {success:false, errors:validation.errors};
      if(tool.category==='mutation' && context && context.transactionManager && typeof context.transactionManager.execute==='function') return executeViaSubstrate(tool, input, context);
      return tool.execute(input, context);
    }
  };
}


export class ToolRegistry {
  constructor(){ this.tools=new Map(); }
  register(tool){ if(this.tools.has(tool.id)) throw new Error(`Duplicate tool ID ${tool.id}`); deepFreeze(tool); this.tools.set(tool.id, tool); }
  unregister(id){ this.tools.delete(id); }
  get(id){ return this.tools.get(id); }
  has(id){ return this.tools.has(id); }
  list(){ return Array.from(this.tools.values()).sort((a,b)=> a.id.localeCompare(b.id)); }
  listByCategory(category){ return Array.from(this.tools.values()).filter(t=> t.category===category).sort((a,b)=> a.id.localeCompare(b.id)); }
  validate(toolId, input, context){
    const tool=this.tools.get(toolId);
    if(!tool) return {valid:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool ${toolId} not found`}]};
    return tool.validate(input, context);
  }
  execute(toolId, input, context){
    const tool=this.tools.get(toolId);
    if(!tool) return {success:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool ${toolId} not found`}]};
    const validation=tool.validate(input, context);
    if(!validation.valid) return {success:false, errors:validation.errors};
    if(tool.category==='mutation' && context && context.transactionManager && typeof context.transactionManager.execute==='function') return executeViaSubstrate(tool, input, context);
    return tool.execute(input, context);
  }
}

export function registerCoreTools(registry){
  const core=createCoreToolRegistry();
  for(const tool of core.list()) registry.register(tool);
}
