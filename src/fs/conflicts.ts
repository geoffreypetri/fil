/**
 * Detects conflict copies created by sync services, e.g.
 *   2026-11-23 (conflicted copy 2026-11-24).md      Dropbox, Fil
 *   2026-11-23-DESKTOP-PC.md / 2026-11-23-PC-1.md   OneDrive
 *   2026-11-23 (1).md                               many tools
 *   2026-11-23.sync-conflict-20261123-145200-ABC.md Syncthing
 * These files are never read as day files nor overwritten: they are only reported.
 */
const CONFLICT_PATTERNS: readonly RegExp[] = [
  /conflict/i,
  / \(\d+\)\.md$/i,
  /^\d{4}-\d{2}-\d{2}-.+\.md$/i,
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
