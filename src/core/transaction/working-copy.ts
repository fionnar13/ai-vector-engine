
import { ObjectID, GeometryID, AppearanceID, NodeID } from '../ids/index.js';
import { SemanticData } from '../semantic/types.js';
import { Constraint } from '../constraints/types.js';
import { GraphicObject } from '../stores/types.js';
import { Geometry } from '../geometry/types.js';
import { Appearance } from '../appearance/types.js';
import { SceneNode } from '../scenegraph/types.js';
import { Journal } from './journal.js';

function deepClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export class WorkingCopy {
  private objects = new Map<string, GraphicObject>();
  private semantics = new Map<string, SemanticData>();
  private constraints = new Map<string, Constraint>();
  private geometries = new Map<string, Geometry>();
  private appearances = new Map<string, Appearance>();
  private nodes = new Map<string, SceneNode>();

  // Track original existence for journal
  private originalObjects = new Set<string>();
  private originalSemantics = new Set<string>();
  private originalConstraints = new Set<string>();
  private originalGeometries = new Set<string>();
  private originalAppearances = new Set<string>();
  private originalNodes = new Set<string>();

  // Deleted tracking
  private deletedObjects = new Set<string>();
  private deletedSemantics = new Set<string>();
  private deletedConstraints = new Set<string>();
  private deletedGeometries = new Set<string>();
  private deletedAppearances = new Set<string>();
  private deletedNodes = new Set<string>();

  private journal: Journal;

  constructor(journal: Journal) {
    this.journal = journal;
  }

  // Load from canonical stores - affected entities only
  loadObject(id: ObjectID, canonical: GraphicObject | undefined): void {
    if (canonical) {
      this.objects.set(id, deepClone(canonical));
      this.originalObjects.add(id);
    }
  }

  loadGeometry(id: GeometryID, canonical: Geometry | undefined): void {
    if (canonical) {
      this.geometries.set(id, deepClone(canonical));
      this.originalGeometries.add(id);
    }
  }

  loadAppearance(id: AppearanceID, canonical: Appearance | undefined): void {
    if (canonical) {
      this.appearances.set(id, deepClone(canonical));
      this.originalAppearances.add(id);
    }
  }

  loadSemantic(id: ObjectID, canonical: SemanticData | undefined): void {
    if (canonical) {
      this.semantics.set(id, deepClone(canonical));
      this.originalSemantics.add(id);
    }
  }

  loadConstraint(id: any, canonical: Constraint | undefined): void {
    if (canonical) {
      this.constraints.set(id, deepClone(canonical));
      this.originalConstraints.add(id);
    }
  }

  loadNode(id: NodeID, canonical: SceneNode | undefined): void {
    if (canonical) {
      this.nodes.set(id, deepClone(canonical));
      this.originalNodes.add(id);
    }
  }

  // Getters
  getObject(id: ObjectID): GraphicObject | undefined {
    return this.objects.get(id) ? deepClone(this.objects.get(id)!) : undefined;
  }

  getGeometry(id: GeometryID): Geometry | undefined {
    return this.geometries.get(id) ? deepClone(this.geometries.get(id)!) : undefined;
  }

  getAppearance(id: AppearanceID): Appearance | undefined {
    return this.appearances.get(id) ? deepClone(this.appearances.get(id)!) : undefined;
  }

  getSemantic(id: ObjectID): SemanticData | undefined {
    return this.semantics.get(id) ? deepClone(this.semantics.get(id)!) : undefined;
  }

  getConstraint(id: any): Constraint | undefined {
    return this.constraints.get(id) ? deepClone(this.constraints.get(id)!) : undefined;
  }

  getNode(id: NodeID): SceneNode | undefined {
    return this.nodes.get(id) ? deepClone(this.nodes.get(id)!) : undefined;
  }

  hasObject(id: ObjectID): boolean { return this.objects.has(id); }
  hasGeometry(id: GeometryID): boolean { return this.geometries.has(id); }
  hasAppearance(id: AppearanceID): boolean { return this.appearances.has(id); }
  hasNode(id: NodeID): boolean { return this.nodes.has(id); }
  hasSemantic(id: ObjectID): boolean { return this.semantics.has(id); }
  hasConstraint(id: any): boolean { return this.constraints.has(id); }

  // Setters with journal tracking
  setObject(obj: GraphicObject): void {
    const exists = this.objects.has(obj.id) || this.originalObjects.has(obj.id);
    const isNew = !this.originalObjects.has(obj.id) && !exists;
    // Actually if originalObjects has it, it's modified, else added
    if (!this.originalObjects.has(obj.id) && !this.objects.has(obj.id)) {
      // New object
      this.journal.add('object', obj.id);
    } else if (this.originalObjects.has(obj.id)) {
      // Modified if not already added
      if (!this.journal.hasModified('object', obj.id) && !this.journal.hasAdded('object', obj.id)) {
        this.journal.modify('object', obj.id);
      }
    }
    this.objects.set(obj.id, deepClone(obj));
  }

  setGeometry(id: GeometryID, geom: Geometry): void {
    if (!this.originalGeometries.has(id) && !this.geometries.has(id)) {
      this.journal.add('geometry', id);
    } else if (this.originalGeometries.has(id)) {
      if (!this.journal.hasModified('geometry', id) && !this.journal.hasAdded('geometry', id)) {
        this.journal.modify('geometry', id);
      }
    }
    this.geometries.set(id, deepClone(geom));
  }

  setAppearance(appearance: Appearance): void {
    const id = appearance.id;
    if (!this.originalAppearances.has(id) && !this.appearances.has(id)) {
      this.journal.add('appearance', id);
    } else if (this.originalAppearances.has(id)) {
      if (!this.journal.hasModified('appearance', id) && !this.journal.hasAdded('appearance', id)) {
        this.journal.modify('appearance', id);
      }
    }
    this.appearances.set(id, deepClone(appearance));
  }

  setSemantic(data: SemanticData): void {
    if (!this.originalSemantics.has(data.objectId) && !this.semantics.has(data.objectId)) {
      this.journal.add('semantic', data.objectId);
    } else if (this.originalSemantics.has(data.objectId)) {
      if (!this.journal.hasModified('semantic', data.objectId) && !this.journal.hasAdded('semantic', data.objectId)) {
        this.journal.modify('semantic', data.objectId);
      }
    }
    this.semantics.set(data.objectId, deepClone(data));
  }

  setConstraint(constraint: Constraint): void {
    if (!this.originalConstraints.has(constraint.id as string) && !this.constraints.has(constraint.id as string)) {
      this.journal.add('constraint', constraint.id as string);
    } else if (this.originalConstraints.has(constraint.id as string)) {
      if (!this.journal.hasModified('constraint', constraint.id as string) && !this.journal.hasAdded('constraint', constraint.id as string)) {
        this.journal.modify('constraint', constraint.id as string);
      }
    }
    this.constraints.set(constraint.id as string, deepClone(constraint));
  }

  setNode(node: SceneNode): void {
    if (!this.originalNodes.has(node.id) && !this.nodes.has(node.id)) {
      this.journal.add('node', node.id);
    } else if (this.originalNodes.has(node.id)) {
      if (!this.journal.hasModified('node', node.id) && !this.journal.hasAdded('node', node.id)) {
        this.journal.modify('node', node.id);
      }
    }
    this.nodes.set(node.id, deepClone(node));
  }

  deleteObject(id: ObjectID): void {
    if (this.objects.has(id) || this.originalObjects.has(id)) {
      // If it was added in this transaction, remove from added, not add to removed
      if (this.journal.hasAdded('object', id)) {
        this.journal.removeAdded('object', id);
      } else {
        this.journal.remove('object', id);
      }
      this.objects.delete(id);
      this.deletedObjects.add(id);
    }
  }

  deleteGeometry(id: GeometryID): void {
    if (this.geometries.has(id) || this.originalGeometries.has(id)) {
      if (this.journal.hasAdded('geometry', id)) {
        this.journal.removeAdded('geometry', id);
      } else {
        this.journal.remove('geometry', id);
      }
      this.geometries.delete(id);
      this.deletedGeometries.add(id);
    }
  }

  deleteAppearance(id: AppearanceID): void {
    if (this.appearances.has(id) || this.originalAppearances.has(id)) {
      if (this.journal.hasAdded('appearance', id)) {
        this.journal.removeAdded('appearance', id);
      } else {
        this.journal.remove('appearance', id);
      }
      this.appearances.delete(id);
      this.deletedAppearances.add(id);
    }
  }

  deleteSemantic(id: ObjectID): void {
    if (this.semantics.has(id) || this.originalSemantics.has(id)) {
      if (this.journal.hasAdded('semantic', id)) {
        this.journal.removeAdded('semantic', id);
      } else {
        this.journal.remove('semantic', id);
      }
      this.semantics.delete(id);
      this.deletedSemantics.add(id);
    }
  }

  deleteConstraint(id: any): void {
    const sid = id as string;
    if (this.constraints.has(sid) || this.originalConstraints.has(sid)) {
      if (this.journal.hasAdded('constraint', sid)) {
        this.journal.removeAdded('constraint', sid);
      } else {
        this.journal.remove('constraint', sid);
      }
      this.constraints.delete(sid);
      this.deletedConstraints.add(sid);
    }
  }

  deleteNode(id: NodeID): void {
    if (this.nodes.has(id) || this.originalNodes.has(id)) {
      if (this.journal.hasAdded('node', id)) {
        this.journal.removeAdded('node', id);
      } else {
        this.journal.remove('node', id);
      }
      this.nodes.delete(id);
      this.deletedNodes.add(id);
    }
  }

  // For commit
  getObjects(): Map<string, GraphicObject> { return new Map(this.objects); }
  getGeometries(): Map<string, Geometry> { return new Map(this.geometries); }
  getAppearances(): Map<string, Appearance> { return new Map(this.appearances); }
  getNodes(): Map<string, SceneNode> { return new Map(this.nodes); }
  getSemantics(): Map<string, SemanticData> { return new Map(this.semantics); }
  getConstraints(): Map<string, Constraint> { return new Map(this.constraints); }

  getOriginalObjects(): Set<string> { return new Set(this.originalObjects); }
  getOriginalGeometries(): Set<string> { return new Set(this.originalGeometries); }
  getOriginalAppearances(): Set<string> { return new Set(this.originalAppearances); }
  getOriginalNodes(): Set<string> { return new Set(this.originalNodes); }
  getOriginalSemantics(): Set<string> { return new Set(this.originalSemantics); }
  getOriginalConstraints(): Set<string> { return new Set(this.originalConstraints); }

  getDeletedObjects(): Set<string> { return new Set(this.deletedObjects); }
  getDeletedGeometries(): Set<string> { return new Set(this.deletedGeometries); }
  getDeletedAppearances(): Set<string> { return new Set(this.deletedAppearances); }
  getDeletedNodes(): Set<string> { return new Set(this.deletedNodes); }
  getDeletedSemantics(): Set<string> { return new Set(this.deletedSemantics); }
  getDeletedConstraints(): Set<string> { return new Set(this.deletedConstraints); }

  getJournal(): Journal { return this.journal; }
}
