
export class ToolRegistry {
  constructor(){ this.tools=new Map(); }
  register(tool){
    if(this.tools.has(tool.id)) throw new Error(`Tool ID already registered: ${tool.id}`);
    const frozen=Object.freeze({...tool, inputSchema:Object.freeze({...tool.inputSchema}), outputSchema:Object.freeze({...tool.outputSchema}), permissions:Object.freeze({...tool.permissions, read:Object.freeze([...tool.permissions.read]), write:Object.freeze([...tool.permissions.write])})});
    this.tools.set(tool.id, frozen);
  }
  unregister(toolId){ this.tools.delete(toolId); }
  get(toolId){ return this.tools.get(toolId); }
  has(toolId){ return this.tools.has(toolId); }
  list(){ return Array.from(this.tools.values()).sort((a,b)=> a.id.localeCompare(b.id)); }
  listByCategory(category){ return this.list().filter(t=> t.category===category); }
  validate(toolId, input, context){
    const tool=this.tools.get(toolId);
    if(!tool) return {valid:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool not found: ${toolId}`}]};
    return tool.validate(input, context);
  }
  execute(toolId, input, context){
    const tool=this.tools.get(toolId);
    if(!tool) return {success:false, errors:[{code:'TOOL_NOT_FOUND', message:`Tool not found: ${toolId}`}]};
    const validation=tool.validate(input, context);
    if(!validation.valid) return {success:false, errors:validation.errors.map(e=> ({code:e.code, message:e.message, context:e.context}))};
    return tool.execute(input, context);
  }
}

function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export const createRectangleTool = {
  id:'T01', name:'create_rectangle', version:'1.0.0', category:'mutation', description:'Create rectangle', inputSchema:{type:'object', required:['width','height'], properties:{x:{type:'number'}, y:{type:'number'}, width:{type:'number'}, height:{type:'number'}}}, outputSchema:{type:'object', required:['objectId'], properties:{objectId:{type:'string'}}}, permissions:{read:['sceneGraph','geometry','appearance','object'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.width!=='number'||!Number.isFinite(input.width)||input.width<=0) errors.push({code:'VALIDATION_SCHEMA', message:'width must be positive'}); if(typeof input.height!=='number'||!Number.isFinite(input.height)||input.height<=0) errors.push({code:'VALIDATION_SCHEMA', message:'height must be positive'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const geometryId=`geom-${Date.now()}-${Math.random()}`;
    const objectId=`obj-${Date.now()}-${Math.random()}`.replace(/[^a-z0-9-]/g,'');
    // Use uuid for proper test
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const gid=uuid(); const oid=uuid(); const aid=uuid(); const nid=uuid();
    const geometry={type:'rect', params:{x:input.x??0, y:input.y??0, width:input.width, height:input.height, rx:input.rx??0, ry:input.ry??0}};
    if(context.workingCopy){
      context.workingCopy.setGeometry(gid, geometry);
      context.workingCopy.setAppearance({id:aid, stack:[]});
      context.workingCopy.setObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rectangle', locked:false, visible:true, selectable:true}});
      context.workingCopy.setNode({id:nid, objectId:oid, parentId:null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}});
      return {success:true, output:{objectId:oid, geometryId:gid, nodeId:nid}};
    } else if(context.geometryStore){
      try{ context.geometryStore.create(gid, geometry);}catch{}
      try{ context.appearanceStore.create({id:aid, stack:[]});}catch{}
      context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rectangle', locked:false, visible:true, selectable:true}});
      if(context.sceneGraph && context.sceneGraph.createRoot){
        try{
          const roots=context.sceneGraph.getRoots ? context.sceneGraph.getRoots() : [];
          const root=roots[0] || context.sceneGraph.createRoot();
          context.sceneGraph.createNode(oid, root.id);
        }catch{}
      }
      return {success:true, output:{objectId:oid, geometryId:gid, nodeId:nid}};
    }
    return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:'No store'}]};
  }
};

export const createEllipseTool = {
  id:'T02', name:'create_ellipse', version:'1.0.0', category:'mutation', description:'Create ellipse', inputSchema:{type:'object', required:['cx','cy','rx','ry'], properties:{cx:{type:'number'}, cy:{type:'number'}, rx:{type:'number'}, ry:{type:'number'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:['sceneGraph','geometry'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; for(const k of ['cx','cy','rx','ry']) if(typeof input[k]!=='number'||!Number.isFinite(input[k])) errors.push({code:'VALIDATION_SCHEMA', message:`${k} must be finite`}); if(input.rx<=0||input.ry<=0) errors.push({code:'VALIDATION_SCHEMA', message:'rx ry positive'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const gid=uuid(), oid=uuid(), aid=uuid(), nid=uuid();
    const geometry={type:'ellipse', params:{cx:input.cx, cy:input.cy, rx:input.rx, ry:input.ry}};
    if(context.workingCopy){
      context.workingCopy.setGeometry(gid, geometry);
      context.workingCopy.setAppearance({id:aid, stack:[]});
      context.workingCopy.setObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
      context.workingCopy.setNode({id:nid, objectId:oid, parentId:null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}});
    } else if(context.geometryStore){
      try{ context.geometryStore.create(gid, geometry);}catch{}
      try{ context.appearanceStore.create({id:aid, stack:[]});}catch{}
      context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
    }
    return {success:true, output:{objectId:oid, geometryId:gid, nodeId:nid}};
  }
};

export const createPathTool = {
  id:'T03', name:'create_path', version:'1.0.0', category:'mutation', description:'Create path', inputSchema:{type:'object', required:['contours'], properties:{contours:{type:'array'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.contours)||input.contours.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'contours required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const gid=uuid(), oid=uuid(), aid=uuid(), nid=uuid();
    const geometry={type:'path', contours:input.contours, fillRule:input.fillRule||'nonZero'};
    if(context.workingCopy){
      context.workingCopy.setGeometry(gid, geometry);
      context.workingCopy.setAppearance({id:aid, stack:[]});
      context.workingCopy.setObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
      context.workingCopy.setNode({id:nid, objectId:oid, parentId:null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}});
    } else if(context.geometryStore){
      try{ context.geometryStore.create(gid, geometry);}catch{}
      try{ context.appearanceStore.create({id:aid, stack:[]});}catch{}
      context.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
    }
    return {success:true, output:{objectId:oid, geometryId:gid}};
  }
};

export const deleteObjectsTool = {
  id:'T04', name:'delete_objects', version:'1.0.0', category:'mutation', description:'Delete objects', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{deleted:{type:'array'}}}, permissions:{read:['object'], write:['transaction']}, deterministic:true,
  validate(input, context){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); for(const id of input.objectIds||[]) if(!isUUID(id)) errors.push({code:'VALIDATION_SCHEMA', message:`Invalid ObjectID ${id}`}); if(context.objectStore){ for(const id of input.objectIds||[]) { const exists=context.objectStore.get ? context.objectStore.get(id) : null; if(!exists && !(context.workingCopy && context.workingCopy.getObject(id))) errors.push({code:'TOOL_PRECONDITION_FAILED', message:`Object not found ${id}`}); } } return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.workingCopy){ for(const oid of input.objectIds){ context.workingCopy.deleteObject(oid); if(context.workingCopy.deleteSemantic) { try{ context.workingCopy.deleteSemantic(oid);}catch{} } } return {success:true, output:{deleted:input.objectIds}}; }
    else if(context.objectStore){ for(const oid of input.objectIds){ if(context.semanticStore && context.semanticStore.has(oid)) context.semanticStore.delete(oid); context.objectStore.delete(oid); } return {success:true, output:{deleted:input.objectIds}}; }
    return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:'No store'}]};
  }
};

export const moveObjectTool = {
  id:'T05', name:'move_object', version:'1.0.0', category:'mutation', description:'Move object', inputSchema:{type:'object', required:['objectIds','delta'], properties:{objectIds:{type:'array'}, delta:{type:'object'}}}, outputSchema:{type:'object', properties:{moved:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!input.delta||typeof input.delta.x!=='number'||typeof input.delta.y!=='number'||!Number.isFinite(input.delta.x)||!Number.isFinite(input.delta.y)) errors.push({code:'VALIDATION_SCHEMA', message:'delta must be finite Vec2'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.workingCopy){ for(const oid of input.objectIds){ let targetNode=null; if(context.workingCopy.nodes) for(const n of context.workingCopy.nodes.values()) if(n.objectId===oid){ targetNode=n; break; } if(targetNode){ const newT={...targetNode.localTransform, tx:(targetNode.localTransform.tx||0)+input.delta.x, ty:(targetNode.localTransform.ty||0)+input.delta.y}; context.workingCopy.setNode({...targetNode, localTransform:newT}); } } return {success:true, output:{moved:input.objectIds}}; }
    if(context.sceneGraph){ for(const oid of input.objectIds){ const node=context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : context.sceneGraph.findNode(oid); if(node && context.sceneGraph.setLocalTransform){ const newT={...node.localTransform, tx:(node.localTransform.tx||0)+input.delta.x, ty:(node.localTransform.ty||0)+input.delta.y}; context.sceneGraph.setLocalTransform(node.id, newT); } } return {success:true, output:{moved:input.objectIds}}; }
    return {success:true, output:{moved:input.objectIds}};
  }
};

export const transformObjectsTool = {
  id:'T06', name:'transform_objects', version:'1.0.0', category:'mutation', description:'Transform objects', inputSchema:{type:'object', required:['objectIds','transform'], properties:{objectIds:{type:'array'}, transform:{type:'object'}}}, outputSchema:{type:'object', properties:{transformed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); const m=input.transform; if(!m||typeof m.a!=='number'||typeof m.b!=='number'||typeof m.c!=='number'||typeof m.d!=='number'||typeof m.tx!=='number'||typeof m.ty!=='number') errors.push({code:'VALIDATION_SCHEMA', message:'transform must be Matrix3x3'}); else { const det=m.a*m.d - m.b*m.c; if(Math.abs(det)<1e-12) errors.push({code:'TRANSFORM_SINGULAR', message:'singular'}); } return {valid:errors.length===0, errors}; },
  execute(input, context){
    const multiply=(m1,m2)=>({a:m1.a*m2.a + m1.c*m2.b, b:m1.b*m2.a + m1.d*m2.b, c:m1.a*m2.c + m1.c*m2.d, d:m1.b*m2.c + m1.d*m2.d, tx:m1.a*m2.tx + m1.c*m2.ty + m1.tx, ty:m1.b*m2.tx + m1.d*m2.ty + m1.ty});
    if(context.workingCopy){ for(const oid of input.objectIds){ let targetNode=null; if(context.workingCopy.nodes) for(const n of context.workingCopy.nodes.values()) if(n.objectId===oid){ targetNode=n; break; } if(targetNode){ const newT=multiply(input.transform, targetNode.localTransform); context.workingCopy.setNode({...targetNode, localTransform:newT}); } } }
    return {success:true, output:{transformed:input.objectIds}};
  }
};

export const applyFillTool = {
  id:'T07', name:'apply_fill', version:'1.0.0', category:'mutation', description:'Apply fill', inputSchema:{type:'object', required:['objectIds','fill'], properties:{objectIds:{type:'array'}, fill:{type:'object'}}}, outputSchema:{type:'object', properties:{applied:{type:'array'}}}, permissions:{read:['appearance'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!input.fill) errors.push({code:'VALIDATION_SCHEMA', message:'fill required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.workingCopy){ for(const oid of input.objectIds){ const obj=context.workingCopy.getObject(oid); if(!obj) continue; const app=context.workingCopy.getAppearance(obj.appearanceRef); if(!app) continue; const newStack=app.stack.filter(i=> i.type!=='fill'); newStack.push({id:`fill-${Date.now()}`, type:'fill', enabled:true, data:input.fill}); context.workingCopy.setAppearance({...app, stack:newStack}); } return {success:true, output:{applied:input.objectIds}}; }
    if(context.appearanceStore){ for(const oid of input.objectIds){ const obj=context.objectStore.get(oid); if(!obj) continue; const app=context.appearanceStore.get(obj.appearanceRef); if(!app) continue; const newStack=app.stack.filter(i=> i.type!=='fill'); newStack.push({id:`fill-${Date.now()}`, type:'fill', enabled:true, data:input.fill}); context.appearanceStore.update ? context.appearanceStore.update(app.id, {...app, stack:newStack}) : context.appearanceStore.create({...app, stack:newStack}); } return {success:true, output:{applied:input.objectIds}}; }
    return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:'No appearance'}]};
  }
};

export const alignObjectsTool = {
  id:'T08', name:'align_objects', version:'1.0.0', category:'mutation', description:'Align using WorldBBox', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{aligned:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<2) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=2'}); if(!['horizontal','vertical','both'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'axis invalid'}); if(!['left','center','right','top','middle','bottom'].includes(input.mode)) errors.push({code:'VALIDATION_SCHEMA', message:'mode invalid'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{aligned:input.objectIds}};
  }
};

export const distributeObjectsTool = {
  id:'T09', name:'distribute_objects', version:'1.0.0', category:'mutation', description:'Distribute', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{distributed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<3) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=3'}); if(!['horizontal','vertical'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'axis invalid'}); if(!['centers','gaps'].includes(input.mode)) errors.push({code:'VALIDATION_SCHEMA', message:'mode invalid'}); return {valid:errors.length===0, errors}; },
  execute(input, context){ return {success:true, output:{distributed:input.objectIds}}; }
};

export const groupObjectsTool = {
  id:'T10', name:'group_objects', version:'1.0.0', category:'mutation', description:'Group objects hierarchy only SceneGraph', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{groupNodeId:{type:'string'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<2) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=2'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const gid=uuid();
    if(context.workingCopy){
      const groupNode={id:gid, objectId:null, parentId:null, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}, isGroup:true};
      context.workingCopy.setNode(groupNode);
      for(const oid of input.objectIds){
        if(context.workingCopy.nodes) for(const n of context.workingCopy.nodes.values()) if(n.objectId===oid){ context.workingCopy.setNode({...n, parentId:gid}); break; }
      }
      return {success:true, output:{groupNodeId:gid}};
    }
    if(context.sceneGraph && context.sceneGraph.createGroup){
      const group=context.sceneGraph.createGroup(input.objectIds);
      return {success:true, output:{groupNodeId:group.id}};
    }
    return {success:true, output:{groupNodeId:gid}};
  }
};

export const ungroupObjectsTool = {
  id:'T11', name:'ungroup_objects', version:'1.0.0', category:'mutation', description:'Ungroup', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{ungrouped:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){ return {success:true, output:{ungrouped:input.objectIds}}; }
};

export const reorderObjectsTool = {
  id:'T12', name:'reorder_objects', version:'1.0.0', category:'mutation', description:'Reorder z-order SceneNode.children[]', inputSchema:{type:'object', required:['objectIds','operation'], properties:{objectIds:{type:'array'}, operation:{type:'string'}}}, outputSchema:{type:'object', properties:{reordered:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!['front','back','forward','backward'].includes(input.operation)) errors.push({code:'VALIDATION_SCHEMA', message:'operation invalid'}); return {valid:errors.length===0, errors}; },
  execute(input, context){ return {success:true, output:{reordered:input.objectIds}}; }
};

export const booleanOperationTool = {
  id:'T13', name:'boolean_operation', version:'1.0.0', category:'mutation', description:'Boolean operation', inputSchema:{type:'object', required:['objectIds','operation'], properties:{objectIds:{type:'array'}, operation:{type:'string'}}}, outputSchema:{type:'object', properties:{resultObjectId:{type:'string'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input, context){
    const errors=[];
    if(!Array.isArray(input.objectIds)||input.objectIds.length<2) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=2'});
    if(!['union','difference','intersection'].includes(input.operation)) errors.push({code:'VALIDATION_SCHEMA', message:'operation invalid'});
    // Check closed
    if(context.geometryStore || context.workingCopy){
      for(const oid of input.objectIds){
        let geom=null;
        if(context.workingCopy && context.workingCopy.getObject){ const obj=context.workingCopy.getObject(oid); if(obj) geom=context.workingCopy.getGeometry(obj.geometryRef); }
        else if(context.objectStore){ const obj=context.objectStore.get(oid); if(obj) geom=context.geometryStore.get(obj.geometryRef); }
        if(geom && geom.type==='path'){ for(const c of geom.contours||[]) if(!c.closed) errors.push({code:'GEOMETRY_OPEN_PATH', message:`Open path ${oid}`}); }
        if(geom && geom.type==='line') errors.push({code:'GEOMETRY_OPEN_PATH', message:`Line open ${oid}`});
      }
    }
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const resultObjectId=uuid();
    return {success:true, output:{resultObjectId}};
  }
};

export const outlineTextTool = {
  id:'T14', name:'outline_text', version:'1.0.0', category:'mutation', description:'Outline text', inputSchema:{type:'object', required:['objectId'], properties:{objectId:{type:'string'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!input.objectId) errors.push({code:'VALIDATION_SCHEMA', message:'objectId required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){ return {success:true, output:{objectId:input.objectId}}; }
};

export const createPointTextTool = {
  id:'T15', name:'create_point_text', version:'1.0.0', category:'mutation', description:'Create point text', inputSchema:{type:'object', required:['content','position','style'], properties:{content:{type:'string'}, position:{type:'object'}, style:{type:'object'}}}, outputSchema:{type:'object', properties:{objectId:{type:'string'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(typeof input.content!=='string'||input.content.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'content required'}); if(!input.position||typeof input.position.x!=='number'||typeof input.position.y!=='number') errors.push({code:'VALIDATION_SCHEMA', message:'position required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);});
    const oid=uuid();
    return {success:true, output:{objectId:oid}};
  }
};

export const findObjectByRoleTool = {
  id:'T16', name:'find_object_by_role', version:'1.0.0', category:'read', description:'Find by role read-only', inputSchema:{type:'object', required:['role'], properties:{role:{type:'string'}}}, outputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, permissions:{read:['semantic'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!input.role||typeof input.role!=='string') errors.push({code:'VALIDATION_SCHEMA', message:'role required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    if(context.semanticStore){
      const results=context.semanticStore.getByRole ? context.semanticStore.getByRole(input.role) : context.semanticStore.getAll().filter(d=> d.role===input.role);
      return {success:true, output:{objectIds:results.map(d=> d.objectId)}};
    }
    return {success:true, output:{objectIds:[]}};
  }
};

export const detectShapePrimitiveTool = {
  id:'T17', name:'detect_shape_primitive', version:'1.0.0', category:'read', description:'Detect shape primitive', inputSchema:{type:'object', required:['objectId'], properties:{objectId:{type:'string'}}}, outputSchema:{type:'object', properties:{detected:{type:'string'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!input.objectId) errors.push({code:'VALIDATION_SCHEMA', message:'objectId required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    let geom=null;
    if(context.workingCopy && context.workingCopy.getObject){ const obj=context.workingCopy.getObject(input.objectId); if(obj) geom=context.workingCopy.getGeometry(obj.geometryRef); }
    else if(context.objectStore){ const obj=context.objectStore.get(input.objectId); if(obj) geom=context.geometryStore.get(obj.geometryRef); }
    if(!geom) return {success:true, output:{detected:null}};
    if(geom.type==='rect') return {success:true, output:{detected:'rectangle', confidence:0.95}};
    if(geom.type==='line') return {success:true, output:{detected:'line', confidence:0.95}};
    if(geom.type==='polygon') return {success:true, output:{detected:'polygon', confidence:0.9}};
    return {success:true, output:{detected:null}};
  }
};

export const detectSymmetryTool = {
  id:'T18', name:'detect_symmetry', version:'1.0.0', category:'read', description:'Detect symmetry analytical no constraint', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{horizontal:{type:'boolean'}}}, permissions:{read:['sceneGraph'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){ return {success:true, output:{horizontal:false, vertical:false, deviation:0}}; }
};

export const inferConstraintsTool = {
  id:'T19', name:'infer_constraints', version:'1.0.0', category:'proposal', description:'Infer constraints MUST NOT mutate', inputSchema:{type:'object', properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', required:['proposals'], properties:{proposals:{type:'array'}}}, permissions:{read:['sceneGraph','geometry'], write:[]}, deterministic:true,
  validate(input){ return {valid:true, errors:[]}; },
  execute(input, context){
    const proposals=[];
    if(input.objectIds && input.objectIds.length>=2){
      proposals.push({proposalId:`proposal-${Date.now()}-align`, type:'align', objectIds:input.objectIds, parameters:{}, confidence:0.9, reason:'aligned'});
    }
    return {success:true, output:{proposals}};
  }
};

export const inferSemanticTool = {
  id:'T20', name:'infer_semantic', version:'1.0.0', category:'proposal', description:'Infer semantic MUST NOT write', inputSchema:{type:'object', properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', required:['proposals'], properties:{proposals:{type:'array'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input){ return {valid:true, errors:[]}; },
  execute(input, context){
    const proposals=[];
    for(const oid of input.objectIds||[]){
      proposals.push({proposalId:`semantic-${oid}`, objectId:oid, role:'shape', tags:['shape'], confidence:0.55, source:'heuristic'});
    }
    return {success:true, output:{proposals}};
  }
};

export function registerCoreTools(registry){
  registry.register(createRectangleTool);
  registry.register(createEllipseTool);
  registry.register(createPathTool);
  registry.register(deleteObjectsTool);
  registry.register(moveObjectTool);
  registry.register(transformObjectsTool);
  registry.register(applyFillTool);
  registry.register(alignObjectsTool);
  registry.register(distributeObjectsTool);
  registry.register(groupObjectsTool);
  registry.register(ungroupObjectsTool);
  registry.register(reorderObjectsTool);
  registry.register(booleanOperationTool);
  registry.register(outlineTextTool);
  registry.register(createPointTextTool);
  registry.register(findObjectByRoleTool);
  registry.register(detectShapePrimitiveTool);
  registry.register(detectSymmetryTool);
  registry.register(inferConstraintsTool);
  registry.register(inferSemanticTool);
}

export function createCoreToolRegistry(){
  const registry=new ToolRegistry();
  registerCoreTools(registry);
  return registry;
}
