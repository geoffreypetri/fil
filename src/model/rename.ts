import type { FileStore } from '../fs/store';
import type { TagIndex } from '../index/tagIndex';
import { parseSheet, writeSettings } from './frontmatter';
import { dayPath, tagSheetPath, type DayKey } from './paths';
import { extractTagsByLine, normalizeTag } from './tags';
import { EMPTY_SETTINGS, type TagTable } from './tagTable';

export type RenameMode = 'alias' | 'everywhere';

export interface RenamePreview {
  readonly from: string;
  readonly to: string;
  /** Notes and day files whose text contains #from. */
  readonly notes: number;
  readonly days: readonly DayKey[];
  readonly hasSheet: boolean;
  /** #to already exists: the rename is a merge. */
  readonly merge: boolean;
}

export type RenameProblem =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'same' }
  | { readonly kind: 'aliasOfOther'; readonly owner: string };

/** Checks a rename and describes what it will touch. */
export function previewRename(
  from: string,
  toInput: string,
  table: TagTable,
  index: TagIndex,
): RenamePreview | RenameProblem {
  const to = normalizeTag(toInput);
  if (to === null) return { kind: 'invalid' };
  if (to === from) return { kind: 'same' };
  const owner = table.ownerOf(to);
  if (owner !== null && owner !== to && owner !== from) return { kind: 'aliasOfOther', owner };
  const usage = index.rawTagUsage(from);
  const targetUsed = index.rawTags().has(to) && table.canonical(to) === to;
  return {
    from,
    to,
    notes: usage.notes,
    days: usage.days,
    hasSheet: table.hasSheet(from),
    merge: targetUsed || table.hasSheet(to),
  };
}

export function isRenameProblem(value: RenamePreview | RenameProblem): value is RenameProblem {
  return 'kind' in value;
}

/** Replaces whole-word #from by #to, outside code blocks, inline code and URLs. */
export function retagText(text: string, from: string, to: string): string {
  const lines = text.split('\n');
  const matches = extractTagsByLine(lines);
  return lines
    .map((line, index) => {
      let result = line;
      for (const match of [...matches[index]!].reverse()) {
        if (match.tag === from) result = `${result.slice(0, match.from)}#${to}${result.slice(match.to)}`;
      }
      return result;
    })
    .join('\n');
}

export function appendMergedBody(text: string, from: string, body: string): string {
  const base = text === '' || text.endsWith('\n') ? text : `${text}\n`;
  const content = body.endsWith('\n') ? body : `${body}\n`;
  return `${base}\n## Merged from #${from}\n\n${content}`;
}

/** One file touched by an operation; null means "did not exist" / "removed". */
export interface FileChange {
  readonly path: string;
  readonly before: string | null;
  readonly after: string | null;
}

async function readOrNull(store: FileStore, path: string): Promise<string | null> {
  return (await store.stat(path)) ? (await store.read(path)).text : null;
}

/** Records every change before making it, so a failed operation can be rolled back. */
export class ChangeRecorder {
  readonly changes: FileChange[] = [];

  constructor(private readonly store: FileStore) {}

  async write(path: string, text: string): Promise<void> {
    this.changes.push({ path, before: await readOrNull(this.store, path), after: text });
    await this.store.write(path, text);
  }

  async remove(path: string): Promise<void> {
    const before = await readOrNull(this.store, path);
    if (before === null) return;
    this.changes.push({ path, before, after: null });
    await this.store.remove(path);
  }

  async rollback(): Promise<void> {
    await revertChanges(this.store, this.changes);
  }
}

/** Restores files to their state before the changes, in reverse order. */
export async function revertChanges(store: FileStore, changes: readonly FileChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    if (change.before === null) {
      if (await store.stat(change.path)) await store.remove(change.path);
    } else {
      await store.write(change.path, change.before);
    }
  }
}

export interface RenameResult {
  readonly from: string;
  readonly to: string;
  readonly mode: RenameMode;
  readonly changes: readonly FileChange[];
}

async function freePath(store: FileStore, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const path = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    if (!(await store.stat(path))) return path;
  }
}

/** Folder where the sheet of a tag merged into another one is kept. Not a tag sheet location. */
export const MERGED_DIR = 'tags/_merged';

/**
 * Renames (or merges) a tag.
 * - "alias": only sheets change; #from becomes an alias of #to. No note is rewritten.
 * - "everywhere": #from is replaced by #to in every day file, then the sheet is renamed.
 * The aliases of #from always follow #to. When #to exists, the sheets are merged: the body of
 * the old sheet is appended under "## Merged from #from", the target keeps its color and label,
 * and the old sheet is kept in tags/_merged/. Nothing is deleted. On error, every file already
 * changed is restored.
 */
export async function executeRename(
  store: FileStore,
  preview: RenamePreview,
  mode: RenameMode,
): Promise<RenameResult> {
  const { from, to } = preview;
  const recorder = new ChangeRecorder(store);
  try {
    if (mode === 'everywhere') {
      for (const day of preview.days) {
        const path = dayPath(day);
        const text = await readOrNull(store, path);
        if (text === null) continue;
        const next = retagText(text, from, to);
        if (next !== text) await recorder.write(path, next);
      }
    }

    const fromPath = tagSheetPath(from);
    const toPath = tagSheetPath(to);
    const fromText = await readOrNull(store, fromPath);
    const toText = await readOrNull(store, toPath);
    const fromSettings = fromText === null ? EMPTY_SETTINGS : parseSheet(fromText).settings;
    const carried = [...new Set([...fromSettings.aliases, ...(mode === 'alias' ? [from] : [])])].filter(
      (alias) => alias !== to,
    );

    if (!preview.merge && toText === null) {
      if (fromText !== null) {
        await recorder.write(toPath, writeSettings(fromText, { ...fromSettings, aliases: carried }));
        await recorder.remove(fromPath);
      } else if (carried.length > 0) {
        await recorder.write(toPath, writeSettings('', { ...EMPTY_SETTINGS, aliases: carried }));
      }
    } else {
      const targetSettings = toText === null ? EMPTY_SETTINGS : parseSheet(toText).settings;
      const aliases = [...new Set([...targetSettings.aliases, ...carried])].filter((alias) => alias !== to);
      let next = writeSettings(toText ?? '', { ...targetSettings, aliases });
      const fromBody = fromText === null ? '' : parseSheet(fromText).body;
      if (fromBody.trim() !== '') next = appendMergedBody(next, from, fromBody);
      if (next !== (toText ?? '')) await recorder.write(toPath, next);
      if (fromText !== null) {
        await recorder.write(await freePath(store, `${MERGED_DIR}/${from}`), fromText);
        await recorder.remove(fromPath);
      }
    }
  } catch (error) {
    await recorder.rollback();
    throw error;
  }
  return { from, to, mode, changes: recorder.changes };
}

export class UndoConflictError extends Error {
  constructor(readonly paths: readonly string[]) {
    super(`Files changed since the rename: ${paths.join(', ')}`);
    this.name = 'UndoConflictError';
  }
}

/** Reverts a rename, refusing if any touched file changed since. */
export async function undoRename(store: FileStore, result: RenameResult): Promise<void> {
  const changed: string[] = [];
  const last = new Map<string, string | null>();
  for (const change of result.changes) last.set(change.path, change.after);
  for (const [path, after] of last) {
    if ((await readOrNull(store, path)) !== after) changed.push(path);
  }
  if (changed.length > 0) throw new UndoConflictError(changed);
  await revertChanges(store, result.changes);
}
