
import { ObjectID } from '../ids/index.js';

export type SemanticRole =
  | 'background'
  | 'foreground'
  | 'container'
  | 'group'
  | 'text'
  | 'heading'
  | 'button'
  | 'icon'
  | 'logo'
  | 'image'
  | 'illustration'
  | 'decorative'
  | 'shape'
  | 'unknown';

export type SemanticSource =
  | 'user'
  | 'ai'
  | 'heuristic'
  | 'import'
  | 'system';

export type SemanticRelationshipType =
  | 'contains'
  | 'containedBy'
  | 'labels'
  | 'associatedWith'
  | 'decorates'
  | 'references';

export interface SemanticRelationship {
  readonly targetObjectId: ObjectID;
  readonly type: SemanticRelationshipType;
}

export interface SemanticData {
  readonly objectId: ObjectID;
  readonly role?: SemanticRole;
  readonly tags: string[];
  readonly confidence: number;
  readonly source: SemanticSource;
  readonly relationships: SemanticRelationship[];
  readonly updatedAt?: number;
}

export interface SemanticEvidence {
  readonly signal:
    | 'geometry_type'
    | 'aspect_ratio'
    | 'size'
    | 'position'
    | 'appearance'
    | 'text'
    | 'scene_structure'
    | 'relationship';
  readonly description: string;
  readonly weight: number;
}

export interface SemanticProposal {
  readonly proposalId: string;
  readonly objectId: ObjectID;
  readonly proposedRole?: SemanticRole;
  readonly proposedTags: string[];
  readonly proposedRelationships: SemanticRelationship[];
  readonly confidence: number;
  readonly evidence: SemanticEvidence[];
  readonly source: 'heuristic' | 'ai';
  readonly createdAt?: number;
}

export interface SemanticInferenceInput {
  readonly objectId: ObjectID;
  readonly geometry?: any;
  readonly appearance?: any;
  readonly sceneContext?: {
    parentId?: string | null;
    childCount?: number;
    siblingCount?: number;
    depth?: number;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; area: number };
    isText?: boolean;
    textContent?: string;
  };
}

export interface SemanticInferredEvent {
  readonly proposalId: string;
  readonly objectId: ObjectID;
  readonly proposal: SemanticProposal;
  readonly source: 'heuristic' | 'ai';
}

export type SemanticEventType =
  | 'SemanticCreated'
  | 'SemanticUpdated'
  | 'SemanticDeleted'
  | 'SemanticInferred';
