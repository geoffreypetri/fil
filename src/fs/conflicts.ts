/**
 * Detects conflict copies created by sync services, e.g.
 *   Notes (conflicted copy 2026-11-24).md      Dropbox, Fil
 *   Notes (1).md                               many tools
 *   Notes.sync-conflict-20261123-145200-ABC.md Syncthing
 *   Notes-DESKTOP-conflict.md                  OneDrive
 * These files are never read as pages nor overwritten: they are only reported.
 */
const CONFLICT_PATTERNS: readonly RegExp[] = [
  /\(conflicted copy\b/i, // Dropbox, Fil
  /\.sync-conflict-/i, // Syncthing
  / \(\d+\)\.md$/i, // "(1)" duplicates made by many tools
  /-conflict(-\d+)?\.md$/i, // OneDrive ("Name-PCNAME-conflict.md" style)
];

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function isConflictFile(path: string): boolean {
  if (!path.toLowerCase().endsWith('.md')) return false;
  const name = fileName(path);
  return CONFLICT_PATTERNS.some((pattern) => pattern.test(name));
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Name of the backup Fil writes when a file changed on disk while it had unsaved edits. */
export function conflictCopyPath(path: string, date: Date): string {
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const dot = path.lastIndexOf('.');
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  return `${stem} (conflicted copy ${stamp} fil).md`;
}
