import { isConflictFile } from '../fs/conflicts';
import type { FileInfo, FileStore } from '../fs/store';
import { INDEX_FILE, pageNameOf } from './pages';
import { parseTagSheetPath } from './paths';

export interface FolderScan {
  /** Markdown files at the root of the folder (pages), by path. */
  readonly pages: readonly (FileInfo & { name: string })[];
  /** index.md, which keeps the order of the pages, if present. */
  readonly index: FileInfo | null;
  /** Files in tags/ (validated later by the tag table). */
  readonly sheets: readonly (FileInfo & { stem: string })[];
  /** Conflict copies left by sync services: reported, never read or overwritten. */
  readonly conflicts: readonly FileInfo[];
}

export function classifyFiles(files: readonly FileInfo[]): FolderScan {
  const pages: (FileInfo & { name: string })[] = [];
  const sheets: (FileInfo & { stem: string })[] = [];
  const conflicts: FileInfo[] = [];
  let index: FileInfo | null = null;
  for (const file of files) {
    if (isConflictFile(file.path)) {
      conflicts.push(file);
      continue;
    }
    if (file.path.toLowerCase() === INDEX_FILE) {
      index = file;
      continue;
    }
    const name = pageNameOf(file.path);
    if (name !== null) {
      pages.push({ ...file, name });
      continue;
    }
    const stem = parseTagSheetPath(file.path);
    if (stem !== null) sheets.push({ ...file, stem });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, index, sheets, conflicts };
}

export async function scanFolder(store: FileStore): Promise<FolderScan> {
  return classifyFiles(await store.list());
}
