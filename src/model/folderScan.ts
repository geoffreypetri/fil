import { isConflictFile } from '../fs/conflicts';
import type { FileInfo, FileStore } from '../fs/store';
import { parseDayPath, parseTagSheetPath, type DayKey } from './paths';

export interface FolderScan {
  /** Day files in chronological order. */
  readonly days: readonly (FileInfo & { day: DayKey })[];
  /** Files in tags/ (validated later by the tag table). */
  readonly sheets: readonly (FileInfo & { stem: string })[];
  /** Conflict copies left by sync services: reported, never read or overwritten. */
  readonly conflicts: readonly FileInfo[];
}

export function classifyFiles(files: readonly FileInfo[]): FolderScan {
  const days: (FileInfo & { day: DayKey })[] = [];
  const sheets: (FileInfo & { stem: string })[] = [];
  const conflicts: FileInfo[] = [];
  for (const file of files) {
    if (isConflictFile(file.path)) {
      conflicts.push(file);
      continue;
    }
    const day = parseDayPath(file.path);
    if (day) {
      days.push({ ...file, day });
      continue;
    }
    const stem = parseTagSheetPath(file.path);
    if (stem !== null) sheets.push({ ...file, stem });
  }
  days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return { days, sheets, conflicts };
}

export async function scanFolder(store: FileStore): Promise<FolderScan> {
  return classifyFiles(await store.list());
}
