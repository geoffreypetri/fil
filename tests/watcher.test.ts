import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { segmentContentOf, segmentExtensions } from '../src/editor/segmentField';
import { MemoryStore } from '../src/fs/memoryStore';
import { MemoryIndexCache } from '../src/index/cache';
import { buildIndex } from '../src/index/indexBuilder';
import { TagIndex } from '../src/index/tagIndex';
import { Journal } from '../src/journal/journal';
import { scanFolder } from '../src/model/folderScan';
import { buildDocument } from '../src/model/segments';
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

async function setup(files: Record<string, string>, loaded: string[]) {
  const store = new MemoryStore(files);
  const status = new StatusHub();
  const saver = new Saver(store, { delayMs: 10_000 });
  const tags = new TagService(store, new TagIndex(), new MemoryIndexCache(), saver);
  const journal = new Journal(store, saver);
  const scan = await scanFolder(store);
  journal.setAvailableDays(scan.days.map((d) => d.day));
  await tags.loadSheets(scan);
  await buildIndex(store, scan, tags.index, new MemoryIndexCache());
  const days = await journal.readDays(loaded);
  let state = EditorState.create({ doc: buildDocument(days), extensions: segmentExtensions() });
  journal.attach(() => state);
  const dispatch = (spec: TransactionSpec | null): void => {
    if (spec) state = state.update(spec).state;
  };
  const onSheetChanged = vi.fn();
  const watcher = new ExternalWatcher({
    store,
    saver,
    journal,
    tags,
    status,
    dispatch,
    onSheetChanged,
    today: () => '2026-11-23',
  });
  return { store, saver, tags, journal, status, watcher, onSheetChanged, state: () => state };
}

const D22 = '2026/11/2026-11-22.md';
const D23 = '2026/11/2026-11-23.md';

describe('external changes', () => {
  it('reloads a day changed by another tool, in the editor and the index', async () => {
    const ctx = await setup({ [D22]: '## 10:00\nold\n', [D23]: '## 11:00\ntoday\n' }, ['2026-11-22', '2026-11-23']);
    ctx.store.externalWrite(D22, '## 10:00\nfrom another computer #synced\n');
    await ctx.watcher.check();
    expect(segmentContentOf(ctx.state(), '2026-11-22')).toBe('## 10:00\nfrom another computer #synced');
    expect(ctx.tags.index.get('2026-11-22')!.notes[0]!.tags).toEqual(['synced']);
    // A second check finds nothing new.
    const read = vi.spyOn(ctx.store, 'read');
    await ctx.watcher.check();
    expect(read).not.toHaveBeenCalled();
  });

  it('leaves a file with unsaved local edits to the saver', async () => {
    const ctx = await setup({ [D23]: '## 11:00\ntoday\n' }, ['2026-11-23']);
    ctx.saver.schedule(D23, () => '## 11:00\nlocal\n');
    ctx.store.externalWrite(D23, '## 11:00\nremote\n');
    await ctx.watcher.check();
    expect(segmentContentOf(ctx.state(), '2026-11-23')).toBe('## 11:00\ntoday');
    await ctx.saver.flush();
    const files = ctx.store.snapshot();
    expect(files[D23]).toBe('## 11:00\nlocal\n');
    expect(Object.values(files)).toContain('## 11:00\nremote\n');
  });

  it('shows a new day of the loaded range and indexes older ones', async () => {
    const ctx = await setup({ [D22]: '## 10:00\nx\n' }, ['2026-11-22']);
    ctx.store.externalWrite(D23, '## 08:00\nwritten elsewhere\n');
    ctx.store.externalWrite('2026/01/2026-01-05.md', '## 08:00\n#old\n');
    await ctx.watcher.check();
    expect(segmentContentOf(ctx.state(), '2026-11-23')).toBe('## 08:00\nwritten elsewhere');
    expect(segmentContentOf(ctx.state(), '2026-01-05')).toBeNull();
    expect(ctx.tags.index.get('2026-01-05')).toBeDefined();
    expect(ctx.journal.olderDays(5)).toEqual(['2026-01-05']);
  });

  it('reports conflict copies without touching them', async () => {
    const ctx = await setup({ [D22]: 'x\n', '2026/11/2026-11-22 (1).md': 'copy\n' }, ['2026-11-22']);
    await ctx.watcher.check();
    expect(ctx.status.get().messages).toEqual(['Conflict copy found: 2026/11/2026-11-22 (1).md']);
    expect(ctx.store.snapshot()['2026/11/2026-11-22 (1).md']).toBe('copy\n');
  });

  it('reloads tag sheets and their settings', async () => {
    const ctx = await setup({ [D22]: '#px\n', 'tags/project-x.md': 'Body\n' }, ['2026-11-22']);
    expect(ctx.tags.resolve('px')).toBe('px');
    ctx.store.externalWrite('tags/project-x.md', '---\naliases: [px]\n---\nBody\n');
    await ctx.watcher.check();
    expect(ctx.tags.resolve('px')).toBe('project-x');
    expect(ctx.onSheetChanged).toHaveBeenCalledWith('project-x');
  });
});
