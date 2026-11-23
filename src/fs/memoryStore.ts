import {
  AlreadyExistsError,
  NotFoundError,
  joinPath,
  type FileContent,
  type FileInfo,
  type FileStore,
} from './store';

interface MemoryFile {
  text: string;
  lastModified: number;
}

/** In-memory FileStore used by tests. Supports failure injection for rollback tests. */
export class MemoryStore implements FileStore {
  readonly name: string;
  private readonly files = new Map<string, MemoryFile>();
  private clock: number;
  /** When set, `write` throws for paths matching this predicate. */
  failWrite: ((path: string) => boolean) | null = null;

  constructor(initial: Record<string, string> = {}, name = 'memory', startTime = 1_700_000_000_000) {
    this.name = name;
    this.clock = startTime;
    for (const [path, text] of Object.entries(initial)) {
      this.files.set(joinPath(path), { text, lastModified: this.tick() });
    }
  }

  private tick(): number {
    this.clock += 1000;
    return this.clock;
  }

  private info(path: string, file: MemoryFile): FileInfo {
    return { path, lastModified: file.lastModified, size: new TextEncoder().encode(file.text).length };
  }

  async list(dir = ''): Promise<FileInfo[]> {
    const prefix = joinPath(dir);
    const result: FileInfo[] = [];
    for (const [path, file] of this.files) {
      if (prefix === '' || path.startsWith(`${prefix}/`)) result.push(this.info(path, file));
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }

  async stat(path: string): Promise<FileInfo | null> {
    const key = joinPath(path);
    const file = this.files.get(key);
    return file ? this.info(key, file) : null;
  }

  async read(path: string): Promise<FileContent> {
    const key = joinPath(path);
    const file = this.files.get(key);
    if (!file) throw new NotFoundError(key);
    return { ...this.info(key, file), text: file.text };
  }

  async write(path: string, text: string): Promise<FileInfo> {
    const key = joinPath(path);
    if (this.failWrite?.(key)) throw new Error(`Simulated write failure: ${key}`);
    const file = { text, lastModified: this.tick() };
    this.files.set(key, file);
    return this.info(key, file);
  }

  async rename(from: string, to: string): Promise<void> {
    const source = joinPath(from);
    const target = joinPath(to);
    const file = this.files.get(source);
    if (!file) throw new NotFoundError(source);
    if (this.files.has(target)) throw new AlreadyExistsError(target);
    this.files.delete(source);
    this.files.set(target, { text: file.text, lastModified: this.tick() });
  }

  async remove(path: string): Promise<void> {
    const key = joinPath(path);
    if (!this.files.delete(key)) throw new NotFoundError(key);
  }

  /** Test helper: simulates a change made by another tool. */
  externalWrite(path: string, text: string): void {
    this.files.set(joinPath(path), { text, lastModified: this.tick() });
  }

  /** Test helper: synchronous snapshot of every file. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].map(([path, file]) => [path, file.text]));
  }
}
