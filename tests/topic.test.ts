import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { segmentExtensions } from '../src/editor/segmentField';
import { tagContext } from '../src/editor/tagContext';
import { topicBlocks } from '../src/editor/topicFilter';
import { MemoryStore } from '../src/fs/memoryStore';
import { setActionDone } from '../src/journal/actionToggle';
import { indexDay } from '../src/model/dayIndex';
import { buildDocument } from '../src/model/segments';
import { hashColor } from '../src/model/palette';
import { Saver } from '../src/sync/saver';

const canonical = (raw: string): string => (raw === 'px' ? 'project-x' : raw);

function stateOf(days: { day: string; content: string }[]): EditorState {
  return EditorState.create({
    doc: buildDocument(days),
    extensions: [
      segmentExtensions(),
      tagContext.of({ canonical, colorOf: hashColor, completions: () => [], openTag: () => undefined }),
    ],
  });
}

describe('topic blocks', () => {
  const state = stateOf([
    { day: '2026-11-21', content: '## 08:00\nnothing here' },
    { day: '2026-11-22', content: '## 09:00\n#px sync\n\n## 12:00\nlunch\n\n## 16:00\n#project-x and #fil' },
    { day: '2026-11-23', content: '' },
  ]);
  const describeBlocks = (tags: string[], revealed = new Set<number>()): string[] =>
    topicBlocks(state, tags, revealed).map(
      (b) => `${b.visible ? '+' : '-'} ${state.doc.sliceString(b.from, b.to).split('\n')[0]!.replace('￼', '@')}`,
    );

  it('hides notes without the tag and empty-looking days, resolving aliases', () => {
    expect(describeBlocks(['project-x'])).toEqual([
      '- @2026-11-21',
      '- ## 08:00',
      '+ @2026-11-22',
      '+ ## 09:00',
      '- ## 12:00',
      '+ ## 16:00',
      '+ @2026-11-23',
    ]);
  });

  it('combines tags with AND', () => {
    expect(describeBlocks(['project-x', 'fil']).filter((b) => b.startsWith('+'))).toEqual([
      '+ @2026-11-22',
      '+ ## 16:00',
      '+ @2026-11-23',
    ]);
  });

  it('reveals notes on demand', () => {
    const lunch = state.doc.toString().indexOf('## 12:00');
    expect(describeBlocks(['project-x'], new Set([lunch]))).toContain('+ ## 12:00');
  });

  it('covers the whole document with contiguous blocks', () => {
    const blocks = topicBlocks(state, ['project-x'], new Set());
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]!.from).toBe(blocks[i - 1]!.to + 1);
    expect(blocks.at(-1)!.to).toBe(state.doc.length);
  });
});

describe('checking an action from the topic view', () => {
  it('rewrites the line in a day file that is not loaded in the editor', async () => {
    const text = '## 10:00\n#project-x\n- [ ] first\n- [ ] second\n';
    const store = new MemoryStore({ '2026/10/2026-10-09.md': text });
    const saver = new Saver(store);
    saver.track('2026/10/2026-10-09.md', (await store.stat('2026/10/2026-10-09.md'))!.lastModified, text);
    const entry = indexDay('2026-10-09', text, 1);
    const ref = { day: '2026-10-09', action: entry.actions[1]!, time: '10:00' };
    expect(await setActionDone(ref, true, null, store, saver)).toBe(true);
    expect(store.snapshot()['2026/10/2026-10-09.md']).toBe('## 10:00\n#project-x\n- [ ] first\n- [x] second\n');
  });

  it('refuses when the action is gone', async () => {
    const store = new MemoryStore({ '2026/10/2026-10-09.md': '## 10:00\n- [ ] other\n' });
    const saver = new Saver(store);
    const ref = { day: '2026-10-09', action: { line: 1, done: false, text: 'removed', lineTags: [], note: 0 }, time: null };
    expect(await setActionDone(ref, true, null, store, saver)).toBe(false);
  });
});
