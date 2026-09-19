
import { InteractionState, PointerInput, KeyboardInput } from './types.js';

export interface StateMachineTransition {
  from: InteractionState[];
  event: string;
  to: InteractionState;
  guard?: (input: any) => boolean;
}

export class InteractionStateMachine {
  private state: InteractionState = 'Idle';
  private listeners: ((from: InteractionState, to: InteractionState, event: string) => void)[] = [];

  private transitions: Map<string, StateMachineTransition[]> = new Map();

  constructor() {
    this.setupDefaultTransitions();
  }

  private setupDefaultTransitions(): void {
    // Idle -> Hover on pointermove
    this.addTransition({ from: ['Idle'], event: 'pointermove', to: 'Hover' });
    // Hover -> Pressed on pointerdown
    this.addTransition({ from: ['Hover', 'Idle'], event: 'pointerdown', to: 'Pressed' });
    // Pressed -> Dragging on pointermove beyond threshold
    this.addTransition({ from: ['Pressed'], event: 'dragstart', to: 'Dragging' });
    // Pressed -> Marquee on pointermove with no hit
    this.addTransition({ from: ['Pressed'], event: 'marqueestart', to: 'MarqueeSelecting' });
    // Pressed -> Idle on pointerup (click)
    this.addTransition({ from: ['Pressed'], event: 'pointerup', to: 'Idle' });
    // Dragging -> Idle on pointerup
    this.addTransition({ from: ['Dragging'], event: 'pointerup', to: 'Idle' });
    // Dragging -> Idle on cancel
    this.addTransition({ from: ['Dragging'], event: 'cancel', to: 'Idle' });
    // MarqueeSelecting -> Idle on pointerup
    this.addTransition({ from: ['MarqueeSelecting'], event: 'pointerup', to: 'Idle' });
    // MarqueeSelecting -> Idle on cancel
    this.addTransition({ from: ['MarqueeSelecting'], event: 'cancel', to: 'Idle' });
    // Hover -> Idle on pointerleave? For MVP, stay hover
    this.addTransition({ from: ['Hover'], event: 'pointerup', to: 'Hover' });
    // Any -> Idle on cancel
    this.addTransition({ from: ['Hover', 'Pressed', 'Dragging', 'MarqueeSelecting', 'Transforming', 'AnchorEditing'], event: 'cancel', to: 'Idle' });
    // Transforming
    this.addTransition({ from: ['Pressed', 'Hover', 'Idle'], event: 'transformstart', to: 'Transforming' });
    this.addTransition({ from: ['Transforming'], event: 'pointerup', to: 'Idle' });
    this.addTransition({ from: ['Transforming'], event: 'cancel', to: 'Idle' });
    // AnchorEditing
    this.addTransition({ from: ['Pressed', 'Hover', 'Idle'], event: 'anchoreditstart', to: 'AnchorEditing' });
    this.addTransition({ from: ['AnchorEditing'], event: 'pointerup', to: 'AnchorEditing' });
    this.addTransition({ from: ['AnchorEditing'], event: 'cancel', to: 'Idle' });
    // Generic: any pointerdown from Idle goes to Pressed
    this.addTransition({ from: ['Idle'], event: 'pointerdown', to: 'Pressed' });
  }

  addTransition(transition: StateMachineTransition): void {
    const list = this.transitions.get(transition.event) || [];
    list.push(transition);
    this.transitions.set(transition.event, list);
  }

  getState(): InteractionState {
    return this.state;
  }

  canTransition(event: string): boolean {
    const transitions = this.transitions.get(event) || [];
    return transitions.some(t => t.from.includes(this.state));
  }

  transition(event: string, input?: any): boolean {
    const transitions = this.transitions.get(event) || [];
    for (const trans of transitions) {
      if (trans.from.includes(this.state)) {
        if (trans.guard && !trans.guard(input)) continue;
        const from = this.state;
        this.state = trans.to;
        this.emit(from, trans.to, event);
        return true;
      }
    }
    return false;
  }

  reset(): void {
    const from = this.state;
    this.state = 'Idle';
    if (from !== 'Idle') {
      this.emit(from, 'Idle', 'reset');
    }
  }

  setState(state: InteractionState): void {
    const from = this.state;
    this.state = state;
    this.emit(from, state, 'setState');
  }

  subscribe(listener: (from: InteractionState, to: InteractionState, event: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(from: InteractionState, to: InteractionState, event: string): void {
    for (const listener of this.listeners) {
      listener(from, to, event);
    }
  }
}
