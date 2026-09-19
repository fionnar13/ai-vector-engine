
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function isUUID(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export const VALID_TYPES = new Set(['horizontal','vertical','alignLeft','alignRight','alignTop','alignBottom','alignCenterX','alignCenterY','equalWidth','equalHeight','fixedDistance']);
export const VALID_STRENGTHS = new Set(['required','strong','weak']);
export const VALID_SOURCES = new Set(['user','ai']);
export const DEFAULT_TOLERANCE = 1e-9;
export const MAX_ITERATIONS = 10;

export function validateConstraintSchema(constraint){
  const errors=[];
  if(!constraint){ errors.push({code:'CONSTRAINT_INVALID', message:'Constraint is null'}); return {valid:false, errors}; }
  if(!constraint.id || typeof constraint.id!=='string' || !isUUID(constraint.id)){
    errors.push({code:'CONSTRAINT_INVALID', message:`Invalid ConstraintID: ${constraint.id}`});
  }
  if(!constraint.type || !VALID_TYPES.has(constraint.type)){
    errors.push({code:'CONSTRAINT_INVALID', message:`Invalid type: ${constraint.type}`});
  }
  if(!Array.isArray(constraint.objectIds) || constraint.objectIds.length===0){
    errors.push({code:'CONSTRAINT_INSUFFICIENT_OBJECTS', message:'Requires objectIds'});
  } else {
    for(const oid of constraint.objectIds){
      if(!oid || typeof oid!=='string' || !isUUID(oid)){
        errors.push({code:'CONSTRAINT_INVALID', message:`Invalid ObjectID: ${oid}`});
      }
    }
  }
  if(typeof constraint.enabled!=='boolean'){
    errors.push({code:'CONSTRAINT_INVALID', message:'enabled must be boolean'});
  }
  if(!constraint.strength || !VALID_STRENGTHS.has(constraint.strength)){
    errors.push({code:'CONSTRAINT_INVALID', message:`Invalid strength: ${constraint.strength}`});
  }
  if(!constraint.source || !VALID_SOURCES.has(constraint.source)){
    errors.push({code:'CONSTRAINT_INVALID', message:`Invalid source: ${constraint.source}`});
  }
  if(constraint.parameters){
    const p=constraint.parameters;
    if(p.distance!==undefined){
      if(typeof p.distance!=='number' || !Number.isFinite(p.distance) || isNaN(p.distance)){
        errors.push({code:'CONSTRAINT_INVALID_PARAMETER', message:`Invalid distance: ${p.distance}`});
      }
    }
    if(p.tolerance!==undefined){
      if(typeof p.tolerance!=='number' || !Number.isFinite(p.tolerance) || isNaN(p.tolerance) || p.tolerance<0){
        errors.push({code:'CONSTRAINT_INVALID_PARAMETER', message:`Invalid tolerance: ${p.tolerance}`});
      }
    }
  }
  if(constraint.type==='fixedDistance'){
    if(constraint.objectIds && constraint.objectIds.length!==2){
      errors.push({code:'CONSTRAINT_INSUFFICIENT_OBJECTS', message:'fixedDistance requires exactly 2'});
    }
    if(constraint.parameters?.distance===undefined){
      errors.push({code:'CONSTRAINT_INVALID_PARAMETER', message:'fixedDistance requires distance'});
    }
  } else {
    if(constraint.objectIds && constraint.objectIds.length<2){
      errors.push({code:'CONSTRAINT_INSUFFICIENT_OBJECTS', message:`${constraint.type} requires >=2`});
    }
  }
  return {valid: errors.length===0, errors};
}

export function validateConstraintDomain(constraint, existingObjectIds){
  const errors=[];
  for(const oid of constraint.objectIds){
    if(!existingObjectIds.has(oid)){
      errors.push({code:'CONSTRAINT_OBJECT_NOT_FOUND', message:`Object not found: ${oid}`, context:{objectId:oid}});
    }
  }
  return {valid: errors.length===0, errors};
}

// BBox helpers
export function getCenter(bbox){ return {x:(bbox.minX+bbox.maxX)/2, y:(bbox.minY+bbox.maxY)/2}; }
export function getWidth(bbox){ return bbox.maxX-bbox.minX; }
export function getHeight(bbox){ return bbox.maxY-bbox.minY; }
export function distanceBetweenCenters(a,b){
  const ca=getCenter(a), cb=getCenter(b);
  return Math.hypot(ca.x-cb.x, ca.y-cb.y);
}
export function applyCorrectionToBBox(bbox, translation){
  return {minX:bbox.minX+translation.x, minY:bbox.minY+translation.y, maxX:bbox.maxX+translation.x, maxY:bbox.maxY+translation.y};
}

// Evaluator
export function evaluateConstraint(constraint, context, tolerance){
  const tol = tolerance ?? constraint.parameters?.tolerance ?? context.tolerance ?? DEFAULT_TOLERANCE;
  if(!constraint.enabled) return [];
  const bboxes=new Map();
  for(const oid of constraint.objectIds){
    const bbox=context.getWorldBBox(oid);
    if(!bbox) return [];
    bboxes.set(oid, bbox);
  }
  const violations=[];
  const ref = bboxes.get(constraint.objectIds[0]);
  if(!ref) return [];
  switch(constraint.type){
    case 'horizontal':
    case 'alignCenterY': {
      const refCenter=getCenter(ref);
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const c=getCenter(bbox);
        const error=Math.abs(c.y-refCenter.y);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'vertical':
    case 'alignCenterX': {
      const refCenter=getCenter(ref);
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const c=getCenter(bbox);
        const error=Math.abs(c.x-refCenter.x);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'alignLeft': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(bbox.minX-ref.minX);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'alignRight': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(bbox.maxX-ref.maxX);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'alignTop': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(bbox.minY-ref.minY);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'alignBottom': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(bbox.maxY-ref.maxY);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'equalWidth': {
      const refW=getWidth(ref);
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(getWidth(bbox)-refW);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'equalHeight': {
      const refH=getHeight(ref);
      for(let i=1;i<constraint.objectIds.length;i++){
        const bbox=bboxes.get(constraint.objectIds[i]);
        const error=Math.abs(getHeight(bbox)-refH);
        if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); break; }
      }
      break;
    }
    case 'fixedDistance': {
      if(constraint.objectIds.length!==2) break;
      const a=bboxes.get(constraint.objectIds[0]);
      const b=bboxes.get(constraint.objectIds[1]);
      const target=constraint.parameters?.distance;
      if(target===undefined) break;
      const actual=distanceBetweenCenters(a,b);
      const error=Math.abs(actual-target);
      if(error>tol){ violations.push({constraintId:constraint.id, type:constraint.type, objectIds:constraint.objectIds, error, tolerance:tol}); }
      break;
    }
  }
  return violations;
}

export function isConstraintSatisfied(constraint, context, tolerance){
  return evaluateConstraint(constraint, context, tolerance).length===0;
}

// Corrections
export function calculateCorrections(constraint, state){
  const corrections=[];
  if(!constraint.enabled) return corrections;
  const refId=constraint.objectIds[0];
  const refBBox=state.bboxes.get(refId);
  if(!refBBox) return corrections;
  switch(constraint.type){
    case 'horizontal':
    case 'alignCenterY': {
      const refCenter=getCenter(refBBox);
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const c=getCenter(bbox);
        const dy=refCenter.y-c.y;
        if(Math.abs(dy)>1e-12) corrections.push({objectId:oid, translation:{x:0,y:dy}, reason:constraint.id});
      }
      break;
    }
    case 'vertical':
    case 'alignCenterX': {
      const refCenter=getCenter(refBBox);
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const c=getCenter(bbox);
        const dx=refCenter.x-c.x;
        if(Math.abs(dx)>1e-12) corrections.push({objectId:oid, translation:{x:dx,y:0}, reason:constraint.id});
      }
      break;
    }
    case 'alignLeft': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const dx=refBBox.minX-bbox.minX;
        if(Math.abs(dx)>1e-12) corrections.push({objectId:oid, translation:{x:dx,y:0}, reason:constraint.id});
      }
      break;
    }
    case 'alignRight': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const dx=refBBox.maxX-bbox.maxX;
        if(Math.abs(dx)>1e-12) corrections.push({objectId:oid, translation:{x:dx,y:0}, reason:constraint.id});
      }
      break;
    }
    case 'alignTop': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const dy=refBBox.minY-bbox.minY;
        if(Math.abs(dy)>1e-12) corrections.push({objectId:oid, translation:{x:0,y:dy}, reason:constraint.id});
      }
      break;
    }
    case 'alignBottom': {
      for(let i=1;i<constraint.objectIds.length;i++){
        const oid=constraint.objectIds[i];
        const bbox=state.bboxes.get(oid);
        if(!bbox) continue;
        const dy=refBBox.maxY-bbox.maxY;
        if(Math.abs(dy)>1e-12) corrections.push({objectId:oid, translation:{x:0,y:dy}, reason:constraint.id});
      }
      break;
    }
    case 'fixedDistance': {
      if(constraint.objectIds.length!==2) break;
      const target=constraint.parameters?.distance;
      if(target===undefined) break;
      const oidA=constraint.objectIds[0];
      const oidB=constraint.objectIds[1];
      const bboxA=state.bboxes.get(oidA);
      const bboxB=state.bboxes.get(oidB);
      if(!bboxA||!bboxB) break;
      const centerA=getCenter(bboxA);
      const centerB=getCenter(bboxB);
      const dx=centerB.x-centerA.x;
      const dy=centerB.y-centerA.y;
      const currentDist=Math.hypot(dx,dy);
      if(currentDist<1e-12){
        corrections.push({objectId:oidB, translation:{x:target,y:0}, reason:constraint.id});
      } else {
        const ratio=target/currentDist;
        const newX=centerA.x+dx*ratio;
        const newY=centerA.y+dy*ratio;
        const transX=newX-centerB.x;
        const transY=newY-centerB.y;
        if(Math.abs(transX)>1e-12||Math.abs(transY)>1e-12){
          corrections.push({objectId:oidB, translation:{x:transX,y:transY}, reason:constraint.id});
        }
      }
      break;
    }
    case 'equalWidth':
    case 'equalHeight':
      break;
  }
  return corrections;
}

export function convertWorldTranslationToLocal(worldTranslation, parentWorldTransform){
  try{
    // invert matrix
    const m=parentWorldTransform;
    const det=m.a*m.d - m.b*m.c;
    if(Math.abs(det)<1e-12) return worldTranslation;
    const invDet=1/det;
    const inv={a:m.d*invDet, b:-m.b*invDet, c:-m.c*invDet, d:m.a*invDet, tx:(m.c*m.ty - m.d*m.tx)*invDet, ty:(m.b*m.tx - m.a*m.ty)*invDet};
    const localX=inv.a*worldTranslation.x + inv.c*worldTranslation.y;
    const localY=inv.b*worldTranslation.x + inv.d*worldTranslation.y;
    return {x:localX, y:localY};
  }catch{ return worldTranslation; }
}

// Store
export class ConstraintStore {
  constructor(){ this.store=new Map(); }
  create(constraint){
    if(!isUUID(constraint.id)) throw new Error(`Invalid ConstraintID ${constraint.id}`);
    if(this.store.has(constraint.id)) throw new Error(`Duplicate ${constraint.id}`);
    this.store.set(constraint.id, deepClone(constraint));
  }
  get(id){ const c=this.store.get(id); return c?deepClone(c):undefined; }
  has(id){ return this.store.has(id); }
  update(id, constraint){
    if(!this.store.has(id)) throw new Error(`Constraint not found ${id}`);
    if(id!==constraint.id) throw new Error('ID mismatch');
    this.store.set(id, deepClone(constraint));
  }
  delete(id){
    if(!this.store.has(id)) throw new Error(`Constraint not found ${id}`);
    this.store.delete(id);
  }
  list(){ return Array.from(this.store.values()).map(c=>deepClone(c)); }
  listIds(){ return Array.from(this.store.keys()); }
  listByObjectId(objectId){ return this.list().filter(c=>c.objectIds.includes(objectId)); }
  clear(){ this.store.clear(); }
  size(){ return this.store.size; }
  clone(){
    const cloned=new ConstraintStore();
    for(const [id,c] of this.store.entries()) cloned.store.set(id, deepClone(c));
    return cloned;
  }
}

// Solver
function strengthPriority(strength){
  switch(strength){
    case 'required': return 3;
    case 'strong': return 2;
    case 'weak': return 1;
    default: return 0;
  }
}

export class DeterministicConstraintSolver {
  solve(constraints, context){
    const tolerance = context.tolerance ?? DEFAULT_TOLERANCE;
    const enabled=constraints.filter(c=>c.enabled);
    const sorted=[...enabled].sort((a,b)=>{
      const spA=strengthPriority(a.strength), spB=strengthPriority(b.strength);
      if(spA!==spB) return spB-spA;
      return a.id.localeCompare(b.id);
    });

    const workingBBoxes=new Map();
    const workingWorldTransforms=new Map();
    const parentWorldTransforms=new Map();

    for(const oid of context.objectIds){
      const bbox=context.getWorldBBox(oid);
      const wt=context.getWorldTransform(oid);
      if(bbox) workingBBoxes.set(oid, {...bbox});
      if(wt) workingWorldTransforms.set(oid, {...wt});
      if(context.getParentWorldTransform){
        const pwt=context.getParentWorldTransform(oid);
        if(pwt) parentWorldTransforms.set(oid, {...pwt});
      }
    }

    const allCorrections=[];
    let iterations=0;
    let hasCorrections=false;

    for(iterations=0; iterations<MAX_ITERATIONS; iterations++){
      let madeProgress=false;
      const workingContext={
        objectIds: context.objectIds,
        getWorldBBox: (oid)=> workingBBoxes.get(oid) || null,
        getWorldTransform: (oid)=> workingWorldTransforms.get(oid) || null,
        getParentWorldTransform: (oid)=> parentWorldTransforms.get(oid) || null,
        tolerance
      };

      for(const constraint of sorted){
        const violations=evaluateConstraint(constraint, workingContext, tolerance);
        if(violations.length===0) continue;
        if(constraint.type==='equalWidth' || constraint.type==='equalHeight') continue;

        const state={bboxes:workingBBoxes, worldTransforms:workingWorldTransforms, parentWorldTransforms};
        const corrections=calculateCorrections(constraint, state);
        for(const corr of corrections){
          const bbox=workingBBoxes.get(corr.objectId);
          if(bbox){
            const newBBox=applyCorrectionToBBox(bbox, corr.translation);
            workingBBoxes.set(corr.objectId, newBBox);
          }
          madeProgress=true;
        }
        // Merge corrections
        for(const ic of corrections){
          const existingIdx=allCorrections.findIndex(c=>c.objectId===ic.objectId);
          if(existingIdx>=0){
            const existing=allCorrections[existingIdx];
            allCorrections[existingIdx]={objectId:existing.objectId, translation:{x:existing.translation.x+ic.translation.x, y:existing.translation.y+ic.translation.y}, reason:existing.reason};
          } else {
            allCorrections.push({...ic});
          }
        }
      }

      if(correctionsMadeInIteration(correctionsCount=>{})){}
      if(!madeProgress) break;
      hasCorrections=true;
    }

    const finalContext={
      objectIds: context.objectIds,
      getWorldBBox: (oid)=> workingBBoxes.get(oid) || null,
      getWorldTransform: (oid)=> workingWorldTransforms.get(oid) || null,
      getParentWorldTransform: (oid)=> parentWorldTransforms.get(oid) || null,
      tolerance
    };

    const finalViolations=[];
    for(const constraint of sorted){
      const v=evaluateConstraint(constraint, finalContext, tolerance);
      finalViolations.push(...v);
    }

    const hasRequiredViolation=finalViolations.some(v=>{
      const c=sorted.find(sc=>sc.id===v.constraintId);
      return c?.strength==='required';
    });

    let status;
    if(hasRequiredViolation) status='unsatisfiable';
    else if(hasCorrections && finalViolations.length===0) status='corrected';
    else if(!hasCorrections && finalViolations.length===0) status='satisfied';
    else {
      const onlyWeak=finalViolations.every(v=>{
        const c=sorted.find(sc=>sc.id===v.constraintId);
        return c?.strength!=='required';
      });
      status=onlyWeak?'corrected':'unsatisfiable';
    }

    const hasEqualSizeRequiredViolation=finalViolations.some(v=>{
      const c=sorted.find(sc=>sc.id===v.constraintId);
      return c && (c.type==='equalWidth'||c.type==='equalHeight') && c.strength==='required';
    });
    if(hasEqualSizeRequiredViolation) status='unsatisfiable';

    return {status, corrections: allCorrections, violations: finalViolations, iterations: iterations+1};
  }
}

function correctionsMadeInIteration(){ return true; }

export function createConstraintSolver(){
  return new DeterministicConstraintSolver();
}

// Commands - JS runtime version for tests
export function createCreateConstraintCommand(input){
  return {
    id: uuid(),
    toolId: 'create_constraint',
    input,
    deterministic:true,
    execute(ctx){
      const validation=validateConstraintSchema(input.constraint);
      if(!validation.valid) return {success:false, error: validation.errors.map(e=>e.message).join(', ')};
      for(const oid of input.constraint.objectIds){
        const obj=ctx.workingCopy.getObject(oid);
        if(!obj) return {success:false, error:`Object not found ${oid}`};
      }
      ctx.workingCopy.setConstraint(input.constraint);
      return {success:true};
    },
    getAffectedIds(){ return {constraints:[input.constraint.id]}; },
    getInverse(){
      return {id:uuid(), toolId:'delete_constraint', input:{constraintId:input.constraint.id}, deterministic:true, execute(ctx){ ctx.workingCopy.deleteConstraint(input.constraint.id); return {success:true}; }, getAffectedIds(){ return {constraints:[input.constraint.id]}; }};
    }
  };
}

export function createDeleteConstraintCommand(input){
  let before=null;
  return {
    id:uuid(),
    toolId:'delete_constraint',
    input,
    deterministic:true,
    execute(ctx){
      const existing=ctx.workingCopy.getConstraint(input.constraintId);
      if(!existing) return {success:false, error:`Constraint not found ${input.constraintId}`};
      before=deepClone(existing);
      ctx.workingCopy.deleteConstraint(input.constraintId);
      return {success:true};
    },
    getAffectedIds(){ return {constraints:[input.constraintId]}; },
    getInverse(){
      if(!before) return null;
      return {id:uuid(), toolId:'create_constraint', input:{constraint:before}, deterministic:true, execute(ctx){ ctx.workingCopy.setConstraint(before); return {success:true}; }, getAffectedIds(){ return {constraints:[before.id]}; }};
    }
  };
}

export function createApplyConstraintCorrectionsCommand(input){
  const beforeTransforms=new Map();
  return {
    id:uuid(),
    toolId:'apply_constraint_corrections',
    input,
    deterministic:true,
    execute(ctx){
      for(const corr of input.corrections){
        const node=ctx.workingCopy.getNodeByObjectId?ctx.workingCopy.getNodeByObjectId(corr.objectId):null;
        if(node){
          const localTransform=ctx.workingCopy.getNodeLocalTransform?ctx.workingCopy.getNodeLocalTransform(node.id):node.localTransform;
          if(localTransform){
            beforeTransforms.set(corr.objectId, {...localTransform});
            let localTranslation=corr.translation;
            if(ctx.workingCopy.getParentWorldTransform){
              try{
                const parentWT=ctx.workingCopy.getParentWorldTransform(node.id);
                if(parentWT){
                  const det=parentWT.a*parentWT.d - parentWT.b*parentWT.c;
                  if(Math.abs(det)>1e-12){
                    const invDet=1/det;
                    const inv={a:parentWT.d*invDet, b:-parentWT.b*invDet, c:-parentWT.c*invDet, d:parentWT.a*invDet, tx:(parentWT.c*parentWT.ty - parentWT.d*parentWT.tx)*invDet, ty:(parentWT.b*parentWT.tx - parentWT.a*parentWT.ty)*invDet};
                    localTranslation={x:inv.a*corr.translation.x + inv.c*corr.translation.y, y:inv.b*corr.translation.x + inv.d*corr.translation.y};
                  }
                }
              }catch{}
            }
            const newTransform={...localTransform, tx:localTransform.tx+localTranslation.x, ty:localTransform.ty+localTranslation.y};
            ctx.workingCopy.setNodeTransform(node.id, newTransform);
          }
        }
      }
      return {success:true};
    },
    getAffectedIds(){ return {objects: input.corrections.map(c=>c.objectId)}; },
    getInverse(){
      return {id:uuid(), toolId:'apply_corrections_inverse', input:{before:Array.from(beforeTransforms.entries())}, deterministic:true, execute(ctx){
        for(const [objectId, before] of beforeTransforms.entries()){
          const node=ctx.workingCopy.getNodeByObjectId?ctx.workingCopy.getNodeByObjectId(objectId):null;
          if(node) ctx.workingCopy.setNodeTransform(node.id, before);
        }
        return {success:true};
      }, getAffectedIds(){ return {objects:Array.from(beforeTransforms.keys())}; }};
    }
  };
}
