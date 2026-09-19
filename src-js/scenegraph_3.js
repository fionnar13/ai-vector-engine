
function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

function identity(){ return {a:1,b:0,c:0,d:1,tx:0,ty:0}; }
function translation(tx,ty){ return {a:1,b:0,c:0,d:1,tx,ty}; }
function scaleM(sx,sy=sx){ return {a:sx,b:0,c:0,d:sy,tx:0,ty:0}; }
function rotationDegrees(deg){ const rad=deg*Math.PI/180; const c=Math.cos(rad), s=Math.sin(rad); return {a:c,b:s,c:-s,d:c,tx:0,ty:0}; }
function multiply(m1,m2){
  return {
    a: m1.a*m2.a + m1.c*m2.b,
    b: m1.b*m2.a + m1.d*m2.b,
    c: m1.a*m2.c + m1.c*m2.d,
    d: m1.b*m2.c + m1.d*m2.d,
    tx: m1.a*m2.tx + m1.c*m2.ty + m1.tx,
    ty: m1.b*m2.tx + m1.d*m2.ty + m1.ty
  };
}
function transformPoint(m,p){ return {x: m.a*p.x + m.c*p.y + m.tx, y: m.b*p.x + m.d*p.y + m.ty}; }
function inverse(m){
  const det=m.a*m.d - m.b*m.c;
  if(Math.abs(det)<1e-12) throw new Error('TRANSFORM_SINGULAR');
  const invDet=1/det;
  return {a: m.d*invDet, b: -m.b*invDet, c: -m.c*invDet, d: m.a*invDet, tx: (m.c*m.ty - m.d*m.tx)*invDet, ty: (m.b*m.tx - m.a*m.ty)*invDet};
}
function isInvertible(m){ return Math.abs(m.a*m.d - m.b*m.c) >= 1e-12; }

function detectCycle(nodes, startId, newParentId){
  if(!newParentId) return false;
  if(startId===newParentId) return true;
  let current=newParentId;
  const visited=new Set();
  while(current){
    if(visited.has(current)) break;
    visited.add(current);
    if(current===startId) return true;
    const node=nodes.get(current);
    if(!node) break;
    current=node.parent;
  }
  return false;
}

function getDescendants(nodes, nodeId){
  const result=[];
  const stack=[nodeId];
  const visited=new Set([nodeId]);
  while(stack.length>0){
    const cur=stack.pop();
    const node=nodes.get(cur);
    if(!node) continue;
    for(const childId of node.children){
      if(!visited.has(childId)){
        visited.add(childId);
        result.push(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

function isAncestor(nodes, ancestorId, descendantId){
  let cur=nodes.get(descendantId)?.parent;
  while(cur){
    if(cur===ancestorId) return true;
    cur=nodes.get(cur)?.parent ?? null;
  }
  return false;
}

function traverseDepthFirst(nodes, rootId, visit){
  const visited=new Set();
  function dfs(nodeId){
    if(visited.has(nodeId)) return;
    visited.add(nodeId);
    const node=nodes.get(nodeId);
    if(!node) return;
    if(visit) visit(node);
    for(const childId of node.children) dfs(childId);
  }
  if(rootId) dfs(rootId);
  else {
    for(const [id, node] of nodes){ if(node.parent===null) dfs(id); }
  }
}

function getWorldTransform(nodes, nodeId, cache){
  if(cache && cache.has(nodeId)) return cache.get(nodeId);
  const node=nodes.get(nodeId);
  if(!node) throw new Error(`SCENE_NODE_NOT_FOUND: ${nodeId}`);
  let world;
  if(node.parent===null) world=node.localTransform;
  else {
    const parentWorld=getWorldTransform(nodes, node.parent, cache);
    world=multiply(parentWorld, node.localTransform);
  }
  if(cache) cache.set(nodeId, world);
  return world;
}

function invalidateCache(cache, nodes, nodeId){
  cache.delete(nodeId);
  const stack=[nodeId];
  const visited=new Set([nodeId]);
  while(stack.length>0){
    const cur=stack.pop();
    const node=nodes.get(cur);
    if(!node) continue;
    for(const childId of node.children){
      if(!visited.has(childId)){
        visited.add(childId);
        cache.delete(childId);
        stack.push(childId);
      }
    }
  }
}

function deepCloneNode(node){
  return {id:node.id, objectRef:node.objectRef, parent:node.parent, children:[...node.children], localTransform:{...node.localTransform}};
}
function cloneForPublic(node){
  return {id:node.id, objectRef:node.objectRef, parent:node.parent, children:[...node.children], localTransform:{...node.localTransform}};
}

export class SceneGraph {
  constructor(deps, allowInstancing=false){
    this.nodes=new Map();
    this.objectToNode=new Map();
    this.worldTransformCache=new Map();
    this.deps=deps;
    this.allowInstancing=allowInstancing;
  }
  setDependencies(deps){ this.deps=deps; }
  validateNodeCreation(node){
    if(!isUUID(node.id)) throw new Error(`Invalid NodeID ${node.id}`);
    if(node.objectRef && !isUUID(node.objectRef)) throw new Error(`Invalid ObjectID ${node.objectRef}`);
    if(node.parent && !isUUID(node.parent)) throw new Error(`Invalid Parent NodeID ${node.parent}`);
    if(!node.localTransform || ![node.localTransform.a, node.localTransform.b, node.localTransform.c, node.localTransform.d, node.localTransform.tx, node.localTransform.ty].every(Number.isFinite)){
      throw new Error(`TRANSFORM_INVALID`);
    }
    const det=node.localTransform.a*node.localTransform.d - node.localTransform.b*node.localTransform.c;
    if(Math.abs(det)<1e-12) throw new Error(`TRANSFORM_SINGULAR`);
    if(this.deps && node.objectRef && !this.deps.hasObject(node.objectRef)) throw new Error(`SCENE_OBJECT_NOT_FOUND: ${node.objectRef}`);
    if(!this.allowInstancing && node.objectRef && this.objectToNode.has(node.objectRef)) throw new Error(`SCENE_OBJECT_ALREADY_ATTACHED`);
  }
  trackObjectMapping(objectId, nodeId){
    if(!this.allowInstancing){
      if(this.objectToNode.has(objectId)) throw new Error(`Object already attached`);
      this.objectToNode.set(objectId, nodeId);
    }
  }
  untrackObjectMapping(objectId){
    if(objectId && this.objectToNode.has(objectId)) this.objectToNode.delete(objectId);
  }
  createRoot(objectRef=null, localTransform=identity()){
    const id=uuid();
    const node={id, objectRef, parent:null, children:[], localTransform:{...localTransform}};
    this.validateNodeCreation(node);
    this.nodes.set(id, node);
    if(objectRef) this.trackObjectMapping(objectRef, id);
    return cloneForPublic(node);
  }
  createNode(objectRef, parentId=null, localTransform=identity()){
    const id=uuid();
    const node={id, objectRef, parent:parentId, children:[], localTransform:{...localTransform}};
    this.validateNodeCreation(node);
    if(parentId){
      const parent=this.nodes.get(parentId);
      if(!parent) throw new Error(`SCENE_PARENT_NOT_FOUND: ${parentId}`);
      if(detectCycle(this.nodes, id, parentId)) throw new Error(`SCENE_CYCLE`);
      parent.children.push(id);
    }
    this.nodes.set(id, node);
    if(objectRef) this.trackObjectMapping(objectRef, id);
    this.worldTransformCache.delete(id);
    return cloneForPublic(node);
  }
  createGroup(arg=null, localTransform=identity()){
    // Overload: if arg is array, treat as objectIds grouping
    if(Array.isArray(arg)){
      const objectIds=arg;
      const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
      const groupId=uuid();
      let commonParentId=null;
      if(objectIds && objectIds.length>0){
        const firstNode=this.findNodeByObjectId ? this.findNodeByObjectId(objectIds[0]) : null;
        if(firstNode) commonParentId=firstNode.parent || firstNode.parentId || null;
      }
      const groupNode={id:groupId, objectId:null, objectRef:null, parentId:commonParentId, parent:commonParentId, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}, isGroup:true};
      this.nodes.set(groupId, groupNode);
      if(commonParentId){
        const parentNode=this.nodes.get(commonParentId);
        if(parentNode && parentNode.children) parentNode.children.push(groupId);
      }
      for(const oid of objectIds||[]){
        const node=this.findNodeByObjectId ? this.findNodeByObjectId(oid) : null;
        if(node){
          const oldParentId=node.parent || node.parentId;
          if(oldParentId){
            const oldParent=this.nodes.get(oldParentId);
            if(oldParent && oldParent.children) oldParent.children=oldParent.children.filter(c=> c!==node.id);
          }
          node.parent=groupId;
          node.parentId=groupId;
          // Update actual stored node, not cloned
          const stored=this.nodes.get(node.id);
          if(stored){ stored.parent=groupId; stored.parentId=groupId; }
          groupNode.children.push(node.id);
        }
      }
      return {id:groupId};
    }
    // Original signature: parentId
    return this.createNode(null, arg, localTransform);
  }
  findNode(nodeId){ const n=this.nodes.get(nodeId); return n?cloneForPublic(n):undefined; }
  findNodeByObjectId(objectId){
    const nodeId=this.objectToNode.get(objectId);
    if(!nodeId){
      for(const node of this.nodes.values()){ if(node.objectRef===objectId) return cloneForPublic(node); }
      return undefined;
    }
    return this.findNode(nodeId);
  }
  getParent(nodeId){ const n=this.nodes.get(nodeId); if(!n||!n.parent) return undefined; return this.findNode(n.parent); }
  getChildren(nodeId){ const n=this.nodes.get(nodeId); if(!n) throw new Error(`SCENE_NODE_NOT_FOUND: ${nodeId}`); return n.children.map(cid=>this.findNode(cid)).filter(Boolean); }
  getRootNodes(){ const roots=[]; for(const node of this.nodes.values()){ if(node.parent===null) roots.push(cloneForPublic(node)); } return roots; }
  isAncestor(ancestorId, nodeId){ return isAncestor(this.nodes, ancestorId, nodeId); }
  isDescendant(nodeId, ancestorId){ return isAncestor(this.nodes, ancestorId, nodeId); }
  traverseDepthFirst(rootId, visit){ traverseDepthFirst(this.nodes, rootId, (internal)=>{ if(visit) visit(cloneForPublic(internal)); }); }
  removeNode(nodeId){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND: ${nodeId}`);
    if(node.parent){
      const parent=this.nodes.get(node.parent);
      if(parent) parent.children=parent.children.filter(c=>c!==nodeId);
    }
    const descendants=getDescendants(this.nodes, nodeId);
    for(const descId of descendants){
      const desc=this.nodes.get(descId);
      if(desc){ this.untrackObjectMapping(desc.objectRef); this.nodes.delete(descId); this.worldTransformCache.delete(descId); }
    }
    this.untrackObjectMapping(node.objectRef);
    this.nodes.delete(nodeId);
    this.worldTransformCache.delete(nodeId);
  }
  reparent(nodeId, newParentId){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND: ${nodeId}`);
    if(newParentId===nodeId) throw new Error(`SCENE_SELF_PARENT`);
    if(newParentId){
      const newParent=this.nodes.get(newParentId);
      if(!newParent) throw new Error(`SCENE_PARENT_NOT_FOUND: ${newParentId}`);
      if(detectCycle(this.nodes, nodeId, newParentId)) throw new Error(`SCENE_CYCLE`);
      if(newParent.children.includes(nodeId)) throw new Error(`SCENE_DUPLICATE_CHILD`);
    }
    if(node.parent){
      const oldParent=this.nodes.get(node.parent);
      if(oldParent) oldParent.children=oldParent.children.filter(c=>c!==nodeId);
    }
    if(newParentId){
      const newParent=this.nodes.get(newParentId);
      newParent.children.push(nodeId);
    }
    node.parent=newParentId;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  appendChild(parentId, childId){
    const parent=this.nodes.get(parentId);
    const child=this.nodes.get(childId);
    if(!parent) throw new Error(`SCENE_PARENT_NOT_FOUND: ${parentId}`);
    if(!child) throw new Error(`SCENE_NODE_NOT_FOUND: ${childId}`);
    if(parent.children.includes(childId)) throw new Error(`SCENE_DUPLICATE_CHILD`);
    if(detectCycle(this.nodes, childId, parentId)) throw new Error(`SCENE_CYCLE`);
    if(child.parent){
      const oldParent=this.nodes.get(child.parent);
      if(oldParent) oldParent.children=oldParent.children.filter(c=>c!==childId);
    }
    parent.children.push(childId);
    child.parent=parentId;
    invalidateCache(this.worldTransformCache, this.nodes, childId);
  }
  insertChild(parentId, childId, index){
    const parent=this.nodes.get(parentId);
    const child=this.nodes.get(childId);
    if(!parent) throw new Error(`SCENE_PARENT_NOT_FOUND`);
    if(!child) throw new Error(`SCENE_NODE_NOT_FOUND`);
    if(index<0||index>parent.children.length) throw new Error(`Invalid index ${index}`);
    if(parent.children.includes(childId)) throw new Error(`SCENE_DUPLICATE_CHILD`);
    if(detectCycle(this.nodes, childId, parentId)) throw new Error(`SCENE_CYCLE`);
    if(child.parent){
      const oldParent=this.nodes.get(child.parent);
      if(oldParent) oldParent.children=oldParent.children.filter(c=>c!==childId);
    }
    parent.children.splice(index,0,childId);
    child.parent=parentId;
    invalidateCache(this.worldTransformCache, this.nodes, childId);
  }
  removeChild(parentId, childId){
    const parent=this.nodes.get(parentId);
    if(!parent) throw new Error(`SCENE_PARENT_NOT_FOUND`);
    if(!parent.children.includes(childId)) throw new Error(`Child not found`);
    parent.children=parent.children.filter(c=>c!==childId);
    const child=this.nodes.get(childId);
    if(child){ child.parent=null; invalidateCache(this.worldTransformCache, this.nodes, childId); }
  }
  moveChild(parentId, childId, newIndex){
    const parent=this.nodes.get(parentId);
    if(!parent) throw new Error(`SCENE_PARENT_NOT_FOUND`);
    const oldIndex=parent.children.indexOf(childId);
    if(oldIndex===-1) throw new Error(`Child not found`);
    if(newIndex<0||newIndex>=parent.children.length) throw new Error(`Invalid newIndex`);
    parent.children.splice(oldIndex,1);
    parent.children.splice(newIndex,0,childId);
  }
  getWorldTransform(nodeId){ return getWorldTransform(this.nodes, nodeId, this.worldTransformCache); }
  setLocalTransform(nodeId, matrix){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND`);
    if(![matrix.a,matrix.b,matrix.c,matrix.d,matrix.tx,matrix.ty].every(Number.isFinite)) throw new Error(`TRANSFORM_INVALID`);
    const det=matrix.a*matrix.d - matrix.b*matrix.c;
    if(Math.abs(det)<1e-12) throw new Error(`TRANSFORM_SINGULAR`);
    node.localTransform={...matrix};
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  translateNode(nodeId, dx, dy){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND`);
    const t=translation(dx,dy);
    node.localTransform=multiply(node.localTransform, t);
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  scaleNode(nodeId, sx, sy=sx, pivot){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND`);
    let m;
    if(pivot){
      const t1=translation(-pivot.x,-pivot.y);
      const s=scaleM(sx,sy);
      const t2=translation(pivot.x,pivot.y);
      m=multiply(multiply(t2,s),t1);
    }else m=scaleM(sx,sy);
    node.localTransform=multiply(node.localTransform, m);
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  rotateNode(nodeId, degrees, pivot){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND`);
    let m;
    if(pivot){
      const t1=translation(-pivot.x,-pivot.y);
      const r=rotationDegrees(degrees);
      const t2=translation(pivot.x,pivot.y);
      m=multiply(multiply(t2,r),t1);
    }else m=rotationDegrees(degrees);
    node.localTransform=multiply(node.localTransform, m);
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  transformNode(nodeId, transform){
    const node=this.nodes.get(nodeId);
    if(!node) throw new Error(`SCENE_NODE_NOT_FOUND`);
    node.localTransform=multiply(node.localTransform, transform);
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }
  getWorldTransformCache(){ return new Map(this.worldTransformCache); }
  clearWorldTransformCache(){ this.worldTransformCache.clear(); }
  size(){ return this.nodes.size; }
  getAllNodes(){ return Array.from(this.nodes.values()).map(n=>cloneForPublic(n)); }
  validateInvariants(){
    for(const node of this.nodes.values()){
      if(new Set(node.children).size!==node.children.length) throw new Error(`Duplicate child`);
      for(const childId of node.children){
        const child=this.nodes.get(childId);
        if(!child) throw new Error(`Child not found`);
        if(child.parent!==node.id) throw new Error(`Parent/child inconsistency`);
      }
    }
  }
  getCacheSize(){ return this.worldTransformCache.size; }
}

// Spatial Index
export class SimpleSpatialIndex {
  constructor(rebuildCallback){ this.entries=new Map(); this.rebuildCallback=rebuildCallback; }
  insert(nodeId, bbox){
    if(!bbox || ![bbox.minX,bbox.minY,bbox.maxX,bbox.maxY].every(Number.isFinite)) throw new Error(`BBOX_INVALID`);
    this.entries.set(nodeId, {...bbox});
  }
  update(nodeId, newBBox){ this.entries.set(nodeId, {...newBBox}); }
  delete(nodeId){ this.entries.delete(nodeId); }
  query(bbox){
    const result=[];
    for(const [id, entryBBox] of this.entries){
      if(!(entryBBox.maxX < bbox.minX || entryBBox.minX > bbox.maxX || entryBBox.maxY < bbox.minY || entryBBox.minY > bbox.maxY)){
        result.push(id);
      }
    }
    return result.sort();
  }
  queryPoint(point, tolerance){
    const qb={minX:point.x-tolerance, minY:point.y-tolerance, maxX:point.x+tolerance, maxY:point.y+tolerance};
    return this.query(qb);
  }
  clear(){ this.entries.clear(); }
  rebuild(){ if(this.rebuildCallback){ this.clear(); this.rebuildCallback(); } }
  size(){ return this.entries.size; }
  getAllEntries(){ return new Map(this.entries); }
}

export function createSpatialIndex(rebuildCallback){ return new SimpleSpatialIndex(rebuildCallback); }

// Helper matrix functions for scenegraph.js
export const MatrixHelpers = { identity, translation, scale: scaleM, rotationDegrees, multiply, transformPoint, inverse, isInvertible };

SceneGraph.prototype.createNodeFromSnapshot = function(node){
  this.nodes.set(node.id, JSON.parse(JSON.stringify(node)));
  // Also need to add to parent children if parent exists
  if(node.parent){
    const parent=this.nodes.get(node.parent);
    if(parent && !parent.children.includes(node.id)){
      parent.children.push(node.id);
    }
  }
};
SceneGraph.prototype.updateNode = function(id, node){
  this.nodes.set(id, JSON.parse(JSON.stringify(node)));
};
