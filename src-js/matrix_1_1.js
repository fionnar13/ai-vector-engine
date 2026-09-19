
import { vec2 } from './vec2.js';
export function identity(){ return {a:1,b:0,c:0,d:1,tx:0,ty:0}; }
export function translation(tx,ty){ return {a:1,b:0,c:0,d:1,tx,ty}; }
export function scale(sx,sy=sx){ return {a:sx,b:0,c:0,d:sy,tx:0,ty:0}; }
export function rotationDegrees(deg){
  const rad=deg*Math.PI/180;
  const cos=Math.cos(rad), sin=Math.sin(rad);
  return {a:cos,b:sin,c:-sin,d:cos,tx:0,ty:0};
}
export function multiply(m1,m2){
  return {
    a: m1.a*m2.a + m1.c*m2.b,
    b: m1.b*m2.a + m1.d*m2.b,
    c: m1.a*m2.c + m1.c*m2.d,
    d: m1.b*m2.c + m1.d*m2.d,
    tx: m1.a*m2.tx + m1.c*m2.ty + m1.tx,
    ty: m1.b*m2.tx + m1.d*m2.ty + m1.ty
  };
}
export function transformPoint(m,p){ return vec2(m.a*p.x + m.c*p.y + m.tx, m.b*p.x + m.d*p.y + m.ty); }
export function determinant(m){ return m.a*m.d - m.b*m.c; }
export function isInvertible(m){ return Math.abs(determinant(m))>1e-9; }
export function inverse(m){
  const det=determinant(m);
  if(Math.abs(det)<1e-9) throw new Error('TRANSFORM_SINGULAR');
  const invDet=1/det;
  const a=m.d*invDet, b=-m.b*invDet, c=-m.c*invDet, d=m.a*invDet;
  const tx=-(a*m.tx + c*m.ty), ty=-(b*m.tx + d*m.ty);
  return {a,b,c,d,tx,ty};
}
export function aroundPivot(m,pivot){
  const t1=translation(-pivot.x,-pivot.y), t2=translation(pivot.x,pivot.y);
  return multiply(multiply(t2,m),t1);
}
export function equals(m1,m2,tol=1e-9){
  return Math.abs(m1.a-m2.a)<=tol && Math.abs(m1.b-m2.b)<=tol && Math.abs(m1.c-m2.c)<=tol && Math.abs(m1.d-m2.d)<=tol && Math.abs(m1.tx-m2.tx)<=tol && Math.abs(m1.ty-m2.ty)<=tol;
}

export function transformVector(m,v){
  return {x: m.a*v.x + m.c*v.y, y: m.b*v.x + m.d*v.y};
}
