
import { GeometryStore, AppearanceStore, ObjectStore } from './stores.js';
import { SceneGraph } from './scenegraph.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

function invertMatrix(m){
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet
  };
}
function applyMatrix(m, v){
  return { x: m.a * v.x + m.c * v.y + m.tx, y: m.b * v.x + m.d * v.y + m.ty };
}
function multiplyMatrix(a,b){
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty
  };
}
function translationMatrix(tx,ty){ return { a:1,b:0,c:0,d:1,tx,ty}; }
function identityMatrix(){ return { a:1,b:0,c:0,d:1,tx:0,ty:0}; }
function pointInRect(p, r){ return p.x>=r.x && p.x<=r.x+r.width && p.y>=r.y && p.y<=r.y+r.height; }
function pointInEllipse(p,cx,cy,rx,ry){
  if(rx<=0||ry<=0) return false;
  const dx=(p.x-cx)/rx, dy=(p.y-cy)/ry;
  return dx*dx+dy*dy<=1;
}
function pointInPolygon(point, polygon){
  let inside=false;
  const n=polygon.length;
  for(let i=0,j=n-1;i<n;j=i++){
    const xi=polygon[i].x, yi=polygon[i].y;
    const xj=polygon[j].x, yj=polygon[j].y;
    const intersect = (yi>point.y)!==(yj>point.y) && point.x < ((xj-xi)*(point.y-yi))/(yj-yi)+xi;
    if(intersect) inside=!inside;
  }
  return inside;
}
function distancePointToSegment(p,a,b){
  const abx=b.x-a.x, aby=b.y-a.y;
  const apx=p.x-a.x, apy=p.y-a.y;
  const abLenSq=abx*abx+aby*aby;
  if(abLenSq<1e-12) return { distance: Math.hypot(apx,apy), closest:a };
  let t=(apx*abx+apy*aby)/abLenSq;
  t=Math.max(0,Math.min(1,t));
  const closest={ x:a.x+abx*t, y:a.y+aby*t };
  return { distance: Math.hypot(p.x-closest.x, p.y-closest.y), closest };
}

export function createModifiers(shift=false, ctrl=false, alt=false, meta=false){
  return { shift, ctrl, alt, meta };
}
export function createPointerInput(pointerId, type, position, buttons=1, modifiers=createModifiers(), pressure=1, timestamp=Date.now()){
  return { pointerId, type, position, buttons, pressure, modifiers, timestamp };
}
export function createKeyboardInput(type, key, modifiers=createModifiers(), timestamp=Date.now()){
  return { type, key, modifiers, timestamp };
}

export class ViewportTransformImpl {
  constructor(matrix){
    this.matrix = matrix || { a:1,b:0,c:0,d:1,tx:0,ty:0 };
    this.invMatrix = invertMatrix(this.matrix);
  }
  setMatrix(matrix){
    this.matrix=matrix;
    this.invMatrix=invertMatrix(matrix);
  }
  screenToWorld(point){ return applyMatrix(this.invMatrix, point); }
  worldToScreen(point){ return applyMatrix(this.matrix, point); }
  getMatrix(){ return {...this.matrix}; }
  getInverseMatrix(){ return {...this.invMatrix}; }
}
export function createViewportTransform(matrix){ return new ViewportTransformImpl(matrix); }

export class SelectionManager {
  constructor(){
    this.state={ selectedNodeIds:[], activeNodeId:null };
    this.listeners=[];
  }
  getState(){ return { selectedNodeIds:[...this.state.selectedNodeIds], activeNodeId:this.state.activeNodeId }; }
  select(nodeId){
    if(!this.state.selectedNodeIds.includes(nodeId)){
      this.state={ selectedNodeIds:[...this.state.selectedNodeIds, nodeId], activeNodeId:nodeId };
      this.emit();
    } else {
      this.setActive(nodeId);
    }
  }
  deselect(nodeId){
    const filtered=this.state.selectedNodeIds.filter(id=>id!==nodeId);
    if(filtered.length!==this.state.selectedNodeIds.length){
      this.state={ selectedNodeIds:filtered, activeNodeId: filtered.length>0?filtered[filtered.length-1]:null };
      this.emit();
    }
  }
  toggle(nodeId){
    if(this.state.selectedNodeIds.includes(nodeId)) this.deselect(nodeId);
    else this.select(nodeId);
  }
  replaceSelection(nodeIds){
    const unique=Array.from(new Set(nodeIds));
    this.state={ selectedNodeIds:unique, activeNodeId: unique.length>0?unique[unique.length-1]:null };
    this.emit();
  }
  addToSelection(nodeIds){
    const current=new Set(this.state.selectedNodeIds);
    const added=[...this.state.selectedNodeIds];
    for(const id of nodeIds){ if(!current.has(id)){ added.push(id); current.add(id); } }
    this.state={ selectedNodeIds:added, activeNodeId: added.length>0?added[added.length-1]:this.state.activeNodeId };
    this.emit();
  }
  removeFromSelection(nodeIds){
    const toRemove=new Set(nodeIds);
    const filtered=this.state.selectedNodeIds.filter(id=>!toRemove.has(id));
    this.state={ selectedNodeIds:filtered, activeNodeId: filtered.includes(this.state.activeNodeId)?this.state.activeNodeId:(filtered.length>0?filtered[filtered.length-1]:null) };
    this.emit();
  }
  clearSelection(){
    if(this.state.selectedNodeIds.length>0){
      this.state={ selectedNodeIds:[], activeNodeId:null };
      this.emit();
    }
  }
  setActiveNode(nodeId){
    if(nodeId!==this.state.activeNodeId){
      this.state={ selectedNodeIds:this.state.selectedNodeIds, activeNodeId:nodeId };
      this.emit();
    }
  }
  setActive(nodeId){ this.setActiveNode(nodeId); }
  isSelected(nodeId){ return this.state.selectedNodeIds.includes(nodeId); }
  hasSelection(){ return this.state.selectedNodeIds.length>0; }
  subscribe(listener){ this.listeners.push(listener); return ()=>{ this.listeners=this.listeners.filter(l=>l!==listener); }; }
  emit(){ const snap=this.getState(); for(const l of this.listeners) l(snap); }
  setState(state){ this.state={ selectedNodeIds:[...state.selectedNodeIds], activeNodeId:state.activeNodeId }; this.emit(); }
}

export class HoverManager {
  constructor(){
    this.state={ nodeId:null, kind:null };
    this.listeners=[];
  }
  getState(){ return {...this.state}; }
  setHover(nodeId, kind=null){
    if(this.state.nodeId!==nodeId || this.state.kind!==kind){
      this.state={ nodeId, kind };
      this.emit();
    }
  }
  clear(){
    if(this.state.nodeId!==null){
      this.state={ nodeId:null, kind:null };
      this.emit();
    }
  }
  subscribe(listener){ this.listeners.push(listener); return ()=>{ this.listeners=this.listeners.filter(l=>l!==listener); }; }
  emit(){ const snap=this.getState(); for(const l of this.listeners) l(snap); }
}

export class InteractionStateMachine {
  constructor(){
    this.state='Idle';
    this.listeners=[];
    this.transitions=new Map();
    this.setupDefaultTransitions();
  }
  setupDefaultTransitions(){
    this.addTransition({ from:['Idle'], event:'pointermove', to:'Hover' });
    this.addTransition({ from:['Hover','Idle'], event:'pointerdown', to:'Pressed' });
    this.addTransition({ from:['Pressed'], event:'dragstart', to:'Dragging' });
    this.addTransition({ from:['Pressed'], event:'marqueestart', to:'MarqueeSelecting' });
    this.addTransition({ from:['Pressed'], event:'pointerup', to:'Idle' });
    this.addTransition({ from:['Dragging'], event:'pointerup', to:'Idle' });
    this.addTransition({ from:['Dragging'], event:'cancel', to:'Idle' });
    this.addTransition({ from:['MarqueeSelecting'], event:'pointerup', to:'Idle' });
    this.addTransition({ from:['MarqueeSelecting'], event:'cancel', to:'Idle' });
    this.addTransition({ from:['Hover'], event:'pointerup', to:'Hover' });
    this.addTransition({ from:['Hover','Pressed','Dragging','MarqueeSelecting','Transforming','AnchorEditing'], event:'cancel', to:'Idle' });
    this.addTransition({ from:['Pressed','Hover','Idle'], event:'transformstart', to:'Transforming' });
    this.addTransition({ from:['Transforming'], event:'pointerup', to:'Idle' });
    this.addTransition({ from:['Transforming'], event:'cancel', to:'Idle' });
    this.addTransition({ from:['Pressed','Hover','Idle'], event:'anchoreditstart', to:'AnchorEditing' });
    this.addTransition({ from:['AnchorEditing'], event:'pointerup', to:'AnchorEditing' });
    this.addTransition({ from:['AnchorEditing'], event:'cancel', to:'Idle' });
    this.addTransition({ from:['Idle'], event:'pointerdown', to:'Pressed' });
  }
  addTransition(transition){
    const list=this.transitions.get(transition.event)||[];
    list.push(transition);
    this.transitions.set(transition.event,list);
  }
  getState(){ return this.state; }
  canTransition(event){
    const transitions=this.transitions.get(event)||[];
    return transitions.some(t=>t.from.includes(this.state));
  }
  transition(event,input){
    const transitions=this.transitions.get(event)||[];
    for(const trans of transitions){
      if(trans.from.includes(this.state)){
        if(trans.guard && !trans.guard(input)) continue;
        const from=this.state;
        this.state=trans.to;
        this.emit(from,trans.to,event);
        return true;
      }
    }
    return false;
  }
  reset(){
    const from=this.state;
    this.state='Idle';
    if(from!=='Idle') this.emit(from,'Idle','reset');
  }
  setState(state){
    const from=this.state;
    this.state=state;
    this.emit(from,state,'setState');
  }
  subscribe(listener){ this.listeners.push(listener); return ()=>{ this.listeners=this.listeners.filter(l=>l!==listener); }; }
  emit(from,to,event){ for(const l of this.listeners) l(from,to,event); }
}

export class HitTester {
  constructor(stores, config={}){
    this.stores=stores;
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
  }
  hitTest(worldPoint, options={}){
    const candidates=this.getCandidates(worldPoint);
    const hits=[];
    const ordered=this.sortByZOrder(candidates);
    const topFirst=[...ordered].reverse();
    for(const nodeId of topFirst){
      const result=this.testNode(nodeId, worldPoint, options);
      if(result && result.kind!=='none') hits.push(result);
    }
    return { hits };
  }
  hitTestTopmost(worldPoint, options={}){
    const results=this.hitTest(worldPoint, options);
    return results.hits.length>0?results.hits[0]:null;
  }
  getCandidates(worldPoint){
    if(this.stores.spatialIndex){
      try{
        const candidates=this.stores.spatialIndex.queryPoint(worldPoint, this.config.hitTolerance);
        if(candidates && candidates.length>0) return candidates;
      }catch{}
    }
    const allNodes=this.stores.sceneGraph.getAllNodes?this.stores.sceneGraph.getAllNodes():[];
    return allNodes.map(n=>n.id);
  }
  sortByZOrder(nodeIds){
    const orderMap=new Map();
    let index=0;
    const visit=(node)=>{
      orderMap.set(node.id,index++);
      for(const childId of node.children||[]){
        const child=this.stores.sceneGraph.findNode(childId);
        if(child) visit(child);
      }
    };
    const roots=this.stores.sceneGraph.getRoots?this.stores.sceneGraph.getRoots():[];
    for(const root of roots) visit(root);
    return [...nodeIds].sort((a,b)=>{
      const oa=orderMap.get(a)??0;
      const ob=orderMap.get(b)??0;
      return oa-ob;
    });
  }
  testNode(nodeId, worldPoint, options){
    const sceneNode=this.stores.sceneGraph.findNode(nodeId);
    if(!sceneNode) return null;
    const objectId=sceneNode.objectRef;
    if(!objectId) return null;
    const obj=this.stores.objectStore.get(objectId);
    if(!obj) return null;
    if(obj.meta?.visible===false && !options.includeHidden && !this.config.allowHiddenSelection) return null;
    if(obj.meta?.locked===true && !options.includeLocked && !this.config.allowLockedSelection) return null;
    const worldTransform=this.stores.sceneGraph.getWorldTransform?this.stores.sceneGraph.getWorldTransform(nodeId):sceneNode.localTransform;
    const invWorld=invertMatrix(worldTransform);
    const localPoint=applyMatrix(invWorld, worldPoint);
    const geometry=this.stores.geometryStore.get(obj.geometryRef);
    const appearance=this.stores.appearanceStore.get(obj.appearanceRef);
    if(!geometry) return null;
    if(geometry.type==='path' && geometry.contours){
      const anchorHit=this.hitTestAnchors(geometry, localPoint, worldPoint, nodeId, objectId);
      if(anchorHit) return anchorHit;
    }
    const fillResult=this.testFill(geometry, localPoint, worldPoint, nodeId, objectId);
    if(fillResult) return fillResult;
    const strokeResult=this.testStroke(geometry, appearance, localPoint, worldPoint, nodeId, objectId);
    if(strokeResult) return strokeResult;
    return null;
  }
  hitTestAnchors(geometry, localPoint, worldPoint, nodeId, objectId){
    const tolerance=this.config.anchorHitTolerance;
    let closest=null;
    for(let ci=0; ci<geometry.contours.length; ci++){
      const contour=geometry.contours[ci];
      for(let ai=0; ai<contour.anchors.length; ai++){
        const anchor=contour.anchors[ai];
        const pos=anchor.position;
        const dist=Math.hypot(localPoint.x-pos.x, localPoint.y-pos.y);
        if(dist<=tolerance){
          if(!closest || dist<closest.distance) closest={ index:ai, kind:'position', distance:dist };
        }
        if(anchor.handleIn){
          const handleInPos={ x:pos.x+anchor.handleIn.x, y:pos.y+anchor.handleIn.y };
          const distIn=Math.hypot(localPoint.x-handleInPos.x, localPoint.y-handleInPos.y);
          if(distIn<=tolerance){
            if(!closest || distIn<closest.distance) closest={ index:ai, kind:'in', distance:distIn };
          }
        }
        if(anchor.handleOut){
          const handleOutPos={ x:pos.x+anchor.handleOut.x, y:pos.y+anchor.handleOut.y };
          const distOut=Math.hypot(localPoint.x-handleOutPos.x, localPoint.y-handleOutPos.y);
          if(distOut<=tolerance){
            if(!closest || distOut<closest.distance) closest={ index:ai, kind:'out', distance:distOut };
          }
        }
      }
    }
    if(closest){
      return {
        nodeId, objectId,
        kind: closest.kind==='position'?'anchor':'handle',
        distance: closest.distance,
        worldPoint, localPoint,
        anchorIndex: closest.index,
        handleKind: closest.kind==='position'?undefined:closest.kind
      };
    }
    return null;
  }
  testFill(geometry, localPoint, worldPoint, nodeId, objectId){
    let inside=false;
    let distance=0;
    switch(geometry.type){
      case 'rect': {
        const { x,y,width,height }=geometry.params;
        inside=pointInRect(localPoint,{x,y,width,height});
        break;
      }
      case 'ellipse': {
        const { cx,cy,rx,ry }=geometry.params;
        inside=pointInEllipse(localPoint,cx,cy,rx,ry);
        break;
      }
      case 'polygon': {
        const points=geometry.params.points||[];
        inside=pointInPolygon(localPoint,points);
        break;
      }
      case 'star': {
        const params=geometry.params;
        const vertices=[];
        const count=params.points*2;
        for(let i=0;i<count;i++){
          const angle=(Math.PI*2*i)/count - Math.PI/2 + ((params.rotationDegrees||0)*Math.PI)/180;
          const radius=i%2===0?params.outerRadius:params.innerRadius;
          vertices.push({ x:params.center.x+Math.cos(angle)*radius, y:params.center.y+Math.sin(angle)*radius });
        }
        inside=pointInPolygon(localPoint,vertices);
        break;
      }
      case 'line': inside=false; break;
      case 'path': {
        const fillRule=geometry.fillRule||'nonZero';
        // simplified pointInPath
        let cInside=false;
        for(const contour of geometry.contours||[]){
          const pts=contour.anchors.map(a=>a.position);
          if(pts.length<3) continue;
          let ci=false;
          for(let i=0,j=pts.length-1;i<pts.length;j=i++){
            const xi=pts[i].x, yi=pts[i].y;
            const xj=pts[j].x, yj=pts[j].y;
            const inter=(yi>localPoint.y)!==(yj>localPoint.y) && localPoint.x < ((xj-xi)*(localPoint.y-yi))/(yj-yi)+xi;
            if(inter) ci=!ci;
          }
          if(fillRule==='evenOdd'){ if(ci) cInside=!cInside; }
          else { if(ci) cInside=true; }
        }
        inside=cInside;
        break;
      }
      default: {
        if(geometry.contours){
          let cInside=false;
          for(const contour of geometry.contours||[]){
            const pts=contour.anchors.map(a=>a.position);
            if(pts.length<3) continue;
            let ci=false;
            for(let i=0,j=pts.length-1;i<pts.length;j=i++){
              const xi=pts[i].x, yi=pts[i].y;
              const xj=pts[j].x, yj=pts[j].y;
              const inter=(yi>localPoint.y)!==(yj>localPoint.y) && localPoint.x < ((xj-xi)*(localPoint.y-yi))/(yj-yi)+xi;
              if(inter) ci=!ci;
            }
            if(ci) cInside=!cInside;
          }
          inside=cInside;
        }
        break;
      }
    }
    if(inside){
      return { nodeId, objectId, kind:'fill', distance, worldPoint, localPoint };
    }
    return null;
  }
  testStroke(geometry, appearance, localPoint, worldPoint, nodeId, objectId){
    if(!appearance || !appearance.stack) return null;
    let strokeWidth=0;
    for(const item of appearance.stack){
      if(item.type==='stroke' && item.enabled) strokeWidth=Math.max(strokeWidth, item.data?.width||1);
    }
    if(strokeWidth<=0) return null;
    const tolerance=this.config.hitTolerance;
    const hitThreshold=strokeWidth/2 + tolerance;
    let distance=Infinity;
    switch(geometry.type){
      case 'rect': {
        const { x,y,width,height }=geometry.params;
        const distLeft=Math.abs(localPoint.x-x);
        const distRight=Math.abs(localPoint.x-(x+width));
        const distTop=Math.abs(localPoint.y-y);
        const distBottom=Math.abs(localPoint.y-(y+height));
        const nearHorizontal=localPoint.x>=x && localPoint.x<=x+width && (distTop<=hitThreshold || distBottom<=hitThreshold);
        const nearVertical=localPoint.y>=y && localPoint.y<=y+height && (distLeft<=hitThreshold || distRight<=hitThreshold);
        if(nearHorizontal||nearVertical) distance=Math.min(distLeft,distRight,distTop,distBottom);
        break;
      }
      case 'ellipse': {
        const { cx,cy,rx,ry }=geometry.params;
        if(rx<=0||ry<=0) break;
        const dx=(localPoint.x-cx)/rx, dy=(localPoint.y-cy)/ry;
        const distFromCenter=Math.sqrt(dx*dx+dy*dy);
        const avgR=(rx+ry)/2;
        distance=Math.abs(distFromCenter-1)*avgR;
        break;
      }
      case 'line': {
        const { start,end }=geometry.params;
        if(start&&end) distance=distancePointToSegment(localPoint,start,end).distance;
        break;
      }
      case 'polygon': {
        const points=geometry.params.points||[];
        let minDist=Infinity;
        for(let i=0;i<points.length;i++){
          const a=points[i], b=points[(i+1)%points.length];
          const d=distancePointToSegment(localPoint,a,b).distance;
          if(d<minDist) minDist=d;
        }
        distance=minDist;
        break;
      }
      case 'path': {
        let minDist=Infinity;
        for(const contour of geometry.contours||[]){
          const pts=contour.anchors.map(a=>a.position);
          for(let i=0;i<pts.length-1;i++){
            const d=distancePointToSegment(localPoint,pts[i],pts[i+1]).distance;
            if(d<minDist) minDist=d;
          }
          if(pts.length>2){
            const d=distancePointToSegment(localPoint,pts[pts.length-1],pts[0]).distance;
            if(d<minDist) minDist=d;
          }
        }
        distance=minDist;
        break;
      }
      default: {
        if(geometry.contours){
          let minDist=Infinity;
          for(const contour of geometry.contours||[]){
            const pts=contour.anchors.map(a=>a.position);
            for(let i=0;i<pts.length-1;i++){
              const d=distancePointToSegment(localPoint,pts[i],pts[i+1]).distance;
              if(d<minDist) minDist=d;
            }
          }
          distance=minDist;
        }
        break;
      }
    }
    if(distance<=hitThreshold){
      return { nodeId, objectId, kind:'stroke', distance, worldPoint, localPoint };
    }
    return null;
  }
  testBBoxIntersection(bbox, marquee, mode){
    if(mode==='contained'){
      return bbox.minX>=marquee.minX && bbox.maxX<=marquee.maxX && bbox.minY>=marquee.minY && bbox.maxY<=marquee.maxY;
    } else {
      return !(bbox.maxX<marquee.minX || bbox.minX>marquee.maxX || bbox.maxY<marquee.minY || bbox.minY>marquee.maxY);
    }
  }
}

export class DragManager {
  constructor(config={}){
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
    this.state={
      isDragging:false,
      dragThreshold:this.config.dragThreshold,
      startWorld:null,
      currentWorld:null,
      delta:{x:0,y:0},
      initialTransforms:new Map(),
      previewTransform:null
    };
  }
  getState(){ return {...this.state, delta:{...this.state.delta}, initialTransforms:new Map(this.state.initialTransforms)}; }
  startDrag(startWorld, initialTransforms){
    this.state={
      isDragging:false,
      dragThreshold:this.config.dragThreshold,
      startWorld:{...startWorld},
      currentWorld:{...startWorld},
      delta:{x:0,y:0},
      initialTransforms:new Map(initialTransforms),
      previewTransform:identityMatrix()
    };
  }
  updateDrag(currentWorld){
    if(!this.state.startWorld) return false;
    const delta={ x:currentWorld.x-this.state.startWorld.x, y:currentWorld.y-this.state.startWorld.y };
    const distance=Math.hypot(delta.x,delta.y);
    if(!this.state.isDragging && distance>=this.state.dragThreshold){
      this.state={ ...this.state, isDragging:true, currentWorld:{...currentWorld}, delta, previewTransform:translationMatrix(delta.x,delta.y) };
      return true;
    }
    if(this.state.isDragging){
      this.state={ ...this.state, currentWorld:{...currentWorld}, delta, previewTransform:translationMatrix(delta.x,delta.y) };
      return true;
    }
    this.state={ ...this.state, currentWorld:{...currentWorld}, delta };
    return false;
  }
  getPreviewTransforms(){
    const result=new Map();
    if(!this.state.isDragging || !this.state.previewTransform) return result;
    for(const [nodeId, initial] of this.state.initialTransforms){
      const preview=multiplyMatrix(translationMatrix(this.state.delta.x,this.state.delta.y), initial);
      result.set(nodeId,preview);
    }
    return result;
  }
  getDelta(){ return {...this.state.delta}; }
  isDragging(){ return this.state.isDragging; }
  endDrag(){
    const result={ delta:{...this.state.delta}, initialTransforms:new Map(this.state.initialTransforms) };
    this.reset();
    return result;
  }
  cancel(){ this.reset(); }
  reset(){
    this.state={ isDragging:false, dragThreshold:this.config.dragThreshold, startWorld:null, currentWorld:null, delta:{x:0,y:0}, initialTransforms:new Map(), previewTransform:null };
  }
}

export class MarqueeManager {
  constructor(config={}){
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
    this.state={ isActive:false, startWorld:null, currentWorld:null, bounds:null };
  }
  getState(){ return {...this.state, startWorld:this.state.startWorld?{...this.state.startWorld}:null, currentWorld:this.state.currentWorld?{...this.state.currentWorld}:null, bounds:this.state.bounds?{...this.state.bounds}:null}; }
  startMarquee(startWorld){
    this.state={ isActive:true, startWorld:{...startWorld}, currentWorld:{...startWorld}, bounds:{ minX:startWorld.x, minY:startWorld.y, maxX:startWorld.x, maxY:startWorld.y } };
  }
  updateMarquee(currentWorld){
    if(!this.state.isActive || !this.state.startWorld) return;
    const minX=Math.min(this.state.startWorld.x,currentWorld.x);
    const minY=Math.min(this.state.startWorld.y,currentWorld.y);
    const maxX=Math.max(this.state.startWorld.x,currentWorld.x);
    const maxY=Math.max(this.state.startWorld.y,currentWorld.y);
    this.state={ isActive:true, startWorld:this.state.startWorld, currentWorld:{...currentWorld}, bounds:{ minX,minY,maxX,maxY } };
  }
  getBounds(){ return this.state.bounds?{...this.state.bounds}:null; }
  isActive(){ return this.state.isActive; }
  endMarquee(){ const bounds=this.state.bounds?{...this.state.bounds}:null; this.reset(); return bounds; }
  cancel(){ this.reset(); }
  reset(){ this.state={ isActive:false, startWorld:null, currentWorld:null, bounds:null }; }
  testIntersection(bbox){
    if(!this.state.bounds) return false;
    if(this.config.selectionMode==='contained'){
      return bbox.minX>=this.state.bounds.minX && bbox.maxX<=this.state.bounds.maxX && bbox.minY>=this.state.bounds.minY && bbox.maxY<=this.state.bounds.maxY;
    } else {
      return !(bbox.maxX<this.state.bounds.minX || bbox.minX>this.state.bounds.maxX || bbox.maxY<this.state.bounds.minY || bbox.minY>this.state.bounds.maxY);
    }
  }
}

export class TransformInteractionManager {
  constructor(config={}){
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
    this.state={ isActive:false, mode:null, pivot:null, initialBounds:null, initialTransforms:new Map(), previewMatrix:null };
  }
  getState(){ return {...this.state, pivot:this.state.pivot?{...this.state.pivot}:null, initialBounds:this.state.initialBounds?{...this.state.initialBounds}:null, initialTransforms:new Map(this.state.initialTransforms), previewMatrix:this.state.previewMatrix?{...this.state.previewMatrix}:null}; }
  startTransform(mode,pivot,initialBounds,initialTransforms){
    this.state={ isActive:true, mode, pivot:{...pivot}, initialBounds:{...initialBounds}, initialTransforms:new Map(initialTransforms), previewMatrix:identityMatrix() };
  }
  updateMove(delta){
    if(!this.state.isActive || this.state.mode!=='move') return;
    this.state={ ...this.state, previewMatrix:translationMatrix(delta.x,delta.y) };
  }
  updateScale(scaleX,scaleY,pivot,uniform=false){
    if(!this.state.isActive || this.state.mode!=='scale') return;
    const p=pivot||this.state.pivot||{x:0,y:0};
    if(uniform){ const avg=(Math.abs(scaleX)+Math.abs(scaleY))/2; scaleX=Math.sign(scaleX)*avg; scaleY=Math.sign(scaleY)*avg; }
    const toOrigin=translationMatrix(-p.x,-p.y);
    const scale={ a:scaleX,b:0,c:0,d:scaleY,tx:0,ty:0 };
    const back=translationMatrix(p.x,p.y);
    const matrix=multiplyMatrix(multiplyMatrix(back,scale),toOrigin);
    this.state={ ...this.state, previewMatrix:matrix };
  }
  updateRotate(degrees,pivot){
    if(!this.state.isActive || this.state.mode!=='rotate') return;
    const p=pivot||this.state.pivot||{x:0,y:0};
    const rad=(degrees*Math.PI)/180;
    const cos=Math.cos(rad), sin=Math.sin(rad);
    const rot={ a:cos,b:sin,c:-sin,d:cos,tx:0,ty:0 };
    const toOrigin=translationMatrix(-p.x,-p.y);
    const back=translationMatrix(p.x,p.y);
    const matrix=multiplyMatrix(multiplyMatrix(back,rot),toOrigin);
    this.state={ ...this.state, previewMatrix:matrix };
  }
  getPreviewTransforms(){
    const result=new Map();
    if(!this.state.isActive || !this.state.previewMatrix) return result;
    for(const [nodeId, initial] of this.state.initialTransforms){
      const preview=multiplyMatrix(this.state.previewMatrix, initial);
      result.set(nodeId,preview);
    }
    return result;
  }
  getPreviewMatrix(){ return this.state.previewMatrix?{...this.state.previewMatrix}:null; }
  isActive(){ return this.state.isActive; }
  endTransform(){
    const result={ mode:this.state.mode, matrix:this.state.previewMatrix?{...this.state.previewMatrix}:null, initialTransforms:new Map(this.state.initialTransforms) };
    this.reset();
    return result;
  }
  cancel(){ this.reset(); }
  reset(){ this.state={ isActive:false, mode:null, pivot:null, initialBounds:null, initialTransforms:new Map(), previewMatrix:null }; }
  static calculateSelectionBoundsCenter(bboxes){
    if(bboxes.length===0) return {x:0,y:0};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const bbox of bboxes){ minX=Math.min(minX,bbox.minX); minY=Math.min(minY,bbox.minY); maxX=Math.max(maxX,bbox.maxX); maxY=Math.max(maxY,bbox.maxY); }
    return { x:(minX+maxX)/2, y:(minY+maxY)/2 };
  }
  static calculateSelectionBounds(bboxes){
    if(bboxes.length===0) return {minX:0,minY:0,maxX:0,maxY:0};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const bbox of bboxes){ minX=Math.min(minX,bbox.minX); minY=Math.min(minY,bbox.minY); maxX=Math.max(maxX,bbox.maxX); maxY=Math.max(maxY,bbox.maxY); }
    return { minX,minY,maxX,maxY };
  }
  static calculateHandles(bounds){
    const { minX,minY,maxX,maxY }=bounds;
    const midX=(minX+maxX)/2, midY=(minY+maxY)/2;
    return [
      { kind:'top-left', position:{x:minX,y:minY}, worldPosition:{x:minX,y:minY} },
      { kind:'top-center', position:{x:midX,y:minY}, worldPosition:{x:midX,y:minY} },
      { kind:'top-right', position:{x:maxX,y:minY}, worldPosition:{x:maxX,y:minY} },
      { kind:'middle-left', position:{x:minX,y:midY}, worldPosition:{x:minX,y:midY} },
      { kind:'middle-right', position:{x:maxX,y:midY}, worldPosition:{x:maxX,y:midY} },
      { kind:'bottom-left', position:{x:minX,y:maxY}, worldPosition:{x:minX,y:maxY} },
      { kind:'bottom-center', position:{x:midX,y:maxY}, worldPosition:{x:midX,y:maxY} },
      { kind:'bottom-right', position:{x:maxX,y:maxY}, worldPosition:{x:maxX,y:maxY} },
      { kind:'rotation', position:{x:midX,y:minY-30}, worldPosition:{x:midX,y:minY-30} }
    ];
  }
  static hitTestHandles(point, handles, tolerance){
    let closest=null, minDist=Infinity;
    for(const handle of handles){
      const dist=Math.hypot(point.x-handle.worldPosition.x, point.y-handle.worldPosition.y);
      if(dist<=tolerance && dist<minDist){ minDist=dist; closest=handle; }
    }
    return closest;
  }
}

export class AnchorInteractionManager {
  constructor(config={}){
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
    this.state={ isActive:false, pathNodeId:null, selectedAnchorIndices:[], hoveredAnchorIndex:null, dragAnchorIndex:null, dragHandleKind:null, initialGeometry:null, previewGeometry:null };
  }
  getState(){ return {...this.state, selectedAnchorIndices:[...this.state.selectedAnchorIndices], initialGeometry:this.state.initialGeometry?JSON.parse(JSON.stringify(this.state.initialGeometry)):null, previewGeometry:this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):null}; }
  startEditing(pathNodeId, geometry){
    this.state={ isActive:true, pathNodeId, selectedAnchorIndices:[], hoveredAnchorIndex:null, dragAnchorIndex:null, dragHandleKind:null, initialGeometry:JSON.parse(JSON.stringify(geometry)), previewGeometry:JSON.parse(JSON.stringify(geometry)) };
  }
  selectAnchor(index, additive=false){
    if(additive){
      if(this.state.selectedAnchorIndices.includes(index)){
        this.state={ ...this.state, selectedAnchorIndices:this.state.selectedAnchorIndices.filter(i=>i!==index) };
      } else {
        this.state={ ...this.state, selectedAnchorIndices:[...this.state.selectedAnchorIndices, index] };
      }
    } else {
      this.state={ ...this.state, selectedAnchorIndices:[index] };
    }
  }
  clearSelection(){ this.state={ ...this.state, selectedAnchorIndices:[] }; }
  startDrag(anchorIndex, handleKind){
    this.state={ ...this.state, dragAnchorIndex:anchorIndex, dragHandleKind:handleKind };
  }
  updateDrag(delta){
    if(this.state.dragAnchorIndex===null || !this.state.previewGeometry) return;
    const preview=JSON.parse(JSON.stringify(this.state.previewGeometry));
    const initial=this.state.initialGeometry;
    if(!preview.contours || preview.contours.length===0) return;
    const contour=preview.contours[0];
    const initialContour=initial.contours[0];
    if(this.state.dragAnchorIndex>=contour.anchors.length) return;
    const anchor=contour.anchors[this.state.dragAnchorIndex];
    const initialAnchor=initialContour.anchors[this.state.dragAnchorIndex];
    if(this.state.dragHandleKind==='position'){
      anchor.position={ x:initialAnchor.position.x+delta.x, y:initialAnchor.position.y+delta.y };
    } else if(this.state.dragHandleKind==='in'){
      const newHandleIn={ x:initialAnchor.handleIn.x+delta.x, y:initialAnchor.handleIn.y+delta.y };
      anchor.handleIn=newHandleIn;
      if(anchor.type==='symmetric'){
        anchor.handleOut={ x:-newHandleIn.x, y:-newHandleIn.y };
      } else if(anchor.type==='smooth'){
        const lenIn=Math.hypot(newHandleIn.x,newHandleIn.y);
        if(lenIn>1e-10){
          const lenOut=Math.hypot(anchor.handleOut.x,anchor.handleOut.y);
          const dirIn={ x:newHandleIn.x/lenIn, y:newHandleIn.y/lenIn };
          const opposite={ x:-dirIn.x, y:-dirIn.y };
          anchor.handleOut={ x:opposite.x*lenOut, y:opposite.y*lenOut };
        }
      }
    } else if(this.state.dragHandleKind==='out'){
      const newHandleOut={ x:initialAnchor.handleOut.x+delta.x, y:initialAnchor.handleOut.y+delta.y };
      anchor.handleOut=newHandleOut;
      if(anchor.type==='symmetric'){
        anchor.handleIn={ x:-newHandleOut.x, y:-newHandleOut.y };
      } else if(anchor.type==='smooth'){
        const lenOut=Math.hypot(newHandleOut.x,newHandleOut.y);
        if(lenOut>1e-10){
          const lenIn=Math.hypot(anchor.handleIn.x,anchor.handleIn.y);
          const dirOut={ x:newHandleOut.x/lenOut, y:newHandleOut.y/lenOut };
          const opposite={ x:-dirOut.x, y:-dirOut.y };
          anchor.handleIn={ x:opposite.x*lenIn, y:opposite.y*lenIn };
        }
      }
    }
    this.state={ ...this.state, previewGeometry:preview };
  }
  getPreviewGeometry(){ return this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):null; }
  getInitialGeometry(){ return this.state.initialGeometry?JSON.parse(JSON.stringify(this.state.initialGeometry)):null; }
  isActive(){ return this.state.isActive; }
  isDragging(){ return this.state.dragAnchorIndex!==null; }
  endDrag(){
    const result={ initialGeometry:this.state.initialGeometry?JSON.parse(JSON.stringify(this.state.initialGeometry)):null, previewGeometry:this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):null, anchorIndex:this.state.dragAnchorIndex, handleKind:this.state.dragHandleKind };
    this.state={ ...this.state, dragAnchorIndex:null, dragHandleKind:null, initialGeometry:this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):this.state.initialGeometry, previewGeometry:this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):null };
    return result;
  }
  endEditing(){
    const result={ initialGeometry:this.state.initialGeometry?JSON.parse(JSON.stringify(this.state.initialGeometry)):null, previewGeometry:this.state.previewGeometry?JSON.parse(JSON.stringify(this.state.previewGeometry)):null };
    this.reset();
    return result;
  }
  cancel(){
    if(this.state.initialGeometry){
      this.state={ ...this.state, previewGeometry:JSON.parse(JSON.stringify(this.state.initialGeometry)), dragAnchorIndex:null, dragHandleKind:null };
    }
    this.reset();
  }
  reset(){ this.state={ isActive:false, pathNodeId:null, selectedAnchorIndices:[], hoveredAnchorIndex:null, dragAnchorIndex:null, dragHandleKind:null, initialGeometry:null, previewGeometry:null }; }
}

export class OverlayManager {
  constructor(){ this.overlay={}; }
  getOverlay(){ return {...this.overlay}; }
  setSelectionBounds(bounds){ this.overlay={...this.overlay, selectionBounds:bounds}; }
  setHandles(handles){ this.overlay={...this.overlay, handles}; }
  setMarquee(marquee){ this.overlay={...this.overlay, marquee}; }
  setHoverOutline(nodeId){ this.overlay={...this.overlay, hoverOutline:nodeId}; }
  setGuides(guides){ this.overlay={...this.overlay, guides}; }
  clear(){ this.overlay={}; }
  clearSelection(){ const { selectionBounds, handles, ...rest }=this.overlay; this.overlay=rest; }
  clearMarquee(){ const { marquee, ...rest }=this.overlay; this.overlay=rest; }
  clearHover(){ const { hoverOutline, ...rest }=this.overlay; this.overlay=rest; }
}

export class InteractionEngine {
  constructor(stores, viewport, config={}, callbacks={}, transactionExecutor){
    this.stores=stores;
    this.viewport=viewport||createViewportTransform();
    this.config={
      hitTolerance: config.hitTolerance??5,
      dragThreshold: config.dragThreshold??3,
      anchorHitTolerance: config.anchorHitTolerance??8,
      handleHitTolerance: config.handleHitTolerance??8,
      keyboardMoveStep: config.keyboardMoveStep??1,
      keyboardMoveStepShift: config.keyboardMoveStepShift??10,
      selectionMode: config.selectionMode??'intersects',
      allowLockedSelection: config.allowLockedSelection??false,
      allowHiddenSelection: config.allowHiddenSelection??false,
      pivotMode: config.pivotMode??'selectionCenter'
    };
    this.stateMachine=new InteractionStateMachine();
    this.selection=new SelectionManager();
    this.hover=new HoverManager();
    this.hitTester=new HitTester(stores,this.config);
    this.dragManager=new DragManager(this.config);
    this.marqueeManager=new MarqueeManager(this.config);
    this.transformManager=new TransformInteractionManager(this.config);
    this.anchorManager=new AnchorInteractionManager(this.config);
    this.overlay=new OverlayManager();
    this.callbacks=callbacks;
    this.transactionExecutor=transactionExecutor;
    this.activeTool='select';
    this.pointerDownPosition=null;
    this.pointerDownWorld=null;
    this.isDraggingForMove=false;
    this.initialTransformsForDrag=new Map();

    this.selection.subscribe((state)=>{
      if(this.callbacks.onSelectionChanged) this.callbacks.onSelectionChanged(state.selectedNodeIds);
      this.updateSelectionOverlay();
    });
    this.hover.subscribe((state)=>{
      if(this.callbacks.onHoverChanged) this.callbacks.onHoverChanged(state.nodeId);
      if(state.nodeId) this.overlay.setHoverOutline(state.nodeId);
      else this.overlay.clearHover();
      this.emitOverlay();
    });
  }
  getSelection(){ return this.selection; }
  getHover(){ return this.hover; }
  getStateMachine(){ return this.stateMachine; }
  getViewport(){ return this.viewport; }
  getOverlay(){ return this.overlay.getOverlay(); }
  getPreview(){
    const preview={};
    if(this.dragManager.isDragging()) preview.transforms=this.dragManager.getPreviewTransforms();
    if(this.transformManager.isActive()) preview.transforms=this.transformManager.getPreviewTransforms();
    if(this.anchorManager.isActive()){
      const geom=this.anchorManager.getPreviewGeometry();
      if(geom){
        preview.geometries=new Map();
        const nodeId=this.anchorManager.getState().pathNodeId;
        if(nodeId) preview.geometries.set(nodeId,geom);
      }
    }
    preview.overlay=this.overlay.getOverlay();
    return preview;
  }
  setActiveTool(tool){ this.activeTool=tool; }
  setTransactionExecutor(executor){ this.transactionExecutor=executor; }
  setViewportMatrix(matrix){ if(this.viewport.setMatrix) this.viewport.setMatrix(matrix); }
  pointerDown(input){
    const worldPos=this.viewport.screenToWorld(input.position);
    this.pointerDownPosition={...input.position};
    this.pointerDownWorld={...worldPos};
    const hasSelection=this.selection.hasSelection();
    if(hasSelection && this.activeTool!=='anchor'){
      const bounds=this.calculateSelectionBounds();
      if(bounds){
        const handles=TransformInteractionManager.calculateHandles(bounds);
        const hitHandle=TransformInteractionManager.hitTestHandles(worldPos,handles,this.config.handleHitTolerance);
        if(hitHandle){
          this.handleTransformHandleDown(hitHandle,worldPos,bounds);
          return;
        }
      }
    }
    if(this.activeTool==='anchor' || this.anchorManager.isActive()){
      this.handleAnchorPointerDown(input,worldPos);
      return;
    }
    const hit=this.hitTester.hitTestTopmost(worldPos);
    this.stateMachine.transition('pointerdown',input);
    if(hit){
      if(this.selection.isSelected(hit.nodeId)){
        const initialTransforms=new Map();
        for(const nodeId of this.selection.getState().selectedNodeIds){
          const sceneNode=this.stores.sceneGraph.findNode(nodeId);
          if(sceneNode) initialTransforms.set(nodeId,{...sceneNode.localTransform});
        }
        this.initialTransformsForDrag=initialTransforms;
        this.dragManager.startDrag(worldPos,initialTransforms);
      } else {
        if(input.modifiers.shift||input.modifiers.ctrl||input.modifiers.meta){
          this.selection.toggle(hit.nodeId);
        } else {
          this.selection.replaceSelection([hit.nodeId]);
        }
        const initialTransforms=new Map();
        for(const nodeId of this.selection.getState().selectedNodeIds){
          const sceneNode=this.stores.sceneGraph.findNode(nodeId);
          if(sceneNode) initialTransforms.set(nodeId,{...sceneNode.localTransform});
        }
        this.initialTransformsForDrag=initialTransforms;
        this.dragManager.startDrag(worldPos,initialTransforms);
      }
    } else {
      if(!input.modifiers.shift && !input.modifiers.ctrl && !input.modifiers.meta){
        this.selection.clearSelection();
      }
      this.marqueeManager.startMarquee(worldPos);
      this.overlay.setMarquee({ minX:worldPos.x, minY:worldPos.y, maxX:worldPos.x, maxY:worldPos.y });
      this.emitOverlay();
    }
    if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,true);
  }
  pointerMove(input){
    const worldPos=this.viewport.screenToWorld(input.position);
    if(this.transformManager.isActive()){
      this.handleTransformMove(input,worldPos);
      return;
    }
    if(this.anchorManager.isDragging()){
      if(this.pointerDownWorld){
        const delta={ x:worldPos.x-this.pointerDownWorld.x, y:worldPos.y-this.pointerDownWorld.y };
        this.anchorManager.updateDrag(delta);
        this.emitPreview();
      }
      return;
    }
    if(this.dragManager.getState().startWorld){
      const started=this.dragManager.updateDrag(worldPos);
      if(started && !this.isDraggingForMove){
        this.isDraggingForMove=true;
        this.stateMachine.transition('dragstart',input);
      }
      if(this.dragManager.isDragging()){
        this.emitPreview();
        return;
      }
    }
    if(this.marqueeManager.isActive()){
      this.marqueeManager.updateMarquee(worldPos);
      const bounds=this.marqueeManager.getBounds();
      if(bounds){
        this.overlay.setMarquee(bounds);
        this.emitOverlay();
      }
      this.stateMachine.transition('marqueestart',input);
      return;
    }
    const hit=this.hitTester.hitTestTopmost(worldPos);
    if(hit) this.hover.setHover(hit.nodeId,hit.kind);
    else this.hover.clear();
    this.stateMachine.transition('pointermove',input);
  }
  pointerUp(input){
    const worldPos=this.viewport.screenToWorld(input.position);
    if(this.transformManager.isActive()){
      const result=this.transformManager.endTransform();
      this.handleTransformCommit(result);
      this.stateMachine.transition('pointerup',input);
      this.emitOverlay();
      if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,false);
      return;
    }
    if(this.anchorManager.isDragging()){
      const result=this.anchorManager.endDrag();
      this.handleAnchorCommit(result);
      this.stateMachine.transition('pointerup',input);
      this.emitPreview();
      if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,false);
      return;
    }
    if(this.dragManager.isDragging()){
      const result=this.dragManager.endDrag();
      this.handleDragCommit(result);
      this.isDraggingForMove=false;
      this.stateMachine.transition('pointerup',input);
      if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,false);
      return;
    }
    if(this.marqueeManager.isActive()){
      const bounds=this.marqueeManager.endMarquee();
      this.overlay.clearMarquee();
      this.emitOverlay();
      if(bounds){
        const candidates=this.getMarqueeCandidates(bounds);
        const eligible=[];
        for(const nodeId of candidates){
          const sceneNode=this.stores.sceneGraph.findNode(nodeId);
          if(!sceneNode) continue;
          const objectId=sceneNode.objectRef;
          if(!objectId) continue;
          const obj=this.stores.objectStore.get(objectId);
          if(!obj) continue;
          if(obj.meta?.visible===false) continue;
          if(obj.meta?.locked===true) continue;
          eligible.push(nodeId);
        }
        if(input.modifiers.shift||input.modifiers.ctrl||input.modifiers.meta){
          this.selection.addToSelection(eligible);
        } else {
          this.selection.replaceSelection(eligible);
        }
      }
      this.stateMachine.transition('pointerup',input);
      if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,false);
      return;
    }
    this.dragManager.reset();
    this.stateMachine.transition('pointerup',input);
    if(this.callbacks.onCaptureRequest) this.callbacks.onCaptureRequest(input.pointerId,false);
  }
  pointerCancel(input){
    this.cancel();
    this.stateMachine.transition('cancel',input);
  }
  keyDown(input){
    if(input.key==='Escape'){ this.cancel(); return; }
    if(input.key==='Delete' || input.key==='Backspace'){ this.handleDelete(); return; }
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(input.key)){ this.handleArrowKey(input); return; }
  }
  keyUp(input){}
  cancel(){
    this.dragManager.cancel();
    this.marqueeManager.cancel();
    this.transformManager.cancel();
    this.anchorManager.cancel();
    this.overlay.clear();
    this.isDraggingForMove=false;
    this.initialTransformsForDrag.clear();
    this.emitPreview();
    this.emitOverlay();
  }
  handleTransformHandleDown(handle, worldPos, bounds){
    const pivot=TransformInteractionManager.calculateSelectionBoundsCenter([bounds]);
    const initialTransforms=new Map();
    for(const nodeId of this.selection.getState().selectedNodeIds){
      const sceneNode=this.stores.sceneGraph.findNode(nodeId);
      if(sceneNode) initialTransforms.set(nodeId,{...sceneNode.localTransform});
    }
    let mode='move';
    let actualPivot=pivot;
    if(handle.kind==='rotation'){ mode='rotate'; actualPivot=pivot; }
    else {
      mode='scale';
      switch(handle.kind){
        case 'top-left': actualPivot={ x:bounds.maxX, y:bounds.maxY }; break;
        case 'top-right': actualPivot={ x:bounds.minX, y:bounds.maxY }; break;
        case 'bottom-left': actualPivot={ x:bounds.maxX, y:bounds.minY }; break;
        case 'bottom-right': actualPivot={ x:bounds.minX, y:bounds.minY }; break;
        case 'top-center': actualPivot={ x:(bounds.minX+bounds.maxX)/2, y:bounds.maxY }; break;
        case 'bottom-center': actualPivot={ x:(bounds.minX+bounds.maxX)/2, y:bounds.minY }; break;
        case 'middle-left': actualPivot={ x:bounds.maxX, y:(bounds.minY+bounds.maxY)/2 }; break;
        case 'middle-right': actualPivot={ x:bounds.minX, y:(bounds.minY+bounds.maxY)/2 }; break;
      }
    }
    this.transformManager.startTransform(mode,actualPivot,bounds,initialTransforms);
    this.pointerDownWorld={...worldPos};
    this.stateMachine.transition('transformstart',{handle,mode});
  }
  handleTransformMove(input, worldPos){
    if(!this.pointerDownWorld) return;
    const state=this.transformManager.getState();
    if(!state.pivot || !state.initialBounds) return;
    if(state.mode==='scale'){
      const bounds=state.initialBounds;
      const dx=worldPos.x-this.pointerDownWorld.x;
      const dy=worldPos.y-this.pointerDownWorld.y;
      const width=bounds.maxX-bounds.minX;
      const height=bounds.maxY-bounds.minY;
      let scaleX=1,scaleY=1;
      if(Math.abs(state.pivot.x-bounds.minX)<1e-6) scaleX=(width+dx)/width;
      else if(Math.abs(state.pivot.x-bounds.maxX)<1e-6) scaleX=(width-dx)/width;
      if(Math.abs(state.pivot.y-bounds.minY)<1e-6) scaleY=(height+dy)/height;
      else if(Math.abs(state.pivot.y-bounds.maxY)<1e-6) scaleY=(height-dy)/height;
      if(!isFinite(scaleX)||width<1e-6) scaleX=1;
      if(!isFinite(scaleY)||height<1e-6) scaleY=1;
      this.transformManager.updateScale(scaleX,scaleY,state.pivot,input.modifiers.shift);
    } else if(state.mode==='rotate'){
      const currentAngle=Math.atan2(worldPos.y-state.pivot.y, worldPos.x-state.pivot.x)*180/Math.PI;
      const startAngle=Math.atan2(this.pointerDownWorld.y-state.pivot.y, this.pointerDownWorld.x-state.pivot.x)*180/Math.PI;
      let deltaAngle=currentAngle-startAngle;
      if(input.modifiers.shift) deltaAngle=Math.round(deltaAngle/15)*15;
      this.transformManager.updateRotate(deltaAngle,state.pivot);
    }
    this.emitPreview();
  }
  handleTransformCommit(result){
    if(!result.matrix) return;
    const previewTransforms=this.transformManager.getPreviewTransforms();
    if(this.callbacks.onTransaction){
      const commands=[];
      for(const [nodeId, initial] of result.initialTransforms){
        const preview=previewTransforms.get(nodeId)||initial;
        commands.push({ type:'SetLocalTransform', payload:{ nodeId, transform:preview, initialTransform:initial } });
      }
      const transaction={ id:'tx-'+Math.random().toString(36).slice(2), commands, source:'user', timestamp:Date.now() };
      this.callbacks.onTransaction(transaction);
      if(this.transactionExecutor){
        try{ this.transactionExecutor.execute(transaction); }catch(e){ console.error('Transaction failed',e); }
      }
    }
    this.pointerDownWorld=null;
  }
  handleAnchorPointerDown(input, worldPos){
    if(this.anchorManager.isActive()){
      const hit=this.hitTester.hitTestTopmost(worldPos);
      if(hit && (hit.kind==='anchor' || hit.kind==='handle')){
        const handleKind=hit.kind==='anchor'?'position':(hit.handleKind==='in'?'in':'out');
        this.anchorManager.selectAnchor(hit.anchorIndex);
        this.anchorManager.startDrag(hit.anchorIndex,handleKind);
        this.pointerDownWorld={...worldPos};
        this.stateMachine.transition('anchoreditstart',input);
      }
    } else {
      const hit=this.hitTester.hitTestTopmost(worldPos);
      if(hit && hit.objectId){
        const obj=this.stores.objectStore.get(hit.objectId);
        if(obj){
          const geom=this.stores.geometryStore.get(obj.geometryRef);
          if(geom && geom.type==='path'){
            this.anchorManager.startEditing(hit.nodeId,geom);
            this.stateMachine.transition('anchoreditstart',input);
          }
        }
      }
    }
  }
  handleAnchorCommit(result){
    if(!result.previewGeometry || !result.initialGeometry) return;
    const state=this.anchorManager.getState();
    const nodeId=state.pathNodeId;
    if(!nodeId) return;
    const sceneNode=this.stores.sceneGraph.findNode(nodeId);
    if(!sceneNode) return;
    const objectId=sceneNode.objectRef;
    if(!objectId) return;
    if(this.callbacks.onTransaction){
      const transaction={ id:'tx-'+Math.random().toString(36).slice(2), commands:[{ type:'UpdateGeometry', payload:{ objectId, geometry:result.previewGeometry, initialGeometry:result.initialGeometry } }], source:'user', timestamp:Date.now() };
      this.callbacks.onTransaction(transaction);
      if(this.transactionExecutor){
        try{ this.transactionExecutor.execute(transaction); }catch(e){ console.error('Transaction failed',e); }
      }
    }
  }
  handleDragCommit(result){
    if(Math.hypot(result.delta.x,result.delta.y)<1e-6) return;
    const previewTransforms=this.dragManager.getPreviewTransforms();
    if(this.callbacks.onTransaction){
      const commands=[];
      for(const [nodeId, initial] of result.initialTransforms){
        const preview=previewTransforms.get(nodeId)||initial;
        commands.push({ type:'SetLocalTransform', payload:{ nodeId, transform:preview, initialTransform:initial, delta:result.delta } });
      }
      const transaction={ id:'tx-'+Math.random().toString(36).slice(2), commands, source:'user', timestamp:Date.now() };
      this.callbacks.onTransaction(transaction);
      if(this.transactionExecutor){
        try{ this.transactionExecutor.execute(transaction); }catch(e){ console.error('Transaction failed',e); }
      }
    }
  }
  handleDelete(){
    const selected=this.selection.getState().selectedNodeIds;
    if(selected.length===0) return;
    if(this.callbacks.onTransaction){
      const commands=[];
      for(const nodeId of selected){
        const sceneNode=this.stores.sceneGraph.findNode(nodeId);
        if(!sceneNode) continue;
        const objectId=sceneNode.objectRef;
        commands.push({ type:'DeleteNode', payload:{ nodeId, objectId } });
      }
      const transaction={ id:'tx-'+Math.random().toString(36).slice(2), commands, source:'user', timestamp:Date.now() };
      this.callbacks.onTransaction(transaction);
      if(this.transactionExecutor){
        try{ this.transactionExecutor.execute(transaction); this.selection.clearSelection(); }catch(e){ console.error('Transaction failed',e); }
      }
    }
  }
  handleArrowKey(input){
    const selected=this.selection.getState().selectedNodeIds;
    if(selected.length===0) return;
    let dx=0,dy=0;
    const step=input.modifiers.shift?this.config.keyboardMoveStepShift:this.config.keyboardMoveStep;
    switch(input.key){
      case 'ArrowUp': dy=-step; break;
      case 'ArrowDown': dy=step; break;
      case 'ArrowLeft': dx=-step; break;
      case 'ArrowRight': dx=step; break;
    }
    if(dx===0&&dy===0) return;
    const initialTransforms=new Map();
    for(const nodeId of selected){
      const sceneNode=this.stores.sceneGraph.findNode(nodeId);
      if(sceneNode) initialTransforms.set(nodeId,{...sceneNode.localTransform});
    }
    if(this.callbacks.onTransaction){
      const commands=[];
      for(const [nodeId, initial] of initialTransforms){
        const preview={ ...initial, tx:initial.tx+dx, ty:initial.ty+dy };
        commands.push({ type:'SetLocalTransform', payload:{ nodeId, transform:preview, initialTransform:initial, delta:{x:dx,y:dy} } });
      }
      const transaction={ id:'tx-'+Math.random().toString(36).slice(2), commands, source:'user', timestamp:Date.now() };
      this.callbacks.onTransaction(transaction);
      if(this.transactionExecutor){
        try{ this.transactionExecutor.execute(transaction); }catch(e){ console.error('Transaction failed',e); }
      }
    }
  }
  getMarqueeCandidates(marquee){
    if(this.stores.spatialIndex){
      try{ return this.stores.spatialIndex.query(marquee); }catch{}
    }
    const allNodes=this.stores.sceneGraph.getAllNodes?this.stores.sceneGraph.getAllNodes():[];
    const result=[];
    for(const node of allNodes){
      const world=this.stores.sceneGraph.getWorldTransform?this.stores.sceneGraph.getWorldTransform(node.id):node.localTransform;
      const bbox={ minX:world.tx, minY:world.ty, maxX:world.tx+10, maxY:world.ty+10 };
      const intersects=!(bbox.maxX<marquee.minX || bbox.minX>marquee.maxX || bbox.maxY<marquee.minY || bbox.minY>marquee.maxY);
      if(intersects) result.push(node.id);
    }
    return result;
  }
  calculateSelectionBounds(){
    const selected=this.selection.getState().selectedNodeIds;
    if(selected.length===0) return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const nodeId of selected){
      const sceneNode=this.stores.sceneGraph.findNode(nodeId);
      if(!sceneNode) continue;
      const world=this.stores.sceneGraph.getWorldTransform?this.stores.sceneGraph.getWorldTransform(nodeId):sceneNode.localTransform;
      let bbox={ minX:world.tx, minY:world.ty, maxX:world.tx+100, maxY:world.ty+100 };
      const objId=sceneNode.objectRef;
      if(objId){
        const obj=this.stores.objectStore.get(objId);
        if(obj){
          const geom=this.stores.geometryStore.get(obj.geometryRef);
          if(geom && geom.type==='rect'){
            const g=geom.params;
            bbox={ minX:world.tx+g.x, minY:world.ty+g.y, maxX:world.tx+g.x+g.width, maxY:world.ty+g.y+g.height };
          }
        }
      }
      minX=Math.min(minX,bbox.minX); minY=Math.min(minY,bbox.minY); maxX=Math.max(maxX,bbox.maxX); maxY=Math.max(maxY,bbox.maxY);
    }
    if(!isFinite(minX)) return null;
    return { minX,minY,maxX,maxY };
  }
  updateSelectionOverlay(){
    const bounds=this.calculateSelectionBounds();
    if(bounds){
      this.overlay.setSelectionBounds(bounds);
      const handles=TransformInteractionManager.calculateHandles(bounds);
      this.overlay.setHandles(handles);
    } else {
      this.overlay.clearSelection();
    }
    this.emitOverlay();
  }
  emitPreview(){ if(this.callbacks.onPreviewChanged) this.callbacks.onPreviewChanged(this.getPreview()); }
  emitOverlay(){ if(this.callbacks.onOverlayChanged) this.callbacks.onOverlayChanged(this.overlay.getOverlay()); }
}
