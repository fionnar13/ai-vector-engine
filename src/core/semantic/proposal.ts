
import { SemanticProposal, SemanticData, SemanticRole } from './types.js';
import { ObjectID } from '../ids/index.js';
import { normalizeTags } from './validation.js';

export function proposalToSemanticData(proposal: SemanticProposal, source: SemanticData['source'] = 'heuristic'): SemanticData {
  return {
    objectId: proposal.objectId,
    role: proposal.proposedRole,
    tags: normalizeTags(proposal.proposedTags),
    confidence: proposal.confidence,
    source,
    relationships: [...proposal.proposedRelationships].sort((a, b) => {
      const t = a.targetObjectId.localeCompare(b.targetObjectId);
      if (t !== 0) return t;
      return a.type.localeCompare(b.type);
    }),
    updatedAt: Date.now()
  };
}

export function mergeSemanticData(existing: SemanticData, incoming: Partial<SemanticData>, mode: 'replace' | 'merge' = 'replace'): SemanticData {
  if (mode === 'replace') {
    return {
      objectId: existing.objectId,
      role: incoming.role ?? existing.role,
      tags: incoming.tags ? normalizeTags(incoming.tags) : existing.tags,
      confidence: incoming.confidence ?? existing.confidence,
      source: incoming.source ?? existing.source,
      relationships: incoming.relationships ? [...incoming.relationships].sort((a, b) => a.targetObjectId.localeCompare(b.targetObjectId)) : existing.relationships,
      updatedAt: Date.now()
    };
  } else {
    // merge: tags union, relationships union
    const mergedTags = normalizeTags([...existing.tags, ...(incoming.tags ?? [])]);
    const mergedRels = [...existing.relationships];
    if (incoming.relationships) {
      for (const rel of incoming.relationships) {
        if (!mergedRels.some(r => r.targetObjectId === rel.targetObjectId && r.type === rel.type)) {
          mergedRels.push(rel);
        }
      }
    }
    mergedRels.sort((a, b) => {
      const t = a.targetObjectId.localeCompare(b.targetObjectId);
      if (t !== 0) return t;
      return a.type.localeCompare(b.type);
    });
    return {
      objectId: existing.objectId,
      role: incoming.role ?? existing.role,
      tags: mergedTags,
      confidence: incoming.confidence ?? existing.confidence,
      source: incoming.source ?? existing.source,
      relationships: mergedRels,
      updatedAt: Date.now()
    };
  }
}
