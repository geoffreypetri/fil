import { conflictCopyPath } from '../fs/conflicts';
import type { FileStore } from '../fs/store';
import type { SaveState } from './status';

export interface SaverOptions {
  delayMs?: number;
  now?: () => Date;
  onState?: (state: SaveState, error?: string) => void;
  /** Called after a file is written, with its new modification time. */
  onWritten?: (path: string, text: string, lastModified: number) => void;
  /** Called when a disk version was preserved as a conflict copy before overwriting. */
  onConflictCopy?: (path: string, copyPath: string) => void;
}

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
  getText: () => string;
}

interface Known {
  lastModified: number;
  text: string;
}

/**
 * Debounced writer: each file is written `delayMs` after its last change.
 * Before writing, it checks that the file did not change on disk since it was read. If it did,
 * the disk version is first preserved as a conflict copy, so nothing is ever lost.
 */
export class Saver {
  private readonly pending = new Map<string, Pending>();
  private readonly known = new Map<string, Known>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private failed = new Map<string, string>();
  private readonly delayMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: FileStore,
    private readonly options: SaverOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 800;
    this.now = options.now ?? (() => new Date());
  }

  /** Records the version of a file as read from disk (null when it does not exist yet). */
  track(path: string, lastModified: number | null, text = ''): void {
    if (lastModified === null) this.known.delete(path);
    else this.known.set(path, { lastModified, text });
  }

  knownModified(path: string): number | undefined {
    return this.known.get(path)?.lastModified;
  }

  isPending(path: string): boolean {
    return this.pending.has(path) || this.inFlight.has(path);
  }

  hasPending(): boolean {
    return this.pending.size > 0 || this.inFlight.size > 0;
  }

  schedule(path: string, getText: () => string): void {
    const existing = this.pending.get(path);
    if (existing?.timer) clearTimeout(existing.timer);
    const entry: Pending = { getText, timer: null };
    entry.timer = setTimeout(() => void this.run(path), this.delayMs);
    this.pending.set(path, entry);
    this.report();
  }

  /** Cancels a scheduled write (e.g. the file was reloaded from disk). */
  cancel(path: string): void {
    const entry = this.pending.get(path);
    if (entry?.timer) clearTimeout(entry.timer);
    this.pending.delete(path);
    this.report();
  }

  /** Writes every pending file now. */
  async flush(): Promise<void> {
    const paths = [...this.pending.keys()];
    await Promise.all(paths.map((path) => this.run(path)));
    await Promise.all([...this.inFlight.values()]);
  }

  private async run(path: string): Promise<void> {
    const previous = this.inFlight.get(path);
    if (previous) await previous;
    const entry = this.pending.get(path);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(path);

    const task = this.write(path, entry.getText());
    this.inFlight.set(path, task);
    this.report();
    try {
      await task;
      this.failed.delete(path);
    } catch (error) {
      this.failed.set(path, error instanceof Error ? error.message : String(error));
      // Keep the change so the next edit (or flush) retries it.
      if (!this.pending.has(path)) this.pending.set(path, { getText: entry.getText, timer: null });
    } finally {
      this.inFlight.delete(path);
      this.report();
    }
  }

  private async write(path: string, text: string): Promise<void> {
    const disk = await this.store.stat(path);
    const known = this.known.get(path);
    if (disk && disk.lastModified !== known?.lastModified) {
      const current = await this.store.read(path);
      if (current.text !== text && current.text !== known?.text) {
        const copyPath = conflictCopyPath(path, this.now());
        await this.store.write(copyPath, current.text);
        this.options.onConflictCopy?.(path, copyPath);
      }
    }
    const info = await this.store.write(path, text);
    this.known.set(path, { lastModified: info.lastModified, text });
    this.options.onWritten?.(path, text, info.lastModified);
  }

  private report(): void {
    if (this.failed.size > 0) {
      this.options.onState?.('error', [...this.failed.entries()].map(([p, m]) => `${p}: ${m}`).join('\n'));
    } else if (this.hasPending()) {
      this.options.onState?.('saving');
    } else {
      this.options.onState?.('saved');
    }
  }
}
