
export const DSLErrorCodes = {
  PARSE_ERROR: 'DSL_PARSE_ERROR',
  UNSUPPORTED_VERSION: 'DSL_UNSUPPORTED_VERSION',
  INVALID_OPERATION: 'DSL_INVALID_OPERATION',
  SCHEMA_INVALID: 'DSL_SCHEMA_INVALID',
  SEMANTIC_INVALID: 'DSL_SEMANTIC_INVALID',
  UNKNOWN_REFERENCE: 'DSL_UNKNOWN_REFERENCE',
  DUPLICATE_REFERENCE: 'DSL_DUPLICATE_REFERENCE',
  INVALID_ARGUMENT: 'DSL_INVALID_ARGUMENT',
  COMPILE_FAILED: 'DSL_COMPILE_FAILED',
  EXECUTION_FAILED: 'DSL_EXECUTION_FAILED',
};

function createError(code, message, context, instructionIndex, ref){
  return {code, message, context, instructionIndex, ref};
}

const SUPPORTED_OPS = ['create','update','delete','transform','appearance','group','ungroup','reorder','boolean','align','distribute','text','artboard','propose_constraint','propose_semantic'];
const CREATE_TYPES = ['rect','ellipse','path','pointText','line','polygon','star'];

export function validateSchema(input){
  const errors=[];
  const warnings=[];
  if(typeof input!=='object' || input===null){
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'Root must be object'));
    return {valid:false, errors, warnings};
  }
  const obj=input;
  if(typeof obj.version!=='string'){
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'Missing version string'));
  } else {
    const major=obj.version.split('.')[0];
    if(major!=='1'){
      errors.push(createError(DSLErrorCodes.UNSUPPORTED_VERSION, `Unsupported major version ${obj.version}`, {version: obj.version}));
    }
  }
  if(!Array.isArray(obj.program)){
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'program must be array'));
    return {valid:false, errors, warnings};
  }
  const program=obj.program;
  for(let i=0;i<program.length;i++){
    const instr=program[i];
    if(typeof instr!=='object' || instr===null){
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Instruction ${i} must be object`, {}, i));
      continue;
    }
    // Prototype pollution check: if prototype is not Object.prototype
    if(Object.getPrototypeOf(instr)!==Object.prototype && Object.getPrototypeOf(instr)!==null){
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Prototype pollution detected __proto__`, {}, i));
      continue;
    }
    if(instr.args && typeof instr.args==='object' && Object.getPrototypeOf(instr.args)!==Object.prototype && Object.getPrototypeOf(instr.args)!==null){
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Prototype pollution detected in args __proto__`, {}, i));
      continue;
    }

    if(typeof instr.op!=='string' || !SUPPORTED_OPS.includes(instr.op)){
      errors.push(createError(DSLErrorCodes.INVALID_OPERATION, `Unknown operation ${instr.op}`, {op: instr.op}, i));
      continue;
    }
    const op=instr.op;
    if(instr.id!==undefined && typeof instr.id!=='string') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'id must be string', {id: instr.id}, i));
    if(instr.target!==undefined && typeof instr.target!=='string') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'target must be string', {}, i));
    if(instr.targets!==undefined && !Array.isArray(instr.targets)) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'targets must be array', {}, i));
    if(instr.targets && Array.isArray(instr.targets)){
      for(const t of instr.targets) if(typeof t!=='string') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'target entry must be string', {}, i));
    }
    if(op==='create'){
      if(typeof instr.type!=='string' || !CREATE_TYPES.includes(instr.type)){
        if(!instr.type) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'create requires type', {}, i));
        else if(!CREATE_TYPES.includes(instr.type)) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Invalid create type ${instr.type}`, {type: instr.type}, i));
      }
      if(instr.args!==undefined && typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'args must be object', {}, i));
      if(instr.args){
        const args=instr.args;
        for(const field of ['width','height','rx','ry','x','y','cx','cy']){
          if(args[field]!==undefined && (typeof args[field]!=='number' || !Number.isFinite(args[field]))){
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `${field} must be finite number`, {field, value: args[field]}, i));
          }
        }
      }
    }
    if(op==='update'){
      if(!instr.target && !instr.targets) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'update requires target or targets', {}, i));
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'update requires args object', {}, i));
    }
    if(op==='delete'){
      if(!instr.targets || !Array.isArray(instr.targets) || instr.targets.length===0) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'delete requires non-empty targets', {}, i));
    }
    if(op==='transform'){
      if(!instr.target && !instr.targets) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'transform requires target or targets', {}, i));
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'transform requires args', {}, i));
      else {
        const args=instr.args;
        const allowed=['translate','scale','rotate','matrix'];
        const has=allowed.some(k=> k in args);
        if(!has) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `transform args must contain one of ${allowed.join(', ')}`, {}, i));
        if(args.translate){
          if(typeof args.translate.x!=='number' || typeof args.translate.y!=='number' || !Number.isFinite(args.translate.x) || !Number.isFinite(args.translate.y)){
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'translate must be finite Vec2', {}, i));
          }
        }
        if(args.matrix){
          const m=args.matrix;
          if(typeof m.a!=='number' || typeof m.b!=='number' || typeof m.c!=='number' || typeof m.d!=='number' || typeof m.tx!=='number' || typeof m.ty!=='number'){
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'matrix must be {a,b,c,d,tx,ty} finite', {}, i));
          }
        }
      }
    }
    if(op==='appearance'){
      if(!instr.target) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'appearance requires target', {}, i));
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'appearance requires args', {}, i));
    }
    if(op==='group'){
      if(!instr.targets || !Array.isArray(instr.targets) || instr.targets.length<2) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'group requires targets length >=2', {}, i));
    }
    if(op==='ungroup'){
      if(!instr.target) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'ungroup requires target', {}, i));
    }
    if(op==='reorder'){
      if(!instr.targets || instr.targets.length===0) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'reorder requires targets', {}, i));
      if(!instr.args || typeof instr.args.operation!=='string' || !['front','back','forward','backward'].includes(instr.args.operation)){
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'reorder requires args.operation front|back|forward|backward', {}, i));
      }
    }
    if(op==='boolean'){
      if(!instr.targets || instr.targets.length<2) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'boolean requires targets >=2', {}, i));
      if(!instr.operation || !['union','difference','intersection'].includes(instr.operation)){
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'boolean requires operation union|difference|intersection', {}, i));
      }
      if(instr.args){
        const args=instr.args;
        if(args.fillRule && !['nonZero','evenOdd'].includes(args.fillRule)) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'invalid fillRule', {}, i));
      }
    }
    if(op==='align'){
      if(!instr.targets || instr.targets.length<1) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'align requires targets', {}, i));
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'align requires args', {}, i));
    }
    if(op==='distribute'){
      if(!instr.targets || instr.targets.length<3) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'distribute requires targets >=3', {}, i));
    }
    if(op==='text'){
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'text requires args', {}, i));
      else {
        const args=instr.args;
        if(!args.content || typeof args.content!=='string') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'text requires content string', {}, i));
        if(!args.position || typeof args.position.x!=='number' || typeof args.position.y!=='number' || !Number.isFinite(args.position.x) || !Number.isFinite(args.position.y)){
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'text requires position finite Vec2', {}, i));
        }
      }
      if(instr.type && ['areaText','textOnPath','richText'].includes(instr.type)){
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Unsupported text type ${instr.type}`, {type: instr.type}, i));
      }
    }
    if(op==='artboard'){
      if(!instr.args || typeof instr.args!=='object') errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'artboard requires args', {}, i));
      else {
        const args=instr.args;
        if(typeof args.width!=='number' || typeof args.height!=='number' || !Number.isFinite(args.width) || !Number.isFinite(args.height)){
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'artboard width/height must be finite numbers', {}, i));
        }
      }
    }
    if(op==='propose_constraint'){
      if(!instr.targets || instr.targets.length<1) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'propose_constraint requires targets', {}, i));
    }
    if(op==='propose_semantic'){
      if((!instr.targets || instr.targets.length<1) && !instr.target) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'propose_semantic requires target or targets', {}, i));
    }
    const dangerous=['__proto__','constructor','prototype','eval','Function','exec','import','require','process','fs','child_process'];
    for(const key of dangerous){
      if(Object.prototype.hasOwnProperty.call(instr, key)) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Dangerous field ${key} not allowed`, {field: key}, i));
      if(instr.args && typeof instr.args==='object' && Object.prototype.hasOwnProperty.call(instr.args, key)) errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Dangerous field in args ${key} not allowed`, {field: key}, i));
    }
  }
  const valid=errors.length===0;
  return {valid, errors, warnings, program: obj};
}

export function parseDSL(input){
  const errors=[];
  const warnings=[];
  let obj=input;
  if(typeof input==='string'){
    try {
      obj=JSON.parse(input, (key, value)=> {
        if(key==='__proto__' || key==='constructor' || key==='prototype'){
          throw new Error(`Dangerous key ${key} not allowed`);
        }
        return value;
      });
    } catch(e){ errors.push(createError(DSLErrorCodes.PARSE_ERROR, `Invalid JSON: ${e.message}`, {error: e.message})); return {success:false, errors, warnings}; }
  } else {
    // For object input, check for prototype pollution via JSON stringify check
    try {
      const jsonStr=JSON.stringify(obj);
      if(jsonStr.includes('"__proto__"') || jsonStr.includes('"constructor"')){
        // Allow constructor as value but not as key? For simplicity, check via own property check with getOwnPropertyNames that includes __proto__? We already check hasOwnProperty for own keys, but JSON.parse pollution case is handled above
      }
    } catch{}
  }
  const schemaResult=validateSchema(obj);
  errors.push(...schemaResult.errors);
  warnings.push(...schemaResult.warnings);
  if(!schemaResult.valid) return {success:false, errors, warnings};
  const vectorDSL=schemaResult.program;
  const instructions=vectorDSL.program.map((instr, idx)=> ({
    op: instr.op,
    ref: instr.id,
    target: instr.target,
    targets: instr.targets,
    type: instr.type,
    operation: instr.operation,
    args: instr.args || {},
    sourceIndex: idx
  }));
  const program={version: vectorDSL.version, instructions};
  return {success:true, program, errors, warnings};
}

export function analyzeReferences(program){
  if(!program || !program.instructions) return {analysis:{defined:new Set(), used:new Set(), duplicateDefinitions:[], unknownReferences:[], forwardReferences:[], unusedReferences:[]}, errors:[], warnings:[]};
  const errors=[];
  const warnings=[];
  const defined=new Map();
  const duplicateDefinitions=[];
  const used=[];
  for(let i=0;i<program.instructions.length;i++){
    const instr=program.instructions[i];
    if(instr.ref){
      if(defined.has(instr.ref)){
        duplicateDefinitions.push(instr.ref);
        errors.push(createError(DSLErrorCodes.DUPLICATE_REFERENCE, `Duplicate reference ${instr.ref}`, {ref: instr.ref}, i, instr.ref));
      } else defined.set(instr.ref, i);
    }
    if(instr.target) used.push({ref: instr.target, index: i});
    if(instr.targets) for(const t of instr.targets) used.push({ref: t, index: i});
  }
  const unknownReferences=[];
  const forwardReferences=[];
  for(const u of used){
    if(!defined.has(u.ref)){
      unknownReferences.push({ref: u.ref, instructionIndex: u.index});
      errors.push(createError(DSLErrorCodes.UNKNOWN_REFERENCE, `Unknown reference ${u.ref}`, {ref: u.ref}, u.index, u.ref));
    } else {
      const definedAt=defined.get(u.ref);
      if(definedAt>u.index){
        forwardReferences.push({ref: u.ref, usedAt: u.index, definedAt});
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `Forward reference ${u.ref} used at ${u.index} but defined at ${definedAt}`, {ref: u.ref, usedAt: u.index, definedAt}, u.index, u.ref));
      }
    }
  }
  const definedSet=new Set(defined.keys());
  const usedSet=new Set(used.map(u=> u.ref));
  const unusedReferences=[];
  for(const d of definedSet){
    if(!usedSet.has(d)){
      unusedReferences.push(d);
      warnings.push(createError('DSL_UNUSED_REFERENCE', `Unused reference ${d}`, {ref: d}));
    }
  }
  const analysis={defined: definedSet, used: usedSet, duplicateDefinitions, unknownReferences, forwardReferences, unusedReferences};
  return {analysis, errors, warnings};
}

export function validateSemantics(program){
  const errors=[];
  const warnings=[];
  const refResult=analyzeReferences(program);
  errors.push(...refResult.errors);
  warnings.push(...refResult.warnings);
  for(let i=0;i<program.instructions.length;i++){
    const instr=program.instructions[i];
    if(instr.op==='group' && (!instr.targets || instr.targets.length<2)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'group requires at least 2 targets', {}, i));
    if(instr.op==='ungroup' && !instr.target) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'ungroup requires target', {}, i));
    if(instr.op==='boolean' && (!instr.targets || instr.targets.length<2)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'boolean requires at least 2 targets', {}, i));
    if(instr.op==='align' && (!instr.targets || instr.targets.length<1)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'align requires at least 1 target', {}, i));
    if(instr.op==='distribute' && (!instr.targets || instr.targets.length<3)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'distribute requires at least 3 targets', {}, i));
    if(instr.op==='transform'){
      const args=instr.args;
      if(args && args.matrix){
        const m=args.matrix;
        const det=m.a*m.d - m.b*m.c;
        if(Math.abs(det)<1e-12) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'Transform matrix is singular', {matrix: m}, i));
      }
      if(args && args.scale){
        const scale=typeof args.scale==='number' ? {x: args.scale, y: args.scale} : args.scale;
        if(scale.x===0 || scale.y===0) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'Scale cannot be zero', {}, i));
      }
    }
    if(instr.op==='appearance'){
      const args=instr.args;
      if(args.opacity!==undefined && (typeof args.opacity!=='number' || args.opacity<0 || args.opacity>1)){
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'opacity must be 0..1', {}, i));
      }
    }
    if(instr.op==='artboard'){
      const args=instr.args;
      if(args.width<=0 || args.height<=0) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'artboard width/height must be positive', {}, i));
    }
    if(instr.op==='update'){
      const args=instr.args;
      if(args.width!==undefined && (typeof args.width!=='number' || args.width<=0)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'width must be positive', {}, i));
      if(args.height!==undefined && (typeof args.height!=='number' || args.height<=0)) errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, 'height must be positive', {}, i));
    }
  }
  return {valid: errors.length===0, errors, warnings};
}

export function validateDSL(program){
  return validateSemantics(program);
}

export function lintDSL(program){
  const refAnalysis=analyzeReferences(program);
  const semantic=validateSemantics(program);
  const allErrors=[...semantic.errors];
  const allWarnings=[...semantic.warnings, ...refAnalysis.warnings];
  const seen=new Set();
  const deduped=allWarnings.filter(w=> {
    const key=`${w.code}:${w.instructionIndex}:${w.message}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {valid: allErrors.length===0, errors: allErrors, warnings: deduped};
}

function parseColor(color){
  if(typeof color==='string'){
    if(color.startsWith('#')){
      const hex=color.slice(1);
      if(hex.length===6){
        const r=parseInt(hex.slice(0,2),16);
        const g=parseInt(hex.slice(2,4),16);
        const b=parseInt(hex.slice(4,6),16);
        return {r,g,b,a:1};
      }
      if(hex.length===3){
        const r=parseInt(hex[0]+hex[0],16);
        const g=parseInt(hex[1]+hex[1],16);
        const b=parseInt(hex[2]+hex[2],16);
        return {r,g,b,a:1};
      }
    }
    return {r:0,g:0,b:0,a:1, original: color};
  }
  if(typeof color==='object' && color!==null) return color;
  return {r:0,g:0,b:0,a:1};
}

export function mapToToolIR(node){
  const sourceIndex=node.sourceIndex;
  const sourceRef=node.ref;
  switch(node.op){
    case 'create': {
      const type=node.type;
      const args=node.args;
      let toolId;
      let input;
      if(type==='rect'){
        toolId='T01';
        input={x: args.x??0, y: args.y??0, width: args.width, height: args.height, rx: args.rx??0, ry: args.ry??0, fill: args.fill ? {kind:'solid', color: parseColor(args.fill)} : undefined};
      } else if(type==='ellipse'){
        toolId='T02';
        input={cx: args.cx??args.x??0, cy: args.cy??args.y??0, rx: args.rx?? (args.width!==undefined? args.width/2 : 50), ry: args.ry?? (args.height!==undefined? args.height/2 : 50)};
        if(args.width!==undefined && args.rx===undefined) input.rx=args.width/2;
        if(args.height!==undefined && args.ry===undefined) input.ry=args.height/2;
      } else if(type==='path' || type==='line' || type==='polygon' || type==='star'){
        toolId='T03';
        input={contours: args.contours||[], fillRule: args.fillRule??'nonZero', primitiveType: type, primitiveArgs: args};
      } else if(type==='pointText'){
        toolId='T15';
        input={content: args.content, position: args.position, style: args.style};
      } else {
        return {error: createError(DSLErrorCodes.COMPILE_FAILED, `Unsupported create type ${type}`, {type}, sourceIndex, sourceRef)};
      }
      return {ir:{toolId, input, sourceInstructionIndex: sourceIndex, sourceRef, category:'mutation'}};
    }
    case 'text': {
      const args=node.args;
      return {ir:{toolId:'T15', input:{content: args.content, position: args.position, style: args.style}, sourceInstructionIndex: sourceIndex, sourceRef, category:'mutation'}};
    }
    case 'update': {
      const args=node.args;
      if(args.fill!==undefined || args.opacity!==undefined || args.stroke!==undefined){
        return {ir:{toolId:'T07', input:{objectIds:[], fill: args.fill? {kind:'solid', color: parseColor(args.fill)}:undefined, opacity: args.opacity}, sourceInstructionIndex: sourceIndex, sourceRef: node.target, targets: node.target? [node.target] : node.targets, category:'mutation'}};
      }
      return {ir:{toolId:'T05', input:{objectIds:[], delta:{x:0,y:0}, updateArgs: args}, sourceInstructionIndex: sourceIndex, sourceRef: node.target, targets: node.target? [node.target] : node.targets, category:'mutation'}};
    }
    case 'delete': {
      return {ir:{toolId:'T04', input:{objectIds:[]}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'mutation'}};
    }
    case 'transform': {
      const args=node.args;
      let transform;
      if(args.matrix) transform=args.matrix;
      else if(args.translate) transform={a:1,b:0,c:0,d:1,tx:args.translate.x, ty:args.translate.y};
      else if(args.scale){
        const sx=typeof args.scale==='number'? args.scale : args.scale.x;
        const sy=typeof args.scale==='number'? args.scale : (args.scale.y??args.scale.x);
        transform={a:sx,b:0,c:0,d:sy,tx:0,ty:0};
        if(args.translate){ transform.tx=args.translate.x; transform.ty=args.translate.y; }
      } else if(args.rotate!==undefined){
        const rad=(args.rotate*Math.PI)/180;
        const c=Math.cos(rad), s=Math.sin(rad);
        transform={a:c,b:s,c:-s,d:c,tx:0,ty:0};
      } else return {error: createError(DSLErrorCodes.COMPILE_FAILED, 'Invalid transform args', {args}, sourceIndex)};
      if(transform.a===1 && transform.b===0 && transform.c===0 && transform.d===1){
        return {ir:{toolId:'T05', input:{objectIds:[], delta:{x:transform.tx, y:transform.ty}}, sourceInstructionIndex: sourceIndex, targets: node.target? [node.target] : node.targets, category:'mutation'}};
      }
      return {ir:{toolId:'T06', input:{objectIds:[], transform}, sourceInstructionIndex: sourceIndex, targets: node.target? [node.target] : node.targets, category:'mutation'}};
    }
    case 'appearance': {
      const args=node.args;
      return {ir:{toolId:'T07', input:{objectIds:[], fill: args.fill? {kind:'solid', color: parseColor(args.fill)}:undefined, opacity: args.opacity}, sourceInstructionIndex: sourceIndex, targets: node.target? [node.target] : node.targets, category:'mutation'}};
    }
    case 'group': {
      return {ir:{toolId:'T10', input:{objectIds:[]}, sourceInstructionIndex: sourceIndex, sourceRef, targets: node.targets, category:'mutation'}};
    }
    case 'ungroup': {
      return {ir:{toolId:'T11', input:{objectIds:[]}, sourceInstructionIndex: sourceIndex, targets: node.target? [node.target] : [], category:'mutation'}};
    }
    case 'reorder': {
      const args=node.args;
      return {ir:{toolId:'T12', input:{objectIds:[], operation: args.operation}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'mutation'}};
    }
    case 'boolean': {
      const args=node.args;
      return {ir:{toolId:'T13', input:{objectIds:[], operation: node.operation, fillRule: args.fillRule??'nonZero', tolerance: args.tolerance??0.5, keepOriginals: args.keepOriginals??false}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'mutation'}};
    }
    case 'align': {
      const args=node.args;
      return {ir:{toolId:'T08', input:{objectIds:[], axis: args.axis??'horizontal', mode: args.mode??'center'}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'mutation'}};
    }
    case 'distribute': {
      const args=node.args;
      return {ir:{toolId:'T09', input:{objectIds:[], axis: args.axis??'horizontal', mode: args.mode??'gaps'}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'mutation'}};
    }
    case 'artboard': {
      return {ir:{toolId:'ARTBOARD', input: node.args, sourceInstructionIndex: sourceIndex, category:'mutation'}};
    }
    case 'propose_constraint': {
      return {ir:{toolId:'T19', input:{objectIds:[]}, sourceInstructionIndex: sourceIndex, targets: node.targets, category:'proposal'}};
    }
    case 'propose_semantic': {
      return {ir:{toolId:'T20', input:{objectIds:[]}, sourceInstructionIndex: sourceIndex, targets: node.target? [node.target] : node.targets, category:'proposal'}};
    }
    default:
      return {error: createError(DSLErrorCodes.COMPILE_FAILED, `Cannot map op ${node.op}`, {op: node.op}, sourceIndex)};
  }
}

export function compileToIR(program){
  const errors=[];
  const warnings=[];
  const ir=[];
  for(const node of program.instructions){
    const result=mapToToolIR(node);
    if(result.error) errors.push(result.error);
    else if(result.ir) ir.push(result.ir);
  }
  const success=errors.length===0;
  return {success, ir: success? ir : undefined, program, errors, warnings};
}

export function compileDSL(program){
  const validation=validateDSL(program);
  if(!validation.valid) return {success:false, errors: validation.errors, warnings: validation.warnings};
  const irResult=compileToIR(program);
  if(!irResult.success) return {success:false, errors: [...validation.errors, ...irResult.errors], warnings: [...validation.warnings, ...irResult.warnings]};
  return {success:true, ir: irResult.ir, program, errors: validation.errors, warnings: [...validation.warnings, ...irResult.warnings]};
}

export function serializeDSL(program){
  const vectorDSL={
    version: program.version,
    program: program.instructions.map(node=>{
      const obj={op: node.op};
      if(node.ref) obj.id=node.ref;
      if(node.target) obj.target=node.target;
      if(node.targets) obj.targets=[...node.targets].sort();
      if(node.type) obj.type=node.type;
      if(node.operation) obj.operation=node.operation;
      if(node.args && Object.keys(node.args).length>0){
        const sorted={};
        Object.keys(node.args).sort().forEach(k=> sorted[k]=node.args[k]);
        obj.args=sorted;
      }
      return obj;
    })
  };
  return JSON.stringify(vectorDSL, null, 2);
}

export function deserializeDSL(input){
  return JSON.parse(input);
}

export class DSLReferenceEnvironment {
  constructor(){ this.map=new Map(); }
  define(ref, objectId){ this.map.set(ref, objectId); }
  resolve(ref){ const v=this.map.get(ref); return v===null? undefined : v; }
  has(ref){ return this.map.has(ref) && this.map.get(ref)!==null; }
  hasDefined(ref){ return this.map.has(ref); }
  getDefined(){ return this.map; }
}

export class DSLExecutor {
  validate(program){ return validateDSL(program); }
  compile(program){ return compileDSL(program); }
  async execute(ir, context){
    const errors=[];
    const warnings=[];
    const outputs=[];
    const env=new DSLReferenceEnvironment();
    const createdObjectIds=[];
    for(let i=0;i<ir.length;i++){
      const toolIR=ir[i];
      let resolvedInput={...toolIR.input};
      if(toolIR.targets && toolIR.targets.length>0){
        const resolvedObjectIds=[];
        for(const ref of toolIR.targets){
          const actual=env.resolve(ref);
          if(!actual){
            errors.push(createError(DSLErrorCodes.UNKNOWN_REFERENCE, `Unknown reference ${ref} at IR ${i}`, {ref, irIndex: i}, toolIR.sourceInstructionIndex, ref));
            return {success:false, outputs, errors, warnings, ir};
          }
          resolvedObjectIds.push(actual);
        }
        resolvedInput.objectIds=resolvedObjectIds;
        resolvedInput.objectId=resolvedObjectIds[0];
      }
      if(toolIR.toolId==='ARTBOARD'){
        outputs.push({toolId:'ARTBOARD', input: resolvedInput, success:true});
        continue;
      }
      try {
        const result=context.toolRegistry.execute(toolIR.toolId, resolvedInput, context.documentContext);
        if(!result.success){
          errors.push(createError(DSLErrorCodes.EXECUTION_FAILED, `Tool ${toolIR.toolId} failed: ${result.errors?.[0]?.message||'unknown'}`, {toolId: toolIR.toolId, errors: result.errors, irIndex: i}, toolIR.sourceInstructionIndex));
          for(const oid of createdObjectIds){
            try { context.toolRegistry.execute('T04', {objectIds:[oid]}, context.documentContext); } catch {}
          }
          return {success:false, outputs, errors, warnings, ir};
        }
        outputs.push(result);
        if(result.output && result.output.objectId && toolIR.sourceRef){
          env.define(toolIR.sourceRef, result.output.objectId);
          createdObjectIds.push(result.output.objectId);
        }
        if(result.output && result.output.groupNodeId && toolIR.sourceRef){
          env.define(toolIR.sourceRef, result.output.groupNodeId);
        }
        if(result.output && result.output.resultObjectId){
          const newId=result.output.resultObjectId;
          if(toolIR.sourceRef) env.define(toolIR.sourceRef, newId);
          createdObjectIds.push(newId);
        }
      } catch(e){
        errors.push(createError(DSLErrorCodes.EXECUTION_FAILED, `Exception executing tool ${toolIR.toolId}: ${e.message}`, {toolId: toolIR.toolId, error: e.message, irIndex: i}, toolIR.sourceInstructionIndex));
        for(const oid of createdObjectIds){
          try { context.toolRegistry.execute('T04', {objectIds:[oid]}, context.documentContext); } catch {}
        }
        return {success:false, outputs, errors, warnings, ir};
      }
    }
    return {success:true, outputs, errors, warnings, ir, env};
  }
  async executeProgram(program, context){
    const compileResult=compileDSL(program);
    if(!compileResult.success) return {success:false, outputs:[], errors: compileResult.errors, warnings: compileResult.warnings};
    return this.execute(compileResult.ir, context);
  }
}

export const TOOL_MAPPING={
  'create:rect':'T01',
  'create:ellipse':'T02',
  'create:path':'T03',
  'create:line':'T03',
  'create:polygon':'T03',
  'create:star':'T03',
  'create:pointText':'T15',
  'text':'T15',
  'delete':'T04',
  'transform:translate':'T05',
  'transform:matrix':'T06',
  'appearance':'T07',
  'align':'T08',
  'distribute':'T09',
  'group':'T10',
  'ungroup':'T11',
  'reorder':'T12',
  'boolean':'T13',
  'propose_constraint':'T19',
  'propose_semantic':'T20'
};
