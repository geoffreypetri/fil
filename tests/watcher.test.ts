import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { pageContent, pagesField, pageRanges } from '../src/editor/pageField';
import { MemoryStore } from '../src/fs/memoryStore';
import { MemoryIndexCache } from '../src/index/cache';
import { buildIndex } from '../src/index/indexBuilder';
import { TagIndex } from '../src/index/tagIndex';
import { PageSync } from '../src/journal/pageSync';
import { scanFolder } from '../src/model/folderScan';
import { diffFolder } from '../src/sync/folderDiff';
import { Saver } from '../src/sync/saver';
import { StatusHub } from '../src/sync/status';
import { ExternalWatcher } from '../src/sync/watcher';
import { TagService } from '../src/tags/tagService';

describe('folder diff', () => {
  it('finds changed, added and removed files', () => {
    const known = new Map([
      ['a.md', 1],
      ['b.md', 2],
      ['c.md', 3],
    ]);
    const diff = diffFolder(known, [
      { path: 'a.md', lastModified: 1, size: 1 },
      { path: 'b.md', lastModified: 5, size: 1 },
      { path: 'd.md', lastModified: 1, size: 1 },
    ]);
    expect(diff.changed.map((f) => f.path)).toEqual(['b.md']);
    expect(diff.added.map((f) => f.path)).toEqual(['d.md']);
    expect(diff.removed).toEqual(['c.md']);
  });
});

async function setup(files: Record<string, string>, count?: number) {
  const store = new MemoryStore(files);
  const status = new StatusHub();
  const saver = new Saver(store, { delayMs: 0 });
  const tags = new TagService(store, new TagIndex(), new MemoryIndexCache(), saver);
  const pages = new PageSync(store, saver, { delayMs: 10_000 });
  const scan = await scanFolder(store);
  await tags.loadSheets(scan);
  await buildIndex(store, scan, tags.index, new MemoryIndexCache());
  const initial = await pages.load(scan, count);
  const editor = {
    state: EditorState.create({ doc: initial.doc, extensions: pagesField.init(() => initial.pages) }),
    hasFocus: false,
    dispatch(spec: TransactionSpec) {
      const tr = this.state.update(spec);
      this.state = tr.state;
      pages.handleTransaction(tr);
    },
  };
  pages.attach(() => editor as never);
  const onSheetChanged = vi.fn();
  const watcher = new ExternalWatcher({
    store,
    saver,
    pages,
    tags,
    status,
    dispatch: (spec) => {
      if (spec) editor.dispatch(spec);
    },
    onSheetChanged,
  });
  const contentOf = (name: string): string | null => {
    const page = editor.state.field(pagesField).find((p) => p.name === name);
    return page ? pageContent(editor.state, page.id) : null;
  };
  return { store, pages, tags, status, watcher, onSheetChanged, editor, contentOf };
}

describe('external changes', () => {
  it('reloads a page changed by another tool, in the editor and the index', async () => {
    const ctx = await setup({ 'A.md': '# A\nold\n', 'B.md': '# B\nb\n' });
    ctx.store.externalWrite('A.md', '# A\nfrom another computer #synced\n');
    await ctx.watcher.check();
    expect(ctx.contentOf('A')).toBe('# A\nfrom another computer #synced');
    expect(ctx.contentOf('B')).toBe('# B\nb');
    expect(ctx.tags.index.get('A.md')!.notes.flatMap((n) => n.ownTags)).toEqual(['synced']);
    const read = vi.spyOn(ctx.store, 'read');
    await ctx.watcher.check();
    expect(read).not.toHaveBeenCalled();
  });

  it('leaves a page with unsaved local edits alone', async () => {
    const ctx = await setup({ 'A.md': '# A\nlocal\n' });
    ctx.editor.dispatch({ changes: { from: ctx.editor.state.doc.length, insert: '!' }, userEvent: 'input.type' });
    ctx.store.externalWrite('A.md', '# A\nremote\n');
    await ctx.watcher.check();
    expect(ctx.contentOf('A')).toBe('# A\nlocal!');
    await ctx.pages.flush();
    const files = ctx.store.snapshot();
    expect(files['A.md']).toBe('# A\nlocal!\n');
    expect(Object.values(files)).toContain('# A\nremote\n');
  });

  it('shows a page created elsewhere at the end, and drops one deleted elsewhere', async () => {
    const ctx = await setup({ 'A.md': '# A\na\n', 'B.md': '# B\nb\n' });
    ctx.store.externalWrite('New.md', '# New\nfrom phone\n');
    await ctx.store.remove('A.md');
    await ctx.watcher.check();
    expect(ctx.editor.state.doc.toString()).toBe('# B\nb\n# New\nfrom phone');
    expect(pageRanges(ctx.editor.state).pages.map((r) => r.page.name)).toEqual(['B', 'New']);
    expect(ctx.pages.allNames()).toEqual(['B', 'New']);
  });

  it('adopts an order changed in index.md elsewhere', async () => {
    const ctx = await setup({ 'A.md': '# A\n', 'B.md': '# B\n', 'index.md': '- [[A]]\n- [[B]]\n' });
    ctx.store.externalWrite('index.md', '- [[B]]\n- [[A]]\n');
    await ctx.watcher.check();
    expect(ctx.pages.allNames()).toEqual(['B', 'A']);
  });

  it('reports conflict copies without touching them', async () => {
    const ctx = await setup({ 'A.md': 'x\n', 'A (1).md': 'copy\n' });
    await ctx.watcher.check();
    expect(ctx.status.get().messages).toEqual(['Conflict copy found: A (1).md']);
    expect(ctx.store.snapshot()['A (1).md']).toBe('copy\n');
  });

  it('reloads tag sheets and their settings', async () => {
    const ctx = await setup({ 'A.md': '# A\n#px\n', 'tags/project-x.md': 'Body\n' });
    expect(ctx.tags.resolve('px')).toBe('px');
    ctx.store.externalWrite('tags/project-x.md', '---\naliases: [px]\n---\nBody\n');
    await ctx.watcher.check();
    expect(ctx.tags.resolve('px')).toBe('project-x');
    expect(ctx.onSheetChanged).toHaveBeenCalledWith('project-x');
  });
});
