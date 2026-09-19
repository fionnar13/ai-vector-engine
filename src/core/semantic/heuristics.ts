
import {
  SemanticData,
  SemanticRole,
  SemanticProposal,
  SemanticEvidence,
  SemanticRelationship,
  SemanticInferenceInput
} from './types.js';
import { createObjectID } from '../ids/index.js';

// Deterministic confidence model: base + sum(evidence weights) clamped [0,1]
// Evidence weights documented and deterministic

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function createProposalId(): string {
  // Use crypto.randomUUID if available, else deterministic fallback
  // For determinism in inference, proposalId should be unique but not affect confidence
  // We use randomUUID for uniqueness, but inference result determinism is about role/tags/confidence/evidence, not id
  try {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      // @ts-ignore
      return crypto.randomUUID();
    }
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function inferSemantic(input: SemanticInferenceInput): SemanticProposal | null {
  const evidence: SemanticEvidence[] = [];
  let proposedRole: SemanticRole | undefined = undefined;
  const proposedTags: string[] = [];
  const proposedRelationships: SemanticRelationship[] = [];
  let baseConfidence = 0.5;

  const geometry = input.geometry;
  const appearance = input.appearance;
  const scene = input.sceneContext;

  // Geometry type signal
  if (geometry) {
    const gType = geometry.type || geometry.kind || 'unknown';
    if (gType === 'text' || input.sceneContext?.isText) {
      evidence.push({ signal: 'geometry_type', description: 'text object geometry', weight: 0.3 });
      proposedRole = 'text';
      proposedTags.push('text');
      baseConfidence = 0.7;
      if (scene?.textContent) {
        const textLen = scene.textContent.length;
        if (textLen < 100) {
          evidence.push({ signal: 'text', description: `short text content length ${textLen}`, weight: 0.15 });
          // Heuristic: short uppercase maybe heading?
          if (textLen < 50 && scene.textContent.trim().length > 0) {
            const isUpperOrTitle = scene.textContent === scene.textContent.toUpperCase() || /^[A-Z]/.test(scene.textContent);
            if (isUpperOrTitle && textLen < 30) {
              evidence.push({ signal: 'text', description: 'potential heading', weight: 0.1 });
              // Keep role as text, but add heading tag candidate, or role heading if strong
              // For conservative inference, we propose heading only if text is short and looks like heading
              // We'll keep text but add tag
              proposedTags.push('heading');
              // If text length < 20 and uppercase, propose heading role with lower confidence
              if (textLen < 20) {
                proposedRole = 'heading';
                baseConfidence = 0.65;
              }
            }
          }
        }
      }
    } else if (gType === 'rect') {
      evidence.push({ signal: 'geometry_type', description: 'rectangle geometry', weight: 0.1 });
      const params = geometry.params || {};
      const w = params.width ?? scene?.bbox?.width ?? 0;
      const h = params.height ?? scene?.bbox?.height ?? 0;
      const area = w * h;
      const aspect = h !== 0 ? w / h : 1;

      // Size signal
      if (area > 0) {
        evidence.push({ signal: 'size', description: `area ${area}`, weight: 0.05 });
      }

      // Aspect ratio
      if (aspect > 2 || aspect < 0.5) {
        evidence.push({ signal: 'aspect_ratio', description: `aspect ratio ${aspect.toFixed(2)}`, weight: 0.05 });
      }

      // Large rectangle -> background candidate
      if (scene?.bbox) {
        const bboxArea = scene.bbox.area;
        // If large area > 100000, background candidate
        if (bboxArea > 100000) {
          evidence.push({ signal: 'size', description: 'large rectangle', weight: 0.2 });
          proposedRole = 'background';
          proposedTags.push('background', 'shape');
          baseConfidence = 0.6;
        } else if (bboxArea < 5000) {
          // Small rectangle -> shape / possible button if appearance suggests?
          evidence.push({ signal: 'size', description: 'small rectangle', weight: 0.1 });
          proposedRole = 'shape';
          proposedTags.push('shape');
          baseConfidence = 0.55;
          // Appearance signal for button: filled, maybe rounded? For MVP, if fill present and small, still shape not button (conservative)
          if (appearance && appearance.stack) {
            const hasFill = appearance.stack.some((item: any) => item.type === 'fill' && item.enabled);
            if (hasFill) {
              evidence.push({ signal: 'appearance', description: 'filled small rect', weight: 0.05 });
              // Still shape, not button unless additional evidence
              proposedTags.push('filled');
            }
          }
        } else {
          proposedRole = 'shape';
          proposedTags.push('shape');
          baseConfidence = 0.55;
        }
      } else {
        proposedRole = 'shape';
        proposedTags.push('shape');
        baseConfidence = 0.5;
      }

      // Position signal: centered?
      if (scene?.bbox) {
        // If near top-left? Could be container? For MVP conservative
        evidence.push({ signal: 'position', description: `position x:${scene.bbox.minX} y:${scene.bbox.minY}`, weight: 0.02 });
      }
    } else if (gType === 'ellipse') {
      evidence.push({ signal: 'geometry_type', description: 'ellipse geometry', weight: 0.1 });
      proposedRole = 'shape';
      proposedTags.push('shape', 'ellipse');
      baseConfidence = 0.55;
    } else if (gType === 'path' || gType === 'polygon' || gType === 'star' || gType === 'line') {
      evidence.push({ signal: 'geometry_type', description: `${gType} geometry`, weight: 0.1 });
      // For path with many anchors, maybe icon?
      const anchorCount = geometry.contours?.[0]?.anchors?.length ?? geometry.params?.points?.length ?? 0;
      if (anchorCount > 0 && anchorCount < 10) {
        proposedRole = 'icon';
        proposedTags.push('icon', 'shape');
        baseConfidence = 0.55;
      } else {
        proposedRole = 'shape';
        proposedTags.push('shape');
        baseConfidence = 0.5;
      }
    }
  }

  // Scene structure
  if (scene) {
    if (scene.childCount !== undefined && scene.childCount > 0) {
      evidence.push({ signal: 'scene_structure', description: `has ${scene.childCount} children`, weight: 0.1 });
      if (scene.childCount > 2) {
        proposedRole = proposedRole === 'shape' ? 'container' : proposedRole;
        if (proposedRole === 'container') {
          proposedTags.push('container');
          baseConfidence = Math.max(baseConfidence, 0.6);
        }
      }
    }
    if (scene.parentId) {
      evidence.push({ signal: 'scene_structure', description: 'has parent', weight: 0.02 });
    }
  }

  // Appearance signals
  if (appearance) {
    if (appearance.stack) {
      const hasFill = appearance.stack.some((item: any) => item.type === 'fill' && item.enabled);
      const hasStroke = appearance.stack.some((item: any) => item.type === 'stroke' && item.enabled);
      if (hasFill) {
        evidence.push({ signal: 'appearance', description: 'has fill', weight: 0.03 });
      }
      if (hasStroke) {
        evidence.push({ signal: 'appearance', description: 'has stroke', weight: 0.02 });
      }
    }
  }

  // If insufficient evidence, return unknown or null? Per spec, prefer unknown + tags + confidence over unsupported classification
  if (evidence.length === 0) {
    // Insufficient evidence -> unknown
    return {
      proposalId: createProposalId(),
      objectId: input.objectId,
      proposedRole: 'unknown',
      proposedTags: [],
      proposedRelationships: [],
      confidence: 0.3,
      evidence: [{ signal: 'geometry_type', description: 'insufficient evidence', weight: 0 }],
      source: 'heuristic',
      createdAt: Date.now()
    };
  }

  // Calculate confidence: base + sum weights clamped
  const sumWeights = evidence.reduce((acc, e) => acc + e.weight, 0);
  let confidence = clamp01(baseConfidence + sumWeights * 0.3); // transparent model: base + 0.3*sumWeights

  // Conservative: if proposedRole is not set, set to unknown
  if (!proposedRole) {
    proposedRole = 'unknown';
    confidence = Math.min(confidence, 0.5);
  }

  // For conservative inference, if confidence <0.5 and role is not text, keep unknown
  if (confidence < 0.5 && proposedRole !== 'text' && proposedRole !== 'heading') {
    proposedRole = 'unknown';
  }

  // Ensure deterministic ordering of tags and evidence
  const uniqueTags = Array.from(new Set(proposedTags.map(t => t.trim().toLowerCase()))).sort();
  const sortedEvidence = [...evidence].sort((a, b) => {
    const s = a.signal.localeCompare(b.signal);
    if (s !== 0) return s;
    return a.description.localeCompare(b.description);
  });

  return {
    proposalId: createProposalId(),
    objectId: input.objectId,
    proposedRole,
    proposedTags: uniqueTags,
    proposedRelationships,
    confidence,
    evidence: sortedEvidence,
    source: 'heuristic',
    createdAt: Date.now()
  };
}

export function inferSemanticBatch(inputs: SemanticInferenceInput[]): SemanticProposal[] {
  const proposals: SemanticProposal[] = [];
  for (const input of inputs) {
    const p = inferSemantic(input);
    if (p) proposals.push(p);
  }
  // Deterministic ordering by objectId
  return proposals.sort((a, b) => a.objectId.localeCompare(b.objectId));
}
