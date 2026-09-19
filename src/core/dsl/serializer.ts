
import { VectorDSL, DSLProgram } from './types.js';

export function serializeDSL(program: DSLProgram): string {
  // Deterministic serialization: sort keys, stable ordering
  const vectorDSL: VectorDSL = {
    version: program.version,
    program: program.instructions.map(node => {
      const obj: any = {
        op: node.op
      };
      if (node.ref) obj.id = node.ref;
      if (node.target) obj.target = node.target;
      if (node.targets) obj.targets = [...node.targets].sort();
      if (node.type) obj.type = node.type;
      if (node.operation) obj.operation = node.operation;
      if (node.args && Object.keys(node.args).length > 0) {
        // Sort args keys for determinism
        const sortedArgs: any = {};
        const keys = Object.keys(node.args).sort();
        for (const k of keys) {
          sortedArgs[k] = (node.args as any)[k];
        }
        obj.args = sortedArgs;
      }
      return obj;
    })
  };

  return JSON.stringify(vectorDSL, null, 2);
}

export function deserializeDSL(input: string): VectorDSL {
  return JSON.parse(input) as VectorDSL;
}

export function serializeToCanonicalJSON(input: unknown): string {
  // Deterministic JSON serialization with sorted keys
  return JSON.stringify(input, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: any = {};
      Object.keys(value).sort().forEach(k => {
        sorted[k] = value[k];
      });
      return sorted;
    }
    return value;
  }, 2);
}
