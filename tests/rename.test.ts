import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/fs/memoryStore';
import { TagIndex } from '../src/index/tagIndex';
import { indexPage } from '../src/model/pageIndex';
import { pageNameOf } from '../src/model/pages';
import { parseSheet } from '../src/model/frontmatter';
import {
  UndoConflictError,
  executeRename,
  isRenameProblem,
  previewRename,
  retagText,
  undoRename,
  type RenamePreview,
} from '../src/model/rename';
import { TagTable } from '../src/model/tagTable';

const D1 = 'Kick-off.md';
const D2 = 'Nothing.md';
const D3 = 'Follow-up.md';

function setup(files: Record<string, string>) {
  const store = new MemoryStore(files);
  const index = new TagIndex();
  for (const [path, text] of Object.entries(files)) {
    if (pageNameOf(path) !== null) index.set(indexPage(path, text, 1));
  }
  const sheets = Object.entries(files)
    .filter(([path]) => /^tags\/[^/]+\.md$/.test(path))
    .map(([path, text]) => ({
      name: path.slice(5, -3),
      path,
      lastModified: 1,
      settings: parseSheet(text).settings,
    }));
  return { store, index, table: new TagTable(sheets) };
}

function preview(from: string, to: string, ctx: ReturnType<typeof setup>): RenamePreview {
  const result = previewRename(from, to, ctx.table, ctx.index);
  if (isRenameProblem(result)) throw new Error(result.kind);
  return result;
}

const FILES = {
  [D1]: '## 09:00\n#old kick-off with #older and `#old` in code\n',
  [D2]: '## 10:00\nnothing\n',
  [D3]: '## 11:00\n#old follow-up, see https://x.org/#old\n```\n#old\n```\n',
  'tags/old.md': '---\ncolor: red\naliases: [o]\nextra: kept\n---\nOld body.\n',
};

describe('retag', () => {
  it('replaces whole tags only, outside code and URLs', () => {
    expect(retagText(FILES[D1]!, 'old', 'new')).toBe('## 09:00\n#new kick-off with #older and `#old` in code\n');
    expect(retagText(FILES[D3]!, 'old', 'new')).toBe(
      '## 11:00\n#new follow-up, see https://x.org/#old\n```\n#old\n```\n',
    );
  });
});

describe('rename preview', () => {
  it('counts notes and day files, and detects merges', () => {
    const ctx = setup({ ...FILES, [D2]: '## 10:00\n#new already\n' });
    expect(preview('old', '#New', ctx)).toEqual({
      from: 'old',
      to: 'new',
      notes: 2,
      paths: [D3, D1],
      hasSheet: true,
      merge: true,
    });
  });

  it('rejects invalid names and aliases of other tags', () => {
    const ctx = setup({ ...FILES, 'tags/other.md': '---\naliases: [taken]\n---\n' });
    expect(previewRename('old', '12', ctx.table, ctx.index)).toEqual({ kind: 'invalid' });
    expect(previewRename('old', 'old', ctx.table, ctx.index)).toEqual({ kind: 'same' });
    expect(previewRename('old', 'taken', ctx.table, ctx.index)).toEqual({ kind: 'aliasOfOther', owner: 'other' });
  });
});

describe('rename keeping the old name as alias', () => {
  it('only moves the sheet and adds the old name to the aliases', async () => {
    const ctx = setup(FILES);
    await executeRename(ctx.store, preview('old', 'new', ctx), 'alias');
    const files = ctx.store.snapshot();
    expect(files[D1]).toBe(FILES[D1]);
    expect(files['tags/old.md']).toBeUndefined();
    expect(files['tags/new.md']).toBe('---\ncolor: red\naliases: [o, old]\nextra: kept\n---\nOld body.\n');
  });

  it('creates a sheet holding the alias when there was none', async () => {
    const ctx = setup({ [D1]: FILES[D1]! });
    await executeRename(ctx.store, preview('old', 'new', ctx), 'alias');
    expect(ctx.store.snapshot()['tags/new.md']).toBe('---\naliases: [old]\n---\n');
  });
});

describe('rename everywhere', () => {
  it('retags pages and renames the sheet', async () => {
    const ctx = setup(FILES);
    const result = await executeRename(ctx.store, preview('old', 'new', ctx), 'everywhere');
    const files = ctx.store.snapshot();
    expect(files[D1]).toBe('## 09:00\n#new kick-off with #older and `#old` in code\n');
    expect(files[D2]).toBe(FILES[D2]);
    expect(files['tags/new.md']).toBe('---\ncolor: red\naliases: [o]\nextra: kept\n---\nOld body.\n');
    expect(result.changes.map((c) => c.path)).toEqual([D3, D1, 'tags/new.md', 'tags/old.md']);
  });

  it('rolls back every file when a write fails midway', async () => {
    const ctx = setup(FILES);
    const before = ctx.store.snapshot();
    ctx.store.failWrite = (path) => path === 'tags/new.md';
    await expect(executeRename(ctx.store, preview('old', 'new', ctx), 'everywhere')).rejects.toThrow();
    ctx.store.failWrite = null;
    expect(ctx.store.snapshot()).toEqual(before);
  });
});

describe('merge', () => {
  const TARGET = '---\ncolor: blue\nlabel: New tag\naliases: [n]\n---\nNew body.\n';

  it('merges aliases and bodies, keeps target color and label, never deletes', async () => {
    const ctx = setup({ ...FILES, 'tags/new.md': TARGET });
    await executeRename(ctx.store, preview('old', 'new', ctx), 'alias');
    const files = ctx.store.snapshot();
    expect(files['tags/new.md']).toBe(
      '---\ncolor: blue\nlabel: New tag\naliases: [n, o, old]\n---\nNew body.\n\n## Merged from #old\n\nOld body.\n',
    );
    expect(files['tags/old.md']).toBeUndefined();
    expect(files['tags/_merged/old.md']).toBe(FILES['tags/old.md']);
  });

  it('retags notes in "everywhere" mode without adding the old name as alias', async () => {
    const ctx = setup({ ...FILES, 'tags/new.md': TARGET });
    await executeRename(ctx.store, preview('old', 'new', ctx), 'everywhere');
    const files = ctx.store.snapshot();
    expect(files[D3]!.startsWith('## 11:00\n#new follow-up')).toBe(true);
    expect(parseSheet(files['tags/new.md']!).settings.aliases).toEqual(['n', 'o']);
  });

  it('keeps a second merged copy under a free name', async () => {
    const ctx = setup({ ...FILES, 'tags/new.md': TARGET, 'tags/_merged/old.md': 'earlier' });
    await executeRename(ctx.store, preview('old', 'new', ctx), 'alias');
    expect(ctx.store.snapshot()['tags/_merged/old-2.md']).toBe(FILES['tags/old.md']);
  });
});

describe('undo', () => {
  it('restores every file', async () => {
    const ctx = setup(FILES);
    const before = ctx.store.snapshot();
    const result = await executeRename(ctx.store, preview('old', 'new', ctx), 'everywhere');
    await undoRename(ctx.store, result);
    expect(ctx.store.snapshot()).toEqual(before);
  });

  it('refuses when a file changed since the rename', async () => {
    const ctx = setup(FILES);
    const result = await executeRename(ctx.store, preview('old', 'new', ctx), 'everywhere');
    ctx.store.externalWrite(D1, 'edited after rename');
    await expect(undoRename(ctx.store, result)).rejects.toBeInstanceOf(UndoConflictError);
    expect(ctx.store.snapshot()[D1]).toBe('edited after rename');
  });
});
