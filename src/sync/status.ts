export type SaveState = 'saved' | 'saving' | 'error';

export interface StatusSnapshot {
  readonly state: SaveState;
  /** Details shown on hover: errors, conflict files, alias conflicts… */
  readonly messages: readonly string[];
}

type Listener = (status: StatusSnapshot) => void;

/**
 * Aggregates status from several sources (saver, conflict detection, tag table).
 * The worst state wins: error > saving > saved.
 */
export class StatusHub {
  private readonly sources = new Map<string, StatusSnapshot>();
  private readonly listeners = new Set<Listener>();

  set(source: string, state: SaveState, messages: readonly string[] = []): void {
    this.sources.set(source, { state, messages });
    this.emit();
  }

  clear(source: string): void {
    this.sources.delete(source);
    this.emit();
  }

  get(): StatusSnapshot {
    let state: SaveState = 'saved';
    const messages: string[] = [];
    for (const snapshot of this.sources.values()) {
      if (snapshot.state === 'error') state = 'error';
      else if (snapshot.state === 'saving' && state !== 'error') state = 'saving';
      messages.push(...snapshot.messages);
    }
    return { state, messages };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
  }
}
