
/**
 * EventBus - Foundation
 * Requirements: type-safe, deterministic ordering, no hidden mutation, no UI/AI dep
 */
import { createEventID, EventID, TransactionID } from '../ids/index.js';

export type EventType =
  | 'ObjectCreated'
  | 'ObjectUpdated'
  | 'ObjectDeleted'
  | 'SceneGraphChanged'
  | 'SelectionChanged'
  | 'ConstraintCreated'
  | 'ConstraintDeleted'
  | 'TransactionStarted'
  | 'TransactionCommitted'
  | 'TransactionRolledBack'
  | 'RenderInvalidated'
  | 'EvaluationCompleted'
  | 'SemanticInferred';

export type EventSource = 'user' | 'ai' | 'system';

export type AppEvent = {
  readonly id: EventID;
  readonly timestamp: number;
  readonly correlationId?: string;
  readonly transactionId?: TransactionID;
  readonly source: EventSource;
  readonly type: EventType;
  readonly payload?: Record<string, unknown>;
  readonly version: number;
};

type Listener = (event: AppEvent) => void;

export class EventBus {
  private listeners: Map<EventType | '*', Set<Listener>> = new Map();
  private history: AppEvent[] = [];

  subscribe(type: EventType | '*', listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.unsubscribe(type, listener);
  }

  unsubscribe(type: EventType | '*', listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  publish(event: Omit<AppEvent, 'id'|'timestamp'|'version'> & { id?: EventID; timestamp?: number; version?: number }): AppEvent {
    const full: AppEvent = {
      id: event.id ?? createEventID(),
      timestamp: event.timestamp ?? Date.now(),
      version: event.version ?? 1,
      correlationId: event.correlationId,
      transactionId: event.transactionId,
      source: event.source,
      type: event.type,
      payload: event.payload
    };
    this.history.push(full);
    // deterministic ordering: specific type first, then wildcard
    const specific = this.listeners.get(full.type);
    if (specific) {
      for (const l of Array.from(specific)) l(full);
    }
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const l of Array.from(wildcard)) l(full);
    }
    return full;
  }

  getHistory(): readonly AppEvent[] { return this.history; }
  clearHistory(): void { this.history = []; }
}

export function createEvent(params: Omit<AppEvent, 'id'|'timestamp'|'version'>): AppEvent {
  return {
    id: createEventID(),
    timestamp: Date.now(),
    version: 1,
    ...params
  };
}
