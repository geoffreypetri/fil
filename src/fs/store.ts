/**
 * File system abstraction. Paths are relative to the notes folder and use "/" separators,
 * e.g. "2026/11/2026-11-23.md" or "tags/project-x.md".
 */
export interface FileInfo {
  readonly path: string;
  readonly lastModified: number;
  readonly size: number;
}

export interface FileContent extends FileInfo {
  readonly text: string;
}

export interface FileStore {
  /** Display name of the root folder. */
  readonly name: string;
  /** Lists every file under `dir` (recursively). Missing directories yield an empty list. */
  list(dir?: string): Promise<FileInfo[]>;
  /** Returns null when the file does not exist. */
  stat(path: string): Promise<FileInfo | null>;
  /** Throws NotFoundError when the file does not exist. */
  read(path: string): Promise<FileContent>;
  /** Creates parent directories as needed and overwrites any existing file. */
  write(path: string, text: string): Promise<FileInfo>;
  /** Fails with AlreadyExistsError when `to` exists. */
  rename(from: string, to: string): Promise<void>;
  /** Removes a file. Only used to roll back files that an operation created itself. */
  remove(path: string): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(readonly path: string) {
    super(`File not found: ${path}`);
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends Error {
  constructor(readonly path: string) {
    super(`File already exists: ${path}`);
    this.name = 'AlreadyExistsError';
  }
}

export function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0 && part !== '.');
}

export function joinPath(...parts: string[]): string {
  return parts.flatMap(splitPath).join('/');
}
