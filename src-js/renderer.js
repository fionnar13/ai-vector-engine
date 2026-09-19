
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

function identityMatrix(){ return {a:1,b:0,c:0,d:1,tx:0,ty:0}; }
function multiplyMatrix(parent, child){
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

export function createDiagnostic(code, message, severity='warning', nodeId){
  return {code, message, severity, nodeId};
}

export const DiagnosticCodes = {
  RENDER_INVALID_GEOMETRY: 'RENDER_INVALID_GEOMETRY',
  RENDER_UNSUPPORTED_APPEARANCE: 'RENDER_UNSUPPORTED_APPEARANCE',
  RENDER_MISSING_OBJECT: 'RENDER_MISSING_OBJECT',
  RENDER_MISSING_GEOMETRY: 'RENDER_MISSING_GEOMETRY',
  RENDER_MISSING_APPEARANCE: 'RENDER_MISSING_APPEARANCE',
  RENDER_INVALID_TRANSFORM: 'RENDER_INVALID_TRANSFORM',
  RENDER_CANVAS_FAILURE: 'RENDER_CANVAS_FAILURE',
  FONT_FALLBACK: 'FONT_FALLBACK'
};

export function resolveRenderGeometry(geometry){
  if(!geometry) return {type:'unknown', canonicalType:'unknown'};
  const type=geometry.type;
  switch(type){
    case 'rect': return {type:'rect', canonicalType:'rect', params:geometry.params};
    case 'ellipse': return {type:'ellipse', canonicalType:'ellipse', params:geometry.params};
    case 'path': return {type:'path', canonicalType:'path', pathData:geometry};
    case 'polygon': return {type:'polygon', canonicalType:'polygon', params:geometry.params};
    case 'star': return {type:'star', canonicalType:'star', params:geometry.params};
    case 'line': return {type:'line', canonicalType:'line', params:geometry.params};
    case 'text':
    case 'pointText': return {type:'text', canonicalType:'text', params:geometry.params};
    default:
      if(geometry.contours) return {type:'path', canonicalType:type||'unknown', pathData:geometry};
      return {type:'unknown', canonicalType:type||'unknown', params:geometry.params};
  }
}

export function resolveRenderAppearance(appearance, diagnostics){
  const result={fills:[], strokes:[], opacity:1};
  if(!appearance){
    diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_APPEARANCE, 'Appearance missing, using default', 'warning'));
    return result;
  }
  for(const item of appearance.stack||[]){
    if(!item.enabled) continue;
    if(item.type==='fill'){
      const data=item.data;
      if(data?.kind==='solid' && data.color){
        result.fills.push({color:data.color, opacity:data.opacity??1});
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, `Unsupported fill kind: ${data?.kind}`, 'warning', appearance.id));
      }
    } else if(item.type==='stroke'){
      const data=item.data;
      if(data?.color){
        result.strokes.push({color:data.color, width:data.width??1, opacity:data.opacity??1});
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, 'Unsupported stroke', 'warning', appearance.id));
      }
    } else if(item.type==='effect'){
      diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, `Effect not supported in MVP: ${item.type}`, 'warning', appearance.id));
    }
  }
  return result;
}

export function createSaveCommand(){ return {type:'Save'}; }
export function createRestoreCommand(){ return {type:'Restore'}; }
export function createSetTransformCommand(matrix){ return {type:'SetTransform', payload:{matrix}}; }
export function createSetOpacityCommand(opacity){ return {type:'SetOpacity', payload:{opacity}}; }
export function createBeginPathCommand(){ return {type:'BeginPath'}; }
export function createMoveToCommand(x,y){ return {type:'MoveTo', payload:{x,y}}; }
export function createLineToCommand(x,y){ return {type:'LineTo', payload:{x,y}}; }
export function createCubicToCommand(cp1x,cp1y,cp2x,cp2y,x,y){ return {type:'CubicTo', payload:{cp1x,cp1y,cp2x,cp2y,x,y}}; }
export function createClosePathCommand(){ return {type:'ClosePath'}; }
export function createFillCommand(fillRule, color){ return {type:'Fill', payload:{fillRule, color}}; }
export function createStrokeCommand(color, width){ return {type:'Stroke', payload:{color, width}}; }
export function createDrawTextCommand(text,x,y,style){ return {type:'DrawText', payload:{text,x,y,style}}; }

export function generateCommandsForNode(node){
  const commands=[];
  if(!node.visible) return commands;
  commands.push(createSaveCommand());
  commands.push(createSetTransformCommand(node.worldTransform));
  commands.push(createSetOpacityCommand(node.effectiveOpacity));
  if(node.geometry){
    commands.push(createBeginPathCommand());
    const geom=node.geometry;
    if(geom.type==='rect' && geom.params){
      const {x,y,width,height,rx,ry}=geom.params;
      commands.push(createMoveToCommand(x+(rx||0), y));
      commands.push(createLineToCommand(x+width-(rx||0), y));
      commands.push(createLineToCommand(x+width, y+height));
      commands.push(createLineToCommand(x, y+height));
      commands.push(createClosePathCommand());
    } else if(geom.type==='ellipse' && geom.params){
      const {cx,cy,rx,ry}=geom.params;
      commands.push(createMoveToCommand(cx+rx, cy));
      commands.push({type:'DrawText', payload:{text:`ellipse ${cx},${cy} rx=${rx} ry=${ry}`, x:cx, y:cy, style:{}}});
    } else if(geom.type==='path' && geom.pathData){
      const path=geom.pathData;
      for(const contour of path.contours||[]){
        if(contour.anchors && contour.anchors.length>0){
          const first=contour.anchors[0];
          commands.push(createMoveToCommand(first.position.x, first.position.y));
          for(let i=1;i<contour.anchors.length;i++){
            const anchor=contour.anchors[i];
            const prev=contour.anchors[i-1];
            if(prev.handleOut && anchor.handleIn && (prev.handleOut.x!==0||prev.handleOut.y!==0||anchor.handleIn.x!==0||anchor.handleIn.y!==0)){
              commands.push(createCubicToCommand(prev.position.x+prev.handleOut.x, prev.position.y+prev.handleOut.y, anchor.position.x+anchor.handleIn.x, anchor.position.y+anchor.handleIn.y, anchor.position.x, anchor.position.y));
            } else {
              commands.push(createLineToCommand(anchor.position.x, anchor.position.y));
            }
          }
          if(contour.closed) commands.push(createClosePathCommand());
        }
      }
    } else if(geom.type==='line' && geom.params){
      const {start,end}=geom.params;
      if(start&&end){
        commands.push(createMoveToCommand(start.x,start.y));
        commands.push(createLineToCommand(end.x,end.y));
      }
    } else if(geom.type==='text' && geom.params){
      const {x,y,content,fontSize,fontFamily}=geom.params;
      commands.push(createDrawTextCommand(content||'', x||0, y||0, {fontSize, fontFamily}));
    }
  }
  if(node.appearance){
    for(const fill of node.appearance.fills){
      commands.push(createFillCommand('nonZero', fill.color));
    }
    for(const stroke of node.appearance.strokes){
      if(stroke.width>0) commands.push(createStrokeCommand(stroke.color, stroke.width));
    }
  }
  commands.push(createRestoreCommand());
  return commands;
}

export function generateCommandsForTree(nodes){
  const allCommands=[];
  function traverse(nodeList){
    for(const node of nodeList){
      if(!node.visible) continue;
      const cmds=generateCommandsForNode(node);
      allCommands.push(...cmds);
      if(node.children && node.children.length>0) traverse(node.children);
    }
  }
  traverse(nodes);
  return allCommands;
}

export function createViewport(x,y,width,height){ return {x,y,width,height}; }
export function viewportIntersects(a,b){ return !(b.maxX < a.x || b.minX > a.x + a.width || b.maxY < a.y || b.minY > a.y + a.height); }

export class InvalidationTracker {
  constructor(){ this.invalidated=new Set(); this.fullRebuildNeeded=false; }
  invalidate(nodeIds){ for(const id of nodeIds) this.invalidated.add(id); }
  invalidateAll(){ this.fullRebuildNeeded=true; this.invalidated.clear(); }
  needsFullRebuild(){ return this.fullRebuildNeeded; }
  getInvalidated(){ return new Set(this.invalidated); }
  clear(){ this.invalidated.clear(); this.fullRebuildNeeded=false; }
  isInvalidated(nodeId){ return this.fullRebuildNeeded || this.invalidated.has(nodeId); }
}

export class RenderTreeImpl {
  constructor(version, artboardId, nodes){
    this.version=version;
    this.artboardId=artboardId||null;
    this.nodes=nodes;
    this.nodeMap=new Map();
    this.buildMap(nodes);
  }
  buildMap(nodes){
    for(const node of nodes){
      this.nodeMap.set(node.nodeId, node);
      if(node.children) this.buildMap(node.children);
    }
  }
  getNode(nodeId){ return this.nodeMap.get(nodeId); }
  getAllNodes(){ return Array.from(this.nodeMap.values()); }
}

export class RenderTreeBuilder {
  constructor(stores){ this.stores=stores; this.version=0; }

  build(artboard){
    this.version++;
    const diagnostics=[];
    const rootNodes=this.getRootNodes();
    const renderNodes=[];
    for(const root of rootNodes){
      const node=this.buildNodeRecursive(root, identityMatrix(), 1, 0, diagnostics);
      if(node) renderNodes.push(node);
    }
    const tree=new RenderTreeImpl(this.version, artboard?.id||null, renderNodes);
    return {tree, diagnostics};
  }

  getRootNodes(){
    const sg=this.stores.sceneGraph;
    if(sg.getRoots) return sg.getRoots();
    if(sg.getAllNodes){
      const all=sg.getAllNodes();
      return all.filter(n=>!n.parent);
    }
    if(sg.roots) return Array.from(sg.roots.values());
    return [];
  }

  buildNodeRecursive(sceneNode, parentWorld, parentOpacity, depth, diagnostics){
    const localTransform=sceneNode.localTransform||identityMatrix();
    const worldTransform=multiplyMatrix(parentWorld, localTransform);
    const objectId=sceneNode.objectRef||null;
    let geometry=null;
    let appearance=null;
    let visible=true;
    let locked=false;
    let opacity=1;

    if(objectId){
      const obj=this.stores.objectStore.get(objectId);
      if(!obj){
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_OBJECT, `Object not found: ${objectId}`, 'warning', sceneNode.id));
        visible=false;
      } else {
        visible=obj.meta?.visible!==false;
        locked=obj.meta?.locked===true;
        opacity=obj.meta?.opacity??1;
        const geomId=obj.geometryRef;
        const geom=this.stores.geometryStore.get(geomId);
        if(!geom){
          diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_GEOMETRY, `Geometry not found: ${geomId}`, 'warning', sceneNode.id));
        } else {
          geometry=resolveRenderGeometry(geom);
        }
        const appId=obj.appearanceRef;
        const app=this.stores.appearanceStore.get(appId);
        if(!app){
          diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_APPEARANCE, `Appearance not found: ${appId}`, 'warning', sceneNode.id));
          appearance={fills:[], strokes:[], opacity:1};
        } else {
          appearance=resolveRenderAppearance(app, diagnostics);
        }
      }
    } else {
      visible=true;
    }

    if(sceneNode.visible===false) visible=false;

    const appearanceOpacity=appearance?.opacity ?? 1;
    const localOpacity=opacity * appearanceOpacity;
    let effectiveOpacity=parentOpacity * localOpacity;
    effectiveOpacity=Math.max(0, Math.min(1, effectiveOpacity));

    const children=[];
    const childIds=sceneNode.children||[];
    for(const childId of childIds){
      const childNode=this.stores.sceneGraph.findNode(childId);
      if(!childNode){
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_OBJECT, `Child node not found: ${childId}`, 'warning', sceneNode.id));
        continue;
      }
      const childRenderNode=this.buildNodeRecursive(childNode, worldTransform, effectiveOpacity, depth+1, diagnostics);
      if(childRenderNode){
        if(!visible) childRenderNode.visible=false;
        children.push(childRenderNode);
      }
    }

    return {
      nodeId: sceneNode.id,
      objectId,
      type: objectId ? 'object' : 'group',
      worldTransform: deepClone(worldTransform),
      localTransform: deepClone(localTransform),
      geometry,
      appearance,
      visible,
      locked,
      opacity,
      effectiveOpacity,
      children,
      depth
    };
  }
}

export class Renderer {
  constructor(stores, eventBus){
    this.stores=stores;
    this.builder=new RenderTreeBuilder(stores);
    this.invalidation=new InvalidationTracker();
    this.renderTree=null;
    this.config={};
    this.diagnostics=[];
    this.eventBus=eventBus||null;
    this.unsubscribe=null;
    if(this.eventBus) this.subscribeToEvents();
  }

  subscribeToEvents(){
    if(!this.eventBus) return;
    this.unsubscribe=this.eventBus.subscribe('TransactionCommitted', (event)=>{
      this.invalidateAll();
    });
  }

  initialize(config){
    this.config=config;
    this.invalidation.invalidateAll();
  }

  buildRenderTree(artboard){
    const {tree, diagnostics}=this.builder.build(artboard);
    this.renderTree=tree;
    this.diagnostics=diagnostics;
    this.invalidation.clear();
    return tree;
  }

  render(viewport){
    if(!this.renderTree || this.invalidation.needsFullRebuild()){
      this.buildRenderTree();
    }
    if(!this.renderTree){
      return {success:false, renderedNodeCount:0, skippedNodeCount:0, diagnostics:[createDiagnostic('RENDER_INVALID_GEOMETRY','No RenderTree','error')]};
    }

    function countNodes(nodes){
      let r=0, s=0;
      for(const node of nodes){
        if(!node.visible){ s++; continue; }
        r++;
        if(node.children){
          const childCount=countNodes(node.children);
          r+=childCount.rendered;
          s+=childCount.skipped;
        }
      }
      return {rendered:r, skipped:s};
    }

    const counts=countNodes(this.renderTree.nodes);
    const commands=generateCommandsForTree(this.renderTree.nodes);

    return {
      success:true,
      renderedNodeCount: counts.rendered,
      skippedNodeCount: counts.skipped,
      diagnostics: this.diagnostics,
      commands
    };
  }

  invalidate(nodeIds){ this.invalidation.invalidate(nodeIds); }
  invalidateAll(){ this.invalidation.invalidateAll(); }
  dispose(){
    if(this.unsubscribe){ this.unsubscribe(); this.unsubscribe=null; }
    this.renderTree=null;
    this.invalidation.clear();
  }
  getRenderTree(){ return this.renderTree; }
  getInvalidationTracker(){ return this.invalidation; }
}

// Canvas2D backend - browser-only isolated
export class BrowserCanvasAdapter {
  constructor(canvas){ this.canvas=canvas; }
  getContext(){ return this.canvas.getContext('2d'); }
  clear(){ const ctx=this.getContext(); if(ctx) ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }
  resize(width,height){ this.canvas.width=width; this.canvas.height=height; }
}

export class Canvas2DRenderer {
  constructor(adapter){ this.adapter=adapter; }
  renderCommands(commands){
    const ctx=this.adapter.getContext();
    if(!ctx) return {success:false, renderedNodeCount:0, skippedNodeCount:0, diagnostics:[createDiagnostic('RENDER_CANVAS_FAILURE','Failed to get 2D context','error')]};
    let renderedCount=0;
    try{
      for(const cmd of commands){
        switch(cmd.type){
          case 'Save': ctx.save(); break;
          case 'Restore': ctx.restore(); break;
          case 'SetTransform': { const m=cmd.payload.matrix; ctx.setTransform(m.a,m.b,m.c,m.d,m.tx,m.ty); break; }
          case 'SetOpacity': { ctx.globalAlpha=cmd.payload.opacity; break; }
          case 'BeginPath': ctx.beginPath(); break;
          case 'MoveTo': ctx.moveTo(cmd.payload.x, cmd.payload.y); break;
          case 'LineTo': ctx.lineTo(cmd.payload.x, cmd.payload.y); break;
          case 'CubicTo': ctx.bezierCurveTo(cmd.payload.cp1x,cmd.payload.cp1y,cmd.payload.cp2x,cmd.payload.cp2y,cmd.payload.x,cmd.payload.y); break;
          case 'ClosePath': ctx.closePath(); break;
          case 'Fill': { const color=cmd.payload.color; ctx.fillStyle=`rgba(${color.r},${color.g},${color.b},${color.a})`; ctx.fill(cmd.payload.fillRule==='evenOdd'?'evenodd':'nonzero'); renderedCount++; break; }
          case 'Stroke': { const color=cmd.payload.color; ctx.strokeStyle=`rgba(${color.r},${color.g},${color.b},${color.a})`; ctx.lineWidth=cmd.payload.width; ctx.stroke(); renderedCount++; break; }
          case 'DrawText': { const {text,x,y,style}=cmd.payload; ctx.font=`${style.fontStyle||''} ${style.fontWeight||''} ${style.fontSize||16}px ${style.fontFamily||'system-ui'}`.trim(); ctx.fillText(text,x,y); renderedCount++; break; }
          default: break;
        }
      }
      return {success:true, renderedNodeCount:renderedCount, skippedNodeCount:0, diagnostics:[]};
    }catch(e){
      return {success:false, renderedNodeCount:0, skippedNodeCount:0, diagnostics:[createDiagnostic('RENDER_CANVAS_FAILURE',`Canvas render failed: ${e.message}`,'error')]};
    }
  }
}
