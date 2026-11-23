import type { FileInfo } from '../fs/store';

export interface FolderDiff {
  /** Files known before whose modification time changed. */
  readonly changed: readonly FileInfo[];
  /** Files that were not known. */
  readonly added: readonly FileInfo[];
  /** Known files that are gone. */
  readonly removed: readonly string[];
}

/** Compares the files on disk with the modification times known to the app. */
export function diffFolder(known: ReadonlyMap<string, number>, files: readonly FileInfo[]): FolderDiff {
  const changed: FileInfo[] = [];
  const added: FileInfo[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    seen.add(file.path);
    const lastModified = known.get(file.path);
    if (lastModified === undefined) added.push(file);
    else if (lastModified !== file.lastModified) changed.push(file);
  }
  const removed = [...known.keys()].filter((path) => !seen.has(path));
  return { changed, added, removed };
}
