
import { SemanticData } from './types.js';
import { validateSemanticData, normalizeTags } from './validation.js';

export function serializeSemanticData(data: SemanticData): string {
  // Deterministic serialization: stable ordering
  const normalized: any = {
    objectId: data.objectId,
    role: data.role,
    tags: normalizeTags(data.tags),
    confidence: data.confidence,
    source: data.source,
    relationships: [...data.relationships].sort((a, b) => {
      const t = a.targetObjectId.localeCompare(b.targetObjectId);
      if (t !== 0) return t;
      return a.type.localeCompare(b.type);
    })
  };
  if (data.updatedAt !== undefined) {
    normalized.updatedAt = data.updatedAt;
  }
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

export function deserializeSemanticData(json: string): SemanticData {
  const parsed = JSON.parse(json);
  const data: SemanticData = {
    objectId: parsed.objectId,
    role: parsed.role,
    tags: parsed.tags ?? [],
    confidence: parsed.confidence ?? 0,
    source: parsed.source ?? 'system',
    relationships: parsed.relationships ?? [],
    updatedAt: parsed.updatedAt
  };
  const validation = validateSemanticData(data);
  if (!validation.valid) {
    throw new Error(`Invalid semantic data: ${validation.errors.map(e => e.message).join(', ')}`);
  }
  return data;
}

export function serializeSemanticStore(store: { getAll: () => SemanticData[] }): string {
  const all = store.getAll().sort((a, b) => a.objectId.localeCompare(b.objectId));
  const serialized = all.map(d => ({
    objectId: d.objectId,
    role: d.role,
    tags: normalizeTags(d.tags),
    confidence: d.confidence,
    source: d.source,
    relationships: [...d.relationships].sort((a, b) => a.targetObjectId.localeCompare(b.targetObjectId))
  }));
  // Deterministic: sorted keys
  return JSON.stringify(serialized);
}

export function deserializeSemanticStore(json: string): SemanticData[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Expected array');
  return parsed.map((item: any) => {
    const data: SemanticData = {
      objectId: item.objectId,
      role: item.role,
      tags: item.tags ?? [],
      confidence: item.confidence ?? 0,
      source: item.source ?? 'system',
      relationships: item.relationships ?? [],
      updatedAt: item.updatedAt
    };
    const validation = validateSemanticData(data);
    if (!validation.valid) throw new Error(`Invalid semantic data in store: ${validation.errors.map(e => e.message).join(', ')}`);
    return data;
  });
}
