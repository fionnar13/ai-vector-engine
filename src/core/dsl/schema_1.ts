
import { DSLOp, DSLInstruction, VectorDSL, DSLError } from './types.js';
import { DSLErrorCodes, createError } from './errors.js';

const SUPPORTED_OPS: DSLOp[] = [
  'create', 'update', 'delete', 'transform', 'appearance',
  'group', 'ungroup', 'reorder', 'boolean', 'align', 'distribute',
  'text', 'artboard', 'propose_constraint', 'propose_semantic'
];

const CREATE_TYPES = ['rect', 'ellipse', 'path', 'pointText', 'line', 'polygon', 'star'];

export function validateSchema(input: unknown): { valid: boolean; errors: DSLError[]; warnings: DSLError[]; program?: VectorDSL } {
  const errors: DSLError[] = [];
  const warnings: DSLError[] = [];

  if (typeof input !== 'object' || input === null) {
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'Root must be object'));
    return { valid: false, errors, warnings };
  }

  const obj = input as any;

  if (typeof obj.version !== 'string') {
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'Missing version string'));
  } else {
    // Versioning: support 1.0, 1.x
    const version = obj.version as string;
    const major = version.split('.')[0];
    if (major !== '1') {
      errors.push(createError(DSLErrorCodes.UNSUPPORTED_VERSION, `Unsupported major version ${version}`, { version }));
    }
  }

  if (!Array.isArray(obj.program)) {
    errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, 'program must be array'));
    return { valid: false, errors, warnings };
  }

  const program = obj.program as any[];

  for (let i = 0; i < program.length; i++) {
    const instr = program[i];
    if (typeof instr !== 'object' || instr === null) {
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Instruction ${i} must be object`, {}, i));
      continue;
    }

    if (typeof instr.op !== 'string' || !SUPPORTED_OPS.includes(instr.op as DSLOp)) {
      errors.push(createError(DSLErrorCodes.INVALID_OPERATION, `Unknown operation ${instr.op}`, { op: instr.op }, i));
      continue;
    }

    const op = instr.op as DSLOp;

    // id validation if present
    if (instr.id !== undefined && typeof instr.id !== 'string') {
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `id must be string`, { id: instr.id }, i));
    }
    if (instr.target !== undefined && typeof instr.target !== 'string') {
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `target must be string`, { target: instr.target }, i));
    }
    if (instr.targets !== undefined && !Array.isArray(instr.targets)) {
      errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `targets must be array`, { targets: instr.targets }, i));
    }
    if (instr.targets && Array.isArray(instr.targets)) {
      for (const t of instr.targets) {
        if (typeof t !== 'string') {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `target entry must be string`, { target: t }, i));
        }
      }
    }

    // Operation specific schema checks
    if (op === 'create') {
      if (typeof instr.type !== 'string' || !CREATE_TYPES.includes(instr.type)) {
        // Allow text types also handled via text op, but create should have type
        if (!instr.type) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `create requires type`, {}, i));
        } else if (!CREATE_TYPES.includes(instr.type)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Invalid create type ${instr.type}`, { type: instr.type }, i));
        }
      }
      if (instr.args !== undefined && typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `args must be object`, {}, i));
      }
      // Validate numeric fields if present
      if (instr.args) {
        const args = instr.args as any;
        for (const field of ['width', 'height', 'rx', 'ry', 'x', 'y', 'cx', 'cy']) {
          if (args[field] !== undefined && (typeof args[field] !== 'number' || !Number.isFinite(args[field]))) {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `${field} must be finite number`, { field, value: args[field] }, i));
          }
        }
      }
    }

    if (op === 'update') {
      if (!instr.target && !instr.targets) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `update requires target or targets`, {}, i));
      }
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `update requires args object`, {}, i));
      } else {
        // Whitelist mutable fields
        const allowed = ['width', 'height', 'rx', 'ry', 'x', 'y', 'cx', 'cy', 'content', 'position', 'style', 'fill', 'stroke', 'opacity'];
        for (const key of Object.keys(instr.args as any)) {
          if (!allowed.includes(key)) {
            warnings.push(createError(DSLErrorCodes.INVALID_ARGUMENT, `Unknown update field ${key} may be ignored`, { field: key }, i));
          }
        }
      }
    }

    if (op === 'delete') {
      if (!instr.targets || !Array.isArray(instr.targets) || instr.targets.length === 0) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `delete requires non-empty targets`, {}, i));
      }
    }

    if (op === 'transform') {
      if (!instr.target && !instr.targets) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `transform requires target or targets`, {}, i));
      }
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `transform requires args`, {}, i));
      } else {
        const args = instr.args as any;
        const allowedTransforms = ['translate', 'scale', 'rotate', 'matrix'];
        const hasTransform = allowedTransforms.some(k => k in args);
        if (!hasTransform) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `transform args must contain one of ${allowedTransforms.join(', ')}`, {}, i));
        }
        if (args.translate) {
          if (typeof args.translate.x !== 'number' || typeof args.translate.y !== 'number' || !Number.isFinite(args.translate.x) || !Number.isFinite(args.translate.y)) {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `translate must be finite Vec2`, {}, i));
          }
        }
        if (args.scale) {
          if ((typeof args.scale.x !== 'number' && typeof args.scale !== 'number') || (args.scale.y !== undefined && typeof args.scale.y !== 'number')) {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `scale must be number or Vec2`, {}, i));
          }
        }
        if (args.rotate !== undefined && (typeof args.rotate !== 'number' || !Number.isFinite(args.rotate))) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `rotate must be finite number`, {}, i));
        }
        if (args.matrix) {
          const m = args.matrix;
          if (typeof m.a !== 'number' || typeof m.b !== 'number' || typeof m.c !== 'number' || typeof m.d !== 'number' || typeof m.tx !== 'number' || typeof m.ty !== 'number') {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `matrix must be {a,b,c,d,tx,ty} finite`, {}, i));
          } else {
            for (const k of ['a', 'b', 'c', 'd', 'tx', 'ty']) {
              if (!Number.isFinite(m[k])) {
                errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `matrix.${k} must be finite`, {}, i));
              }
            }
          }
        }
      }
    }

    if (op === 'appearance') {
      if (!instr.target) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `appearance requires target`, {}, i));
      }
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `appearance requires args`, {}, i));
      }
    }

    if (op === 'group') {
      if (!instr.targets || !Array.isArray(instr.targets) || instr.targets.length < 2) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `group requires targets length >=2`, {}, i));
      }
    }

    if (op === 'ungroup') {
      if (!instr.target) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `ungroup requires target`, {}, i));
      }
    }

    if (op === 'reorder') {
      if (!instr.targets || instr.targets.length === 0) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `reorder requires targets`, {}, i));
      }
      if (!instr.args || typeof (instr.args as any).operation !== 'string' || !['front', 'back', 'forward', 'backward'].includes((instr.args as any).operation)) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `reorder requires args.operation front|back|forward|backward`, {}, i));
      }
    }

    if (op === 'boolean') {
      if (!instr.targets || instr.targets.length < 2) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `boolean requires targets >=2`, {}, i));
      }
      if (!instr.operation || !['union', 'difference', 'intersection'].includes(instr.operation as any)) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `boolean requires operation union|difference|intersection`, {}, i));
      }
      if (instr.args) {
        const args = instr.args as any;
        if (args.fillRule && !['nonZero', 'evenOdd'].includes(args.fillRule)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `invalid fillRule`, { fillRule: args.fillRule }, i));
        }
        if (args.tolerance !== undefined && (typeof args.tolerance !== 'number' || !Number.isFinite(args.tolerance))) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `tolerance must be finite number`, {}, i));
        }
      }
    }

    if (op === 'align') {
      if (!instr.targets || instr.targets.length < 1) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `align requires targets`, {}, i));
      }
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `align requires args`, {}, i));
      } else {
        const args = instr.args as any;
        if (args.axis && !['horizontal', 'vertical', 'both'].includes(args.axis)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `invalid align axis`, { axis: args.axis }, i));
        }
        if (args.mode && !['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(args.mode)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `invalid align mode`, { mode: args.mode }, i));
        }
      }
    }

    if (op === 'distribute') {
      if (!instr.targets || instr.targets.length < 3) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `distribute requires targets >=3`, {}, i));
      }
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `distribute requires args`, {}, i));
      } else {
        const args = instr.args as any;
        if (args.axis && !['horizontal', 'vertical'].includes(args.axis)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `invalid distribute axis`, {}, i));
        }
        if (args.mode && !['centers', 'gaps'].includes(args.mode)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `invalid distribute mode`, {}, i));
        }
      }
    }

    if (op === 'text') {
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `text requires args`, {}, i));
      } else {
        const args = instr.args as any;
        if (!args.content || typeof args.content !== 'string') {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `text requires content string`, {}, i));
        }
        if (!args.position || typeof args.position.x !== 'number' || typeof args.position.y !== 'number' || !Number.isFinite(args.position.x) || !Number.isFinite(args.position.y)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `text requires position finite Vec2`, {}, i));
        }
        if (!args.style || typeof args.style !== 'object') {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `text requires style`, {}, i));
        } else {
          const style = args.style;
          if (!style.fontFamily || typeof style.fontFamily !== 'string') {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `style.fontFamily required string`, {}, i));
          }
          if (style.fontSize !== undefined && (typeof style.fontSize !== 'number' || !Number.isFinite(style.fontSize))) {
            errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `style.fontSize must be finite`, {}, i));
          }
        }
      }
      // Reject areaText etc
      if (instr.type && ['areaText', 'textOnPath', 'richText'].includes(instr.type as any)) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Unsupported text type ${instr.type} - only pointText allowed`, { type: instr.type }, i));
      }
    }

    if (op === 'artboard') {
      if (!instr.args || typeof instr.args !== 'object') {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `artboard requires args`, {}, i));
      } else {
        const args = instr.args as any;
        if (typeof args.width !== 'number' || typeof args.height !== 'number' || !Number.isFinite(args.width) || !Number.isFinite(args.height)) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `artboard width/height must be finite numbers`, {}, i));
        }
      }
    }

    if (op === 'propose_constraint') {
      if (!instr.targets || instr.targets.length < 1) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `propose_constraint requires targets`, {}, i));
      }
    }

    if (op === 'propose_semantic') {
      if (!instr.targets || instr.targets.length < 1) {
        if (!instr.target) {
          errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `propose_semantic requires target or targets`, {}, i));
        }
      }
    }

    // Security: reject fields that attempt to inject executable code
    const dangerousKeys = ['__proto__', 'constructor', 'prototype', 'eval', 'Function', 'exec', 'import', 'require', 'process', 'fs', 'child_process'];
    for (const key of dangerousKeys) {
      if (Object.prototype.hasOwnProperty.call(instr, key)) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Dangerous field ${key} not allowed`, { field: key }, i));
      }
      if (instr.args && typeof instr.args === 'object' && Object.prototype.hasOwnProperty.call(instr.args as any, key)) {
        errors.push(createError(DSLErrorCodes.SCHEMA_INVALID, `Dangerous field in args ${key} not allowed`, { field: key }, i));
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, program: obj as VectorDSL };
}
