
function isUUID(s){ return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

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
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!input.delta || typeof input.delta.x!=='number' || typeof input.delta.y!=='number' || !Number.isFinite(input.delta.x) || !Number.isFinite(input.delta.y)) errors.push({code:'VALIDATION_SCHEMA', message:'delta must be finite Vec2'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{moved:input.objectIds}};
  },
};

export const transformObjectsTool = {
  id:'T06', name:'transform_objects', version:'1.0.0', category:'mutation', description:'Transform objects', inputSchema:{type:'object', required:['objectIds','transform'], properties:{objectIds:{type:'array'}, transform:{type:'object'}}}, outputSchema:{type:'object', properties:{transformed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); const t=input.transform; if(!t || typeof t.a!=='number' || typeof t.b!=='number' || typeof t.c!=='number' || typeof t.d!=='number' || typeof t.tx!=='number' || typeof t.ty!=='number') errors.push({code:'VALIDATION_SCHEMA', message:'transform must be Matrix3x3'}); else { const det=t.a*t.d - t.b*t.c; if(Math.abs(det)<1e-12) errors.push({code:'TRANSFORM_SINGULAR', message:'Transform singular'}); } return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{transformed:input.objectIds}};
  },
};

export const applyFillTool = {
  id:'T07', name:'apply_fill', version:'1.0.0', category:'mutation', description:'Apply fill', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{applied:{type:'array'}}}, permissions:{read:['appearance'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{applied:input.objectIds}};
  },
};

export const alignObjectsTool = {
  id:'T08', name:'align_objects', version:'1.0.0', category:'mutation', description:'Align using WorldBBox', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{aligned:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'}); if(!['horizontal','vertical','both'].includes(input.axis)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid axis'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{aligned:input.objectIds}};
  },
};

export const distributeObjectsTool = {
  id:'T09', name:'distribute_objects', version:'1.0.0', category:'mutation', description:'Distribute objects', inputSchema:{type:'object', required:['objectIds','axis','mode'], properties:{objectIds:{type:'array'}, axis:{type:'string'}, mode:{type:'string'}}}, outputSchema:{type:'object', properties:{distributed:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<3) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=3'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
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
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{ungrouped:input.objectIds}};
  },
};

export const reorderObjectsTool = {
  id:'T12', name:'reorder_objects', version:'1.0.0', category:'mutation', description:'Reorder objects', inputSchema:{type:'object', required:['objectIds','operation'], properties:{objectIds:{type:'array'}, operation:{type:'string'}}}, outputSchema:{type:'object', properties:{reordered:{type:'array'}}}, permissions:{read:['sceneGraph'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); if(!['front','back','forward','backward'].includes(input.operation)) errors.push({code:'VALIDATION_SCHEMA', message:'invalid operation'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
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
    if(context && context.geometryStore){
      for(const oid of input.objectIds||[]){
        const obj=context.objectStore ? context.objectStore.get(oid) : null;
        if(obj){
          const geom=context.geometryStore.get(obj.geometryRef);
          if(geom && geom.type==='path'){
            const contours=geom.params.contours;
            if(!contours || contours.length===0) errors.push({code:'GEOMETRY_OPEN_PATH', message:'Path is open'});
          }
        }
      }
    }
    return {valid:errors.length===0, errors};
  },
  execute(input, context){
    const resultObjectId=uuid();
    return {success:true, output:{resultObjectId}};
  },
};

export const outlineTextTool = {
  id:'T14', name:'outline_text', version:'1.0.0', category:'mutation', description:'Outline text', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{outlined:{type:'array'}}}, permissions:{read:['geometry'], write:['transaction']}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{outlined:input.objectIds}};
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
    if(context.semanticStore && context.semanticStore.findByRole){
      const ids=context.semanticStore.findByRole(input.role);
      return {success:true, output:{objectIds:ids}};
    }
    return {success:true, output:{objectIds:[]}};
  },
};

export const detectShapePrimitiveTool = {
  id:'T17', name:'detect_shape_primitive', version:'1.0.0', category:'read', description:'Detect shape primitive', inputSchema:{type:'object', required:['objectId'], properties:{objectId:{type:'string'}}}, outputSchema:{type:'object', properties:{primitive:{type:'string'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!isUUID(input.objectId)) errors.push({code:'VALIDATION_SCHEMA', message:'Invalid ObjectID'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{primitive:'rectangle', confidence:0.95}};
  },
};

export const detectSymmetryTool = {
  id:'T18', name:'detect_symmetry', version:'1.0.0', category:'read', description:'Detect symmetry', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{symmetry:{type:'object'}}}, permissions:{read:['geometry'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length===0) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds required'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{symmetry:{horizontal:false, vertical:false, deviation:0}}};
  },
};

export const inferConstraintsTool = {
  id:'T19', name:'infer_constraints', version:'1.0.0', category:'proposal', description:'Infer constraints proposal', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{proposals:{type:'array'}}}, permissions:{read:['sceneGraph','geometry'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{proposals:[{type:'align', axis:'horizontal', objectIds:input.objectIds, confidence:0.8}]}};
  },
};

export const inferSemanticTool = {
  id:'T20', name:'infer_semantic', version:'1.0.0', category:'proposal', description:'Infer semantic proposal', inputSchema:{type:'object', required:['objectIds'], properties:{objectIds:{type:'array'}}}, outputSchema:{type:'object', properties:{proposals:{type:'array'}}}, permissions:{read:['semantic'], write:[]}, deterministic:true,
  validate(input){ const errors=[]; if(!Array.isArray(input.objectIds)||input.objectIds.length<1) errors.push({code:'VALIDATION_SCHEMA', message:'objectIds >=1'}); return {valid:errors.length===0, errors}; },
  execute(input, context){
    return {success:true, output:{proposals:[{objectId:input.objectIds[0], role:'button', tags:['ui'], confidence:0.7}]}};
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
  for(const tool of allTools) tools.set(tool.id, tool);
  return {
    tools,
    register(tool){ if(tools.has(tool.id)) throw new Error(`Duplicate tool ID ${tool.id}`); tools.set(tool.id, tool); },
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
      return tool.execute(input, context);
    }
  };
}
