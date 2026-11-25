import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagesField, pageRanges } from '../src/editor/pageField';
import { MemoryStore } from '../src/fs/memoryStore';
import { PageSync, buildDocument } from '../src/journal/pageSync';
import { scanFolder } from '../src/model/folderScan';
import { parseIndex } from '../src/model/pages';
import { Saver } from '../src/sync/saver';

const NOW = new Date(2026, 10, 25, 19, 42, 5);

/** A minimal editor: state + dispatch wired to PageSync, like the app does. */
async function setup(files: Record<string, string>, count?: number) {
  const store = new MemoryStore(files);
  const saver = new Saver(store, { delayMs: 0 });
  const sync = new PageSync(store, saver, { delayMs: 10, now: () => NOW });
  const initial = await sync.load(await scanFolder(store), count);
  const editor = {
    state: EditorState.create({ doc: initial.doc, extensions: pagesField.init(() => initial.pages) }),
    hasFocus: false,
    dispatch(...specs: TransactionSpec[]) {
      const tr = this.state.update(...specs);
      this.state = tr.state;
      sync.handleTransaction(tr);
    },
  };
  sync.attach(() => editor as never);
  const type = (from: number, insert: string, to = from): void =>
    editor.dispatch({ changes: { from, to, insert }, userEvent: 'input.type' });
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(50);
    await sync.flush();
  };
  const doc = (): string => editor.state.doc.toString();
  return { store, sync, editor, type, settle, doc };
}

describe('pages', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the inbox and the pages in index order', async () => {
    const ctx = await setup({
      'index.md': '- [[Inbox]]\n- [[B]]\n- [[A]]\n',
      'A.md': '# A\nalpha\n',
      'B.md': '# B\nbeta\n',
      'Inbox.md': 'loose\n',
    });
    expect(ctx.doc()).toBe('loose\n# B\nbeta\n# A\nalpha');
    expect(ctx.editor.state.field(pagesField).map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('writes only the page that was edited', async () => {
    const ctx = await setup({ 'A.md': '# A\nalpha\n', 'B.md': '# B\nbeta\n' });
    const write = vi.spyOn(ctx.store, 'write');
    ctx.type(ctx.doc().length, '!');
    await ctx.settle();
    expect(ctx.store.snapshot()['B.md']).toBe('# B\nbeta!\n');
    expect(write.mock.calls.map((c) => c[0])).not.toContain('A.md');
  });

  it('creates a file for a new heading and records it in index.md', async () => {
    const ctx = await setup({ 'A.md': '# A\nalpha\n' });
    ctx.type(ctx.doc().length, '\n# 2026-11-25\nfirst note #fil');
    await ctx.settle();
    const files = ctx.store.snapshot();
    expect(files['A.md']).toBe('# A\nalpha\n');
    expect(files['2026-11-25.md']).toBe('# 2026-11-25\nfirst note #fil\n');
    expect(parseIndex(files['index.md']!)).toEqual(['A', '2026-11-25']);
  });

  it('splits a page when a heading is typed in its middle', async () => {
    const ctx = await setup({ 'A.md': '# A\none\ntwo\n' });
    const at = ctx.doc().indexOf('two');
    ctx.type(at, '# B\n');
    await ctx.settle();
    expect(ctx.store.snapshot()['A.md']).toBe('# A\none\n');
    expect(ctx.store.snapshot()['B.md']).toBe('# B\ntwo\n');
  });

  it('renames the file when the title changes, once the cursor leaves the title', async () => {
    const ctx = await setup({ 'Draft.md': '# Draft\nbody\n' });
    ctx.editor.hasFocus = true;
    ctx.editor.dispatch({ changes: { from: 2, to: 7, insert: 'Final plan' }, selection: EditorSelection.cursor(12), userEvent: 'input.type' });
    await vi.advanceTimersByTimeAsync(50);
    expect(Object.keys(ctx.store.snapshot())).toContain('Draft.md');
    ctx.editor.dispatch({ selection: EditorSelection.cursor(ctx.doc().length) });
    await ctx.settle();
    const files = ctx.store.snapshot();
    expect(files['Draft.md']).toBeUndefined();
    expect(files['Final plan.md']).toBe('# Final plan\nbody\n');
    expect(parseIndex(files['index.md']!)).toEqual(['Final plan']);
  });

  it('keeps duplicate titles apart and ignores case-only changes', async () => {
    const ctx = await setup({ 'Notes.md': '# Notes\na\n' });
    ctx.type(ctx.doc().length, '\n# Notes\nb');
    await ctx.settle();
    expect(ctx.store.snapshot()['Notes 2.md']).toBe('# Notes\nb\n');
    ctx.type(2, 'n', 3);
    await ctx.settle();
    expect(ctx.store.snapshot()['Notes.md']).toBe('# notes\na\n');
  });

  it('sends the file of a deleted heading to the trash and merges its text into the previous page', async () => {
    const ctx = await setup({ 'A.md': '# A\nalpha\n', 'B.md': '# B\nbeta\n', 'index.md': '- [[A]]\n- [[B]]\n' });
    const titleB = ctx.doc().indexOf('# B');
    ctx.type(titleB, '', titleB + 4);
    await ctx.settle();
    const files = ctx.store.snapshot();
    expect(files['B.md']).toBeUndefined();
    expect(files['A.md']).toBe('# A\nalpha\nbeta\n');
    expect(files['.fil/trash/B 2026-11-25 194205.md']).toBe('# B\nbeta\n');
    expect(parseIndex(files['index.md']!)).toEqual(['A']);
  });

  it('keeps text above the first heading in Inbox.md', async () => {
    const ctx = await setup({ 'A.md': '# A\nalpha\n' });
    ctx.editor.dispatch({ changes: { from: 0, insert: 'quick thought\n' }, userEvent: 'input.type' });
    await ctx.settle();
    const files = ctx.store.snapshot();
    expect(files['Inbox.md']).toBe('quick thought\n');
    expect(files['A.md']).toBe('# A\nalpha\n');
    expect(parseIndex(files['index.md']!)).toEqual(['Inbox', 'A']);
  });

  it('does not treat a heading inside a code block as a page', async () => {
    const ctx = await setup({ 'A.md': '# A\n```\nx\n```\n' });
    const inside = ctx.doc().indexOf('x');
    ctx.type(inside, '# not a page\n');
    await ctx.settle();
    expect(Object.keys(ctx.store.snapshot())).toEqual(['A.md']);
  });

  it('loads earlier pages before the first one, after the inbox', async () => {
    const files: Record<string, string> = { 'Inbox.md': 'in\n' };
    const names = ['P1', 'P2', 'P3', 'P4'];
    for (const name of names) files[`${name}.md`] = `# ${name}\n`;
    files['index.md'] = names.map((n) => `- [[${n}]]`).join('\n');
    const ctx = await setup(files, 2);
    expect(ctx.doc()).toBe('in\n# P3\n# P4');
    expect(ctx.sync.olderNames(5)).toEqual(['P1', 'P2']);
    ctx.editor.dispatch(ctx.sync.insertBeforeSpec(await ctx.sync.readPages(['P1', 'P2']))!);
    expect(ctx.doc()).toBe('in\n# P1\n# P2\n# P3\n# P4');
    expect(pageRanges(ctx.editor.state).pages.map((r) => r.page.name)).toEqual(names);
    await ctx.settle();
    expect(ctx.store.snapshot()['P1.md']).toBe('# P1\n');
  });

  it('shows a file without heading under its file name', async () => {
    const ctx = await setup({ 'Loose.md': 'just text\n' });
    expect(ctx.doc()).toBe('# Loose\njust text');
  });
});

describe('document building', () => {
  it('starts with the inbox when there is one', () => {
    expect(buildDocument('', [{ name: 'A', content: '# A' }])).toMatchObject({ doc: '# A', pages: [{ name: 'A', from: 0 }] });
    expect(buildDocument('x', [{ name: 'A', content: '# A' }])).toMatchObject({ doc: 'x\n# A', pages: [{ name: 'A', from: 2 }] });
    expect(buildDocument('', []).doc).toBe('');
  });
});
