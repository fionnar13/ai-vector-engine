
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export const VALID_ROLES = new Set(['background','foreground','container','group','text','heading','button','icon','logo','image','illustration','decorative','shape','unknown']);
export const VALID_SOURCES = new Set(['user','ai','heuristic','import','system']);
export const VALID_REL_TYPES = new Set(['contains','containedBy','labels','associatedWith','decorates','references']);

export function normalizeTag(tag){
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function normalizeTags(tags){
  const normalized=[];
  const seen=new Set();
  for(const t of tags){
    if(typeof t!=='string') continue;
    const nt=normalizeTag(t);
    if(nt.length===0) continue;
    if(!seen.has(nt)){ seen.add(nt); normalized.push(nt); }
  }
  return normalized.sort();
}

export function validateSemanticData(data){
  const errors=[];
  if(!data.objectId || typeof data.objectId!=='string' || !isUUID(data.objectId)){
    errors.push({code:'VALIDATION_SCHEMA', message:`Invalid ObjectID: ${data.objectId}`});
  }
  if(data.role!==undefined){
    if(typeof data.role!=='string' || data.role.length===0){
      errors.push({code:'VALIDATION_SCHEMA', message:`Invalid role: ${data.role}`});
    } else {
      if(!VALID_ROLES.has(data.role)){
        if(!/^[a-z_][a-z0-9_]*$/.test(data.role)){
          errors.push({code:'VALIDATION_SCHEMA', message:`Invalid role format: ${data.role}`});
        }
      }
    }
  }
  if(typeof data.confidence!=='number' || !Number.isFinite(data.confidence) || isNaN(data.confidence)){
    errors.push({code:'VALIDATION_SCHEMA', message:`Invalid confidence: ${data.confidence}`});
  } else {
    if(data.confidence<0 || data.confidence>1){
      errors.push({code:'VALIDATION_SCHEMA', message:`Confidence out of range [0,1]: ${data.confidence}`});
    }
  }
  if(!Array.isArray(data.tags)){
    errors.push({code:'VALIDATION_SCHEMA', message:'Tags must be array'});
  } else {
    for(const t of data.tags){
      if(typeof t!=='string'){
        errors.push({code:'VALIDATION_SCHEMA', message:`Tag must be string: ${t}`});
      }
      if(t===undefined || t===null){
        errors.push({code:'VALIDATION_SCHEMA', message:'Tag contains undefined/null'});
      }
    }
    const normalized=data.tags.map(normalizeTag).filter(s=>s.length>0);
    const seen=new Set();
    for(const nt of normalized){
      if(seen.has(nt)){
        errors.push({code:'VALIDATION_SCHEMA', message:`Duplicate tag after normalization: ${nt}`});
        break;
      }
      seen.add(nt);
    }
  }
  if(!data.source || !VALID_SOURCES.has(data.source)){
    errors.push({code:'VALIDATION_SCHEMA', message:`Invalid source: ${data.source}`});
  }
  if(!Array.isArray(data.relationships)){
    errors.push({code:'VALIDATION_SCHEMA', message:'Relationships must be array'});
  } else {
    for(const rel of data.relationships){
      if(!rel.targetObjectId || !isUUID(rel.targetObjectId)){
        errors.push({code:'VALIDATION_SCHEMA', message:`Invalid relationship targetObjectId: ${rel.targetObjectId}`});
      }
      if(!rel.type || !VALID_REL_TYPES.has(rel.type)){
        errors.push({code:'VALIDATION_SCHEMA', message:`Invalid relationship type: ${rel.type}`});
      }
    }
  }
  return {valid: errors.length===0, errors};
}

export class SemanticStore {
  findByRole(role){ const result=[]; for(const [id, data] of this.store){ if(data.role===role) result.push(id); } return result; }

  constructor(){ this.store=new Map(); }
  get(objectId){ const d=this.store.get(objectId); return d?deepClone(d):undefined; }
  has(objectId){ return this.store.has(objectId); }
  set(data){
    const validation=validateSemanticData(data);
    if(!validation.valid) throw new Error(`Semantic validation failed: ${validation.errors.map(e=>e.message).join(', ')}`);
    const normalizedTags=normalizeTags(data.tags);
    const normalizedData={
      ...data,
      tags: normalizedTags,
      relationships: [...data.relationships].sort((a,b)=>{
        const t=a.targetObjectId.localeCompare(b.targetObjectId);
        if(t!==0) return t;
        return a.type.localeCompare(b.type);
      }),
      updatedAt: data.updatedAt ?? Date.now()
    };
    this.store.set(data.objectId, deepClone(normalizedData));
  }
  delete(objectId){ this.store.delete(objectId); }
  clear(){ this.store.clear(); }
  getAll(){ return Array.from(this.store.values()).map(d=>deepClone(d)).sort((a,b)=>a.objectId.localeCompare(b.objectId)); }
  getByRole(role){ return this.getAll().filter(d=>d.role===role); }
  getByTag(tag){ const n=tag.trim().toLowerCase(); return this.getAll().filter(d=>d.tags.includes(n)); }
  size(){ return this.store.size; }
  clone(){ const c=new SemanticStore(); for(const [id,d] of this.store.entries()) c.store.set(id, deepClone(d)); return c; }
  toSnapshot(){ const snap={}; for(const [id,d] of this.store.entries()) snap[id]=deepClone(d); return snap; }
  fromSnapshot(snap){ this.store.clear(); for(const [id,d] of Object.entries(snap)) this.store.set(id, deepClone(d)); }
}

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

export function inferSemantic(input){
  const evidence=[];
  let proposedRole=undefined;
  const proposedTags=[];
  const proposedRelationships=[];
  let baseConfidence=0.5;
  const geometry=input.geometry;
  const appearance=input.appearance;
  const scene=input.sceneContext;

  if(geometry){
    const gType=geometry.type || 'unknown';
    if(gType==='text' || scene?.isText){
      evidence.push({signal:'geometry_type', description:'text object geometry', weight:0.3});
      proposedRole='text';
      proposedTags.push('text');
      baseConfidence=0.7;
      if(scene?.textContent){
        const textLen=scene.textContent.length;
        if(textLen<100){
          evidence.push({signal:'text', description:`short text content length ${textLen}`, weight:0.15});
          if(textLen<50 && scene.textContent.trim().length>0){
            const isUpperOrTitle=scene.textContent===scene.textContent.toUpperCase() || /^[A-Z]/.test(scene.textContent);
            if(isUpperOrTitle && textLen<30){
              evidence.push({signal:'text', description:'potential heading', weight:0.1});
              proposedTags.push('heading');
              if(textLen<20){
                proposedRole='heading';
                baseConfidence=0.65;
              }
            }
          }
        }
      }
    } else if(gType==='rect'){
      evidence.push({signal:'geometry_type', description:'rectangle geometry', weight:0.1});
      const params=geometry.params||{};
      const w=params.width ?? scene?.bbox?.width ?? 0;
      const h=params.height ?? scene?.bbox?.height ?? 0;
      const area=w*h;
      const aspect=h!==0? w/h : 1;
      if(area>0) evidence.push({signal:'size', description:`area ${area}`, weight:0.05});
      if(aspect>2 || aspect<0.5) evidence.push({signal:'aspect_ratio', description:`aspect ratio ${aspect.toFixed(2)}`, weight:0.05});
      if(scene?.bbox){
        const bboxArea=scene.bbox.area;
        if(bboxArea>100000){
          evidence.push({signal:'size', description:'large rectangle', weight:0.2});
          proposedRole='background';
          proposedTags.push('background','shape');
          baseConfidence=0.6;
        } else if(bboxArea<5000){
          evidence.push({signal:'size', description:'small rectangle', weight:0.1});
          proposedRole='shape';
          proposedTags.push('shape');
          baseConfidence=0.55;
          if(appearance && appearance.stack){
            const hasFill=appearance.stack.some(item=> item.type==='fill' && item.enabled);
            if(hasFill){
              evidence.push({signal:'appearance', description:'filled small rect', weight:0.05});
              proposedTags.push('filled');
            }
          }
        } else {
          proposedRole='shape';
          proposedTags.push('shape');
          baseConfidence=0.55;
        }
        evidence.push({signal:'position', description:`position x:${scene.bbox.minX} y:${scene.bbox.minY}`, weight:0.02});
      } else {
        proposedRole='shape';
        proposedTags.push('shape');
        baseConfidence=0.5;
      }
    } else if(gType==='ellipse'){
      evidence.push({signal:'geometry_type', description:'ellipse geometry', weight:0.1});
      proposedRole='shape';
      proposedTags.push('shape','ellipse');
      baseConfidence=0.55;
    } else if(gType==='path' || gType==='polygon' || gType==='star' || gType==='line'){
      evidence.push({signal:'geometry_type', description:`${gType} geometry`, weight:0.1});
      const anchorCount=geometry.contours?.[0]?.anchors?.length ?? geometry.params?.points?.length ?? 0;
      if(anchorCount>0 && anchorCount<10){
        proposedRole='icon';
        proposedTags.push('icon','shape');
        baseConfidence=0.55;
      } else {
        proposedRole='shape';
        proposedTags.push('shape');
        baseConfidence=0.5;
      }
    }
  }

  if(scene){
    if(scene.childCount!==undefined && scene.childCount>0){
      evidence.push({signal:'scene_structure', description:`has ${scene.childCount} children`, weight:0.1});
      if(scene.childCount>2){
        if(proposedRole==='shape'){
          proposedRole='container';
          proposedTags.push('container');
          baseConfidence=Math.max(baseConfidence,0.6);
        }
      }
    }
    if(scene.parentId){
      evidence.push({signal:'scene_structure', description:'has parent', weight:0.02});
    }
  }

  if(appearance && appearance.stack){
    const hasFill=appearance.stack.some(item=> item.type==='fill' && item.enabled);
    const hasStroke=appearance.stack.some(item=> item.type==='stroke' && item.enabled);
    if(hasFill) evidence.push({signal:'appearance', description:'has fill', weight:0.03});
    if(hasStroke) evidence.push({signal:'appearance', description:'has stroke', weight:0.02});
  }

  if(evidence.length===0){
    return {
      proposalId: uuid(),
      objectId: input.objectId,
      proposedRole: 'unknown',
      proposedTags: [],
      proposedRelationships: [],
      confidence: 0.3,
      evidence: [{signal:'geometry_type', description:'insufficient evidence', weight:0}],
      source: 'heuristic',
      createdAt: Date.now()
    };
  }

  const sumWeights=evidence.reduce((acc,e)=>acc+e.weight,0);
  let confidence=clamp01(baseConfidence + sumWeights*0.3);
  if(!proposedRole){
    proposedRole='unknown';
    confidence=Math.min(confidence,0.5);
  }
  if(confidence<0.5 && proposedRole!=='text' && proposedRole!=='heading'){
    proposedRole='unknown';
  }

  const uniqueTags=Array.from(new Set(proposedTags.map(t=> t.trim().toLowerCase()))).sort();
  const sortedEvidence=[...evidence].sort((a,b)=>{
    const s=a.signal.localeCompare(b.signal);
    if(s!==0) return s;
    return a.description.localeCompare(b.description);
  });

  return {
    proposalId: uuid(),
    objectId: input.objectId,
    proposedRole,
    proposedTags: uniqueTags,
    proposedRelationships,
    confidence,
    evidence: sortedEvidence,
    source: 'heuristic',
    createdAt: Date.now()
  };
}

export function inferSemanticBatch(inputs){
  const proposals=[];
  for(const input of inputs){
    const p=inferSemantic(input);
    if(p) proposals.push(p);
  }
  return proposals.sort((a,b)=> a.objectId.localeCompare(b.objectId));
}

export function proposalToSemanticData(proposal, source='heuristic'){
  return {
    objectId: proposal.objectId,
    role: proposal.proposedRole,
    tags: normalizeTags(proposal.proposedTags),
    confidence: proposal.confidence,
    source,
    relationships: [...proposal.proposedRelationships].sort((a,b)=>{
      const t=a.targetObjectId.localeCompare(b.targetObjectId);
      if(t!==0) return t;
      return a.type.localeCompare(b.type);
    }),
    updatedAt: Date.now()
  };
}

export function serializeSemanticData(data){
  const normalized={
    objectId: data.objectId,
    role: data.role,
    tags: normalizeTags(data.tags),
    confidence: data.confidence,
    source: data.source,
    relationships: [...data.relationships].sort((a,b)=> a.targetObjectId.localeCompare(b.targetObjectId))
  };
  if(data.updatedAt!==undefined) normalized.updatedAt=data.updatedAt;
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

export function deserializeSemanticData(json){
  const parsed=JSON.parse(json);
  const data={
    objectId: parsed.objectId,
    role: parsed.role,
    tags: parsed.tags ?? [],
    confidence: parsed.confidence ?? 0,
    source: parsed.source ?? 'system',
    relationships: parsed.relationships ?? [],
    updatedAt: parsed.updatedAt
  };
  const validation=validateSemanticData(data);
  if(!validation.valid) throw new Error(`Invalid semantic data: ${validation.errors.map(e=>e.message).join(', ')}`);
  return data;
}

export function createCreateSemanticCommand(input){
  return {
    id: uuid(),
    toolId: 'create_semantic',
    input,
    deterministic:true,
    execute(ctx){
      const validation=validateSemanticData(input.data);
      if(!validation.valid) return {success:false, error: validation.errors.map(e=>e.message).join(', ')};
      const obj=ctx.workingCopy.getObject(input.data.objectId);
      if(!obj) return {success:false, error:`Object not found ${input.data.objectId}`};
      ctx.workingCopy.setSemantic(input.data);
      return {success:true};
    },
    getAffectedIds(){ return {semantic:[input.data.objectId]}; },
    getInverse(){
      return {id:uuid(), toolId:'delete_semantic', input:{objectId:input.data.objectId}, deterministic:true, execute(ctx){ ctx.workingCopy.deleteSemantic(input.data.objectId); return {success:true}; }, getAffectedIds(){ return {semantic:[input.data.objectId]}; }};
    }
  };
}

export function createUpdateSemanticCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId: 'update_semantic',
    input,
    deterministic:true,
    execute(ctx){
      const existing=ctx.workingCopy.getSemantic(input.objectId);
      if(!existing) return {success:false, error:`Semantic not found ${input.objectId}`};
      before=deepClone(existing);
      const mode=input.mode ?? 'replace';
      let updated;
      if(mode==='replace'){
        updated={
          objectId: existing.objectId,
          role: input.data.role ?? existing.role,
          tags: input.data.tags ?? existing.tags,
          confidence: input.data.confidence ?? existing.confidence,
          source: input.data.source ?? existing.source,
          relationships: input.data.relationships ?? existing.relationships,
          updatedAt: Date.now()
        };
      } else {
        const mergedTags=Array.from(new Set([...existing.tags, ...(input.data.tags??[])])).sort();
        const mergedRels=[...existing.relationships];
        if(input.data.relationships){
          for(const rel of input.data.relationships){
            if(!mergedRels.some(r=> r.targetObjectId===rel.targetObjectId && r.type===rel.type)) mergedRels.push(rel);
          }
        }
        mergedRels.sort((a,b)=> a.targetObjectId.localeCompare(b.targetObjectId));
        updated={
          objectId: existing.objectId,
          role: input.data.role ?? existing.role,
          tags: mergedTags,
          confidence: input.data.confidence ?? existing.confidence,
          source: input.data.source ?? existing.source,
          relationships: mergedRels,
          updatedAt: Date.now()
        };
      }
      const validation=validateSemanticData(updated);
      if(!validation.valid) return {success:false, error: validation.errors.map(e=>e.message).join(', ')};
      ctx.workingCopy.setSemantic(updated);
      return {success:true};
    },
    getAffectedIds(){ return {semantic:[input.objectId]}; },
    getInverse(){
      if(!before) return null;
      return {id:uuid(), toolId:'update_semantic', input:{objectId:input.objectId, data:before, mode:'replace'}, deterministic:true, execute(ctx){ ctx.workingCopy.setSemantic(before); return {success:true}; }, getAffectedIds(){ return {semantic:[input.objectId]}; }};
    }
  };
}

export function createDeleteSemanticCommand(input){
  let before=null;
  return {
    id: uuid(),
    toolId:'delete_semantic',
    input,
    deterministic:true,
    execute(ctx){
      const existing=ctx.workingCopy.getSemantic(input.objectId);
      if(!existing) return {success:false, error:`Semantic not found ${input.objectId}`};
      before=deepClone(existing);
      ctx.workingCopy.deleteSemantic(input.objectId);
      return {success:true};
    },
    getAffectedIds(){ return {semantic:[input.objectId]}; },
    getInverse(){
      if(!before) return null;
      return {id:uuid(), toolId:'create_semantic', input:{data:before}, deterministic:true, execute(ctx){ ctx.workingCopy.setSemantic(before); return {success:true}; }, getAffectedIds(){ return {semantic:[before.objectId]}; }};
    }
  };
}
