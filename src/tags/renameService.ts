import type { EditorView } from '@codemirror/view';
import type { FileStore } from '../fs/store';
import type { PageSync } from '../journal/pageSync';
import { scanFolder } from '../model/folderScan';
import { pageDisplayText, pageNameOf } from '../model/pages';
import { TAGS_DIR } from '../model/paths';
import {
  executeRename,
  previewRename,
  undoRename,
  type FileChange,
  type RenameMode,
  type RenamePreview,
  type RenameProblem,
  type RenameResult,
} from '../model/rename';
import type { Saver } from '../sync/saver';
import type { TagService } from './tagService';

export interface RenameDeps {
  readonly store: FileStore;
  readonly saver: Saver;
  readonly tags: TagService;
  readonly pages: PageSync;
  view(): EditorView | null;
  /** Called after files changed, with the old and new primary names. */
  onRenamed(from: string, to: string): void;
}

/**
 * Runs tag renames and merges, then brings the editor, the index and the tag table in line
 * with the files. The last rename can be undone while the app stays open.
 */
export class RenameService {
  private last: RenameResult | null = null;

  constructor(private readonly deps: RenameDeps) {}

  canUndo(): boolean {
    return this.last !== null;
  }

  lastRename(): RenameResult | null {
    return this.last;
  }

  preview(from: string, to: string): RenamePreview | RenameProblem {
    return previewRename(from, to, this.deps.tags.table, this.deps.tags.index);
  }

  async rename(preview: RenamePreview, mode: RenameMode): Promise<RenameResult> {
    // Pending edits must reach the disk first: the rename reads and rewrites files.
    await this.deps.pages.flush();
    const result = await executeRename(this.deps.store, preview, mode);
    this.last = result;
    await this.apply(result.changes, 'after');
    this.deps.onRenamed(result.from, result.to);
    return result;
  }

  async undo(): Promise<void> {
    const result = this.last;
    if (!result) return;
    await this.deps.pages.flush();
    await undoRename(this.deps.store, result);
    this.last = null;
    await this.apply(result.changes, 'before');
    this.deps.onRenamed(result.to, result.from);
  }

  private async apply(changes: readonly FileChange[], side: 'before' | 'after'): Promise<void> {
    const { store, saver, tags, pages } = this.deps;
    let sheetsChanged = false;
    for (const change of changes) {
      const text = change[side];
      const name = pageNameOf(change.path);
      if (change.path.startsWith(`${TAGS_DIR}/`)) sheetsChanged = true;
      if (name === null) continue;
      if (text === null) {
        saver.track(change.path, null);
        tags.index.delete(change.path);
        continue;
      }
      const info = await store.stat(change.path);
      const lastModified = info?.lastModified ?? Date.now();
      saver.track(change.path, lastModified, text);
      tags.updatePage(change.path, text, lastModified);
      const spec = pages.replaceSpec(name, pageDisplayText(name, text));
      const view = this.deps.view();
      if (spec && view) view.dispatch(spec);
    }
    if (sheetsChanged) await tags.loadSheets(await scanFolder(store));
  }
}
