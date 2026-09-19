
import { vec2 } from './vec2.js';
import * as Mat from './matrix.js';

const TOL=1e-9;

export function vec(x,y){ return {x,y}; }

export function createRect(params){
  let {x,y,width,height,rx,ry} = params;
  if(![x,y,width,height,rx,ry].every(Number.isFinite)) throw new Error('Rect not finite');
  if(rx<0||ry<0) throw new Error('rx/ry negative');
  const maxRx=width/2, maxRy=height/2;
  rx=Math.min(Math.max(0,rx), maxRx);
  ry=Math.min(Math.max(0,ry), maxRy);
  return {isParametric:true, type:'rect', params:{x,y,width,height,rx,ry}};
}
export function rectBBox(p){ return {minX:p.x,minY:p.y,maxX:p.x+p.width,maxY:p.y+p.height}; }
export function isDegenerateRect(p){ return p.width<1e-10||p.height<1e-10; }

export function createEllipse(params){
  let {cx,cy,rx,ry}=params;
  if(![cx,cy,rx,ry].every(Number.isFinite)) throw new Error('Ellipse not finite');
  if(rx<0||ry<0) throw new Error('rx/ry negative');
  return {isParametric:true,type:'ellipse',params:{cx,cy,rx:Math.max(0,rx),ry:Math.max(0,ry)}};
}
export function ellipseBBox(p){ return {minX:p.cx-p.rx,minY:p.cy-p.ry,maxX:p.cx+p.rx,maxY:p.cy+p.ry}; }
export function isDegenerateEllipse(p){ return p.rx<1e-10||p.ry<1e-10; }

export function createPolygon(points){
  if(points.length<3) throw new Error('Polygon needs >=3');
  return {isParametric:true,type:'polygon',params:{points}};
}
export function polygonArea(points){
  let sum=0; const n=points.length;
  for(let i=0;i<n;i++){ const p1=points[i], p2=points[(i+1)%n]; sum+=p1.x*p2.y - p2.x*p1.y; }
  return Math.abs(sum)/2;
}
export function polygonSignedArea(points){
  let sum=0; const n=points.length;
  for(let i=0;i<n;i++){ const p1=points[i], p2=points[(i+1)%n]; sum+=p1.x*p2.y - p2.x*p1.y; }
  return sum/2;
}
export function polygonOrientation(points){
  const s=polygonSignedArea(points);
  if(Math.abs(s)<1e-10) return 'unknown';
  return s>0?'cw':'ccw';
}

export function createStar(params){
  const {center,outerRadius,innerRadius,points,rotationDegrees}=params;
  if(points<3) throw new Error('Star points >=3');
  if(outerRadius<=0) throw new Error('outerRadius <=0');
  if(innerRadius<0||innerRadius>outerRadius) throw new Error('innerRadius invalid');
  return {isParametric:true,type:'star',params};
}
export function generateStarVertices(p){
  const verts=[];
  const total=p.points*2;
  const startDeg=p.rotationDegrees-90;
  const step=360/total;
  for(let i=0;i<total;i++){
    const angleDeg=startDeg+i*step;
    const rad=angleDeg*Math.PI/180;
    const r=i%2===0?p.outerRadius:p.innerRadius;
    verts.push(vec(p.center.x+Math.cos(rad)*r, p.center.y+Math.sin(rad)*r));
  }
  return verts;
}

export function createLine(start,end){
  return {isParametric:true,type:'line',params:{start,end}};
}
export function lineLength(p){ const dx=p.end.x-p.start.x, dy=p.end.y-p.start.y; return Math.hypot(dx,dy); }
export function isDegenerateLine(p){ return lineLength(p)<1e-10; }

// Bezier
export function evaluateCubicBezier(p0,p1,p2,p3,t){
  const mt=1-t;
  const x=mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
  const y=mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
  return vec(x,y);
}
export function cubicBezierBBox(p0,p1,p2,p3){
  // find extrema
  function extrema(p0d,p1d,p2d,p3d){
    const a=-p0d+3*p1d-3*p2d+p3d;
    const b=2*(p0d-2*p1d+p2d);
    const c=-p0d+p1d;
    const roots=[];
    if(Math.abs(a)<1e-12){
      if(Math.abs(b)>1e-12) roots.push(-c/b);
    }else{
      const disc=b*b-4*a*c;
      if(disc>=0){
        if(disc<1e-12) roots.push(-b/(2*a));
        else { const s=Math.sqrt(disc); roots.push((-b+s)/(2*a)); roots.push((-b-s)/(2*a)); }
      }
    }
    return roots.filter(t=>t>0&&t<1);
  }
  const xRoots=extrema(p0.x,p1.x,p2.x,p3.x);
  const yRoots=extrema(p0.y,p1.y,p2.y,p3.y);
  const pts=[p0,p3];
  for(const t of xRoots) pts.push(evaluateCubicBezier(p0,p1,p2,p3,t));
  for(const t of yRoots) pts.push(evaluateCubicBezier(p0,p1,p2,p3,t));
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const pt of pts){ minX=Math.min(minX,pt.x); minY=Math.min(minY,pt.y); maxX=Math.max(maxX,pt.x); maxY=Math.max(maxY,pt.y); }
  return {minX,minY,maxX,maxY};
}

// Contour / Path
let anchorCounter=0;
export function createAnchor(pos, handleIn={x:0,y:0}, handleOut={x:0,y:0}, type='corner'){
  anchorCounter++; return {id:`anchor_${anchorCounter}`, position:pos, handleIn, handleOut, type};
}
export function signedAreaAnchors(anchors){
  let sum=0; const n=anchors.length;
  if(n<3) return 0;
  for(let i=0;i<n;i++){ const p1=anchors[i].position, p2=anchors[(i+1)%n].position; sum+=p1.x*p2.y - p2.x*p1.y; }
  return sum/2;
}
export function computeOrientation(anchors){
  const a=signedAreaAnchors(anchors);
  if(Math.abs(a)<1e-10) return 'unknown';
  return a>0?'cw':'ccw';
}
export function createContour(anchors, closed, id){
  return {id:id||`contour_${Math.random()}`, closed, anchors, orientation:computeOrientation(anchors)};
}
export function createPath(contours, fillRule='nonZero'){
  if(fillRule!=='nonZero'&&fillRule!=='evenOdd') throw new Error('Invalid fillRule');
  return {isParametric:false,type:'path',contours,fillRule};
}
export function pathBBox(path){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const c of path.contours){
    for(const a of c.anchors){
      minX=Math.min(minX,a.position.x); minY=Math.min(minY,a.position.y);
      maxX=Math.max(maxX,a.position.x); maxY=Math.max(maxY,a.position.y);
      const pIn={x:a.position.x+a.handleIn.x, y:a.position.y+a.handleIn.y};
      const pOut={x:a.position.x+a.handleOut.x, y:a.position.y+a.handleOut.y};
      minX=Math.min(minX,pIn.x,pOut.x); minY=Math.min(minY,pIn.y,pOut.y);
      maxX=Math.max(maxX,pIn.x,pOut.x); maxY=Math.max(maxY,pIn.y,pOut.y);
    }
  }
  return {minX,minY,maxX,maxY};
}
export function pathExactBBox(path){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  let has=false;
  for(const c of path.contours){
    const n=c.anchors.length;
    if(n===0) continue;
    if(n===1){ const p=c.anchors[0].position; minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); has=true; continue; }
    const segCount=c.closed?n:n-1;
    for(let i=0;i<segCount;i++){
      const a0=c.anchors[i], a1=c.anchors[(i+1)%n];
      const p0=a0.position;
      const p1={x:a0.position.x+a0.handleOut.x, y:a0.position.y+a0.handleOut.y};
      const p2={x:a1.position.x+a1.handleIn.x, y:a1.position.y+a1.handleIn.y};
      const p3=a1.position;
      const isLine=Math.hypot(a0.handleOut.x,a0.handleOut.y)<1e-12 && Math.hypot(a1.handleIn.x,a1.handleIn.y)<1e-12;
      if(isLine){
        minX=Math.min(minX,p0.x,p3.x); minY=Math.min(minY,p0.y,p3.y); maxX=Math.max(maxX,p0.x,p3.x); maxY=Math.max(maxY,p0.y,p3.y);
      }else{
        const bb=cubicBezierBBox(p0,p1,p2,p3);
        minX=Math.min(minX,bb.minX); minY=Math.min(minY,bb.minY); maxX=Math.max(maxX,bb.maxX); maxY=Math.max(maxY,bb.maxY);
      }
      has=true;
    }
  }
  if(!has) return null;
  return {minX,minY,maxX,maxY};
}

// Conversion
export function parametricToDerived(geom, seed=0){
  anchorCounter=seed;
  if(geom.type==='rect'){
    const {x,y,width,height,rx,ry}=geom.params;
    if(rx<1e-9&&ry<1e-9){
      const anchors=[createAnchor(vec(x,y)), createAnchor(vec(x+width,y)), createAnchor(vec(x+width,y+height)), createAnchor(vec(x,y+height))];
      return createPath([createContour(anchors,true)], 'nonZero');
    }else{
      const k=0.5522847498;
      const a0=createAnchor(vec(x+rx,y), vec(0,0), vec(0,0), 'corner');
      const a1={id:`anchor_${++anchorCounter}`, position:vec(x+width-rx,y), handleIn:vec(0,0), handleOut:vec(rx*k,0), type:'smooth'};
      const a2={id:`anchor_${++anchorCounter}`, position:vec(x+width,y+ry), handleIn:vec(0,-ry*k), handleOut:vec(0,0), type:'smooth'};
      const a3={id:`anchor_${++anchorCounter}`, position:vec(x+width,y+height-ry), handleIn:vec(0,0), handleOut:vec(0,ry*k), type:'smooth'};
      const a4={id:`anchor_${++anchorCounter}`, position:vec(x+width-rx,y+height), handleIn:vec(rx*k,0), handleOut:vec(0,0), type:'smooth'};
      const a5={id:`anchor_${++anchorCounter}`, position:vec(x+rx,y+height), handleIn:vec(0,0), handleOut:vec(-rx*k,0), type:'smooth'};
      const a6={id:`anchor_${++anchorCounter}`, position:vec(x,y+height-ry), handleIn:vec(0,ry*k), handleOut:vec(0,0), type:'smooth'};
      const a7={id:`anchor_${++anchorCounter}`, position:vec(x,y+ry), handleIn:vec(0,0), handleOut:vec(0,-ry*k), type:'smooth'};
      return createPath([createContour([a0,a1,a2,a3,a4,a5,a6,a7],true)], 'nonZero');
    }
  }
  if(geom.type==='ellipse'){
    const {cx,cy,rx,ry}=geom.params;
    const k=0.5522847498;
    const anchors=[
      {id:`anchor_${++anchorCounter}`, position:vec(cx+rx,cy), handleIn:vec(0,-ry*k), handleOut:vec(0,ry*k), type:'smooth'},
      {id:`anchor_${++anchorCounter}`, position:vec(cx,cy+ry), handleIn:vec(rx*k,0), handleOut:vec(-rx*k,0), type:'smooth'},
      {id:`anchor_${++anchorCounter}`, position:vec(cx-rx,cy), handleIn:vec(0,ry*k), handleOut:vec(0,-ry*k), type:'smooth'},
      {id:`anchor_${++anchorCounter}`, position:vec(cx,cy-ry), handleIn:vec(-rx*k,0), handleOut:vec(rx*k,0), type:'smooth'}
    ];
    return createPath([createContour(anchors,true)], 'nonZero');
  }
  if(geom.type==='polygon'){
    const anchors=geom.params.points.map(p=>createAnchor(p));
    return createPath([createContour(anchors,true)], 'nonZero');
  }
  if(geom.type==='star'){
    const verts=generateStarVertices(geom.params);
    const anchors=verts.map(v=>createAnchor(v));
    return createPath([createContour(anchors,true)], 'nonZero');
  }
  if(geom.type==='line'){
    const a0=createAnchor(geom.params.start);
    const a1=createAnchor(geom.params.end);
    return createPath([createContour([a0,a1],false)], 'nonZero');
  }
  throw new Error('Unsupported');
}

// Flatten
export function flattenPath(path, tolerance=0.5){
  const contours=[];
  const closed=[];
  for(const contour of path.contours){
    const points=[];
    if(contour.anchors.length===0) continue;
    points.push(contour.anchors[0].position);
    const n=contour.anchors.length;
    const segCount=contour.closed?n:n-1;
    for(let i=0;i<segCount;i++){
      const a0=contour.anchors[i], a1=contour.anchors[(i+1)%n];
      const p0=a0.position, p1={x:a0.position.x+a0.handleOut.x,y:a0.position.y+a0.handleOut.y}, p2={x:a1.position.x+a1.handleIn.x,y:a1.position.y+a1.handleIn.y}, p3=a1.position;
      const isLine=Math.hypot(a0.handleOut.x,a0.handleOut.y)<1e-12 && Math.hypot(a1.handleIn.x,a1.handleIn.y)<1e-12;
      if(isLine){ points.push(p3); }
      else {
        // simple subdivision flatten
        const flat=[];
        (function flatten(p0,p1,p2,p3,depth){
          if(depth>12){ flat.push(p3); return; }
          // flatness
          const ux=p3.x-p0.x, uy=p3.y-p0.y;
          const len2=ux*ux+uy*uy;
          let flatEnough=false;
          if(len2<1e-12){ flatEnough=Math.hypot(p1.x-p0.x,p1.y-p0.y)<=tolerance && Math.hypot(p2.x-p0.x,p2.y-p0.y)<=tolerance; }
          else {
            const d1=Math.abs((p1.x-p0.x)*uy - (p1.y-p0.y)*ux)/Math.sqrt(len2);
            const d2=Math.abs((p2.x-p0.x)*uy - (p2.y-p0.y)*ux)/Math.sqrt(len2);
            flatEnough=Math.max(d1,d2)<=tolerance;
          }
          if(flatEnough){ flat.push(p3); }
          else {
            const p01=vec((p0.x+p1.x)/2,(p0.y+p1.y)/2), p12=vec((p1.x+p2.x)/2,(p1.y+p2.y)/2), p23=vec((p2.x+p3.x)/2,(p2.y+p3.y)/2);
            const p012=vec((p01.x+p12.x)/2,(p01.y+p12.y)/2), p123=vec((p12.x+p23.x)/2,(p12.y+p23.y)/2);
            const p0123=vec((p012.x+p123.x)/2,(p012.y+p123.y)/2);
            flatten(p0,p01,p012,p0123,depth+1);
            flatten(p0123,p123,p23,p3,depth+1);
          }
        })(p0,p1,p2,p3,0);
        for(const pt of flat) points.push(pt);
      }
    }
    contours.push(points);
    closed.push(contour.closed);
  }
  return {contours, closed};
}

// Distance
export function distancePointToSegment(point, segA, segB){
  const abx=segB.x-segA.x, aby=segB.y-segA.y;
  const apx=point.x-segA.x, apy=point.y-segA.y;
  const abLen2=abx*abx+aby*aby;
  if(abLen2<1e-12) return {distance:Math.hypot(apx,apy), closest:segA, t:0};
  let t=(apx*abx+apy*aby)/abLen2;
  t=Math.max(0,Math.min(1,t));
  const closest=vec(segA.x+abx*t, segA.y+aby*t);
  return {distance:Math.hypot(point.x-closest.x, point.y-closest.y), closest, t};
}

// Detection
export function detectParametricShape(path){
  if(!path.contours||path.contours.length!==1) return null;
  const c=path.contours[0];
  const anchors=c.anchors;
  if(!c.closed && anchors.length===2){
    const allCorner=anchors.every(a=>Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if(allCorner) return {type:'line', params:{start:anchors[0].position, end:anchors[1].position}};
  }
  if(c.closed && anchors.length===4){
    const allCorner=anchors.every(a=>Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if(allCorner){
      const xs=anchors.map(a=>a.position.x), ys=anchors.map(a=>a.position.y);
      const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
      return {type:'rect', params:{x:minX,y:minY,width:maxX-minX,height:maxY-minY,rx:0,ry:0}};
    }
  }
  if(c.closed && anchors.length>=3){
    const allCorner=anchors.every(a=>Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if(allCorner) return {type:'polygon', params:{points:anchors.map(a=>a.position)}};
  }
  return null;
}

// Transform
export function transformPath(path, matrix){
  const newContours=path.contours.map(c=>{
    const newAnchors=c.anchors.map(a=>{
      const newPos=Mat.transformPoint(matrix,a.position);
      const newIn=Mat.transformVector(matrix,a.handleIn);
      const newOut=Mat.transformVector(matrix,a.handleOut);
      return {...a, position:newPos, handleIn:newIn, handleOut:newOut};
    });
    const det=matrix.a*matrix.d - matrix.b*matrix.c;
    let orient=c.orientation;
    if(det<0 && orient!=='unknown') orient=orient==='cw'?'ccw':'cw';
    return {...c, anchors:newAnchors, orientation:orient};
  });
  return {...path, contours:newContours};
}
