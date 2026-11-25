import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { pagesField } from '../src/editor/pageField';
import { tagContext } from '../src/editor/tagContext';
import { topicBlocks } from '../src/editor/topicFilter';
import { MemoryStore } from '../src/fs/memoryStore';
import { setActionDone } from '../src/journal/actionToggle';
import { buildDocument } from '../src/journal/pageSync';
import { indexPage } from '../src/model/pageIndex';
import { hashColor } from '../src/model/palette';
import { Saver } from '../src/sync/saver';

const canonical = (raw: string): string => (raw === 'px' ? 'project-x' : raw);

function stateOf(inbox: string, pages: { name: string; content: string }[]): EditorState {
  const built = buildDocument(inbox, pages);
  return EditorState.create({
    doc: built.doc,
    extensions: [
      pagesField.init(() => built.pages),
      tagContext.of({ canonical, colorOf: hashColor, completions: () => [], openTag: () => undefined }),
    ],
  });
}

describe('topic blocks', () => {
  const state = stateOf('loose idea', [
    { name: 'Monday', content: '# Monday\nnothing here' },
    {
      name: 'Project',
      content: '# Project\n#px sync notes\n\nlunch\n\n## Decisions #project-x\nscope frozen\n\n### Details\nbudget ok\n\n## Other\n#fil only',
    },
    { name: 'Last', content: '# Last\nend' },
  ]);
  const show = (tags: string[], revealed = new Set<number>()): string[] =>
    topicBlocks(state, tags, revealed)
      .filter((b) => b.visible)
      .map((b) => state.doc.sliceString(b.from, b.to).split('\n')[0]!);

  it('shows tagged paragraphs, tagged sections with their sub-sections, and their headings', () => {
    expect(show(['project-x'])).toEqual(['# Project', '#px sync notes', '## Decisions #project-x', 'scope frozen', '### Details', 'budget ok', 'end']);
  });

  it('combines tags with AND', () => {
    expect(show(['project-x', 'fil'])).toEqual(['end']);
  });

  it('reveals notes on demand', () => {
    const lunch = state.doc.toString().indexOf('lunch');
    expect(show(['project-x'], new Set([lunch]))).toContain('lunch');
  });

  it('covers the whole document with contiguous blocks', () => {
    const blocks = topicBlocks(state, ['project-x'], new Set());
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]!.from).toBe(blocks[i - 1]!.to + 1);
    expect(blocks[0]!.from).toBe(0);
    expect(blocks.at(-1)!.to).toBe(state.doc.length);
  });
});

describe('checking an action from the topic view', () => {
  it('rewrites the line in a page that is not in the editor', async () => {
    const text = '# Plan #project-x\n- [ ] first\n- [ ] second\n';
    const store = new MemoryStore({ 'Plan.md': text });
    const saver = new Saver(store);
    saver.track('Plan.md', (await store.stat('Plan.md'))!.lastModified, text);
    const entry = indexPage('Plan.md', text, 1);
    expect(await setActionDone({ path: 'Plan.md', action: entry.actions[1]! }, true, null, store, saver)).toBe(true);
    expect(store.snapshot()['Plan.md']).toBe('# Plan #project-x\n- [ ] first\n- [x] second\n');
  });

  it('refuses when the action is gone', async () => {
    const store = new MemoryStore({ 'Plan.md': '# Plan\n- [ ] other\n' });
    const saver = new Saver(store);
    const ref = { path: 'Plan.md', action: { line: 1, done: false, text: 'removed', tags: [] } };
    expect(await setActionDone(ref, true, null, store, saver)).toBe(false);
  });
});
