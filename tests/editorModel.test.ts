import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { clock, newNoteExtensions, newNoteSpec } from '../src/editor/newNote';
import { programmatic, segmentContentOf, segmentExtensions, segmentsOf } from '../src/editor/segmentField';
import { MemoryStore } from '../src/fs/memoryStore';
import { Journal } from '../src/journal/journal';
import { buildDocument, type DaySource } from '../src/model/segments';
import { Saver } from '../src/sync/saver';

const NOW = new Date(2026, 10, 23, 16, 10);

function makeState(days: DaySource[], cursor?: number): EditorState {
  const doc = buildDocument(days);
  return EditorState.create({
    doc,
    selection: { anchor: cursor ?? doc.length },
    extensions: [segmentExtensions(), newNoteExtensions(), clock.of(() => NOW)],
  });
}

const contents = (state: EditorState): Record<string, string | null> =>
  Object.fromEntries(segmentsOf(state).map((s) => [s.day, segmentContentOf(state, s.day)]));

const userEdit = (state: EditorState, spec: TransactionSpec): EditorState =>
  state.update({ ...spec, userEvent: 'input.type' }).state;

describe('sentinel protection', () => {
  const days = [
    { day: '2026-11-22', content: '## 10:00\nyesterday' },
    { day: '2026-11-23', content: '## 14:52\ntoday' },
  ];

  it('keeps day boundaries when a deletion spans two days', () => {
    const state = makeState(days);
    const from = state.doc.toString().indexOf('yesterday');
    const to = state.doc.toString().indexOf('today');
    const next = state.update({ changes: { from, to }, userEvent: 'delete' }).state;
    expect(contents(next)).toEqual({ '2026-11-22': '## 10:00\n', '2026-11-23': 'today' });
  });

  it('ignores typing inside a sentinel line', () => {
    const state = makeState(days);
    const pos = segmentsOf(state)[1]!.sentinelFrom + 3;
    const next = userEdit(state, { changes: { from: pos, insert: 'x' } });
    expect(next.doc.toString()).toBe(state.doc.toString());
  });

  it('cannot join a day with the previous one', () => {
    const state = makeState(days);
    const segment = segmentsOf(state)[1]!;
    const next = state.update({ changes: { from: segment.from - 1, to: segment.from }, userEvent: 'delete' }).state;
    expect(contents(next)).toEqual(contents(state));
  });

  it('keeps typing at the end of a day in that day', () => {
    const state = makeState(days);
    const end = segmentsOf(state)[0]!.to;
    const next = userEdit(state, { changes: { from: end, insert: '!' } });
    expect(contents(next)['2026-11-22']).toBe('## 10:00\nyesterday!');
  });
});

describe('new note', () => {
  it('does nothing on Enter unless the cursor is on an empty last line', () => {
    const state = makeState([{ day: '2026-11-23', content: '## 14:52\ntext' }]);
    expect(newNoteSpec(state, NOW, 'enter')).toBeNull();
  });

  it('starts a note after a blank line followed by Enter', () => {
    const state = makeState([{ day: '2026-11-23', content: '## 14:52\ntext\n' }]);
    const next = state.update(newNoteSpec(state, NOW, 'enter')!).state;
    expect(contents(next)['2026-11-23']).toBe('## 14:52\ntext\n\n## 16:10\n');
    expect(next.selection.main.head).toBe(next.doc.length);
  });

  it('starts a note from anywhere with Ctrl+Enter', () => {
    const state = makeState([{ day: '2026-11-23', content: '## 14:52\ntext' }], 3);
    const next = state.update(newNoteSpec(state, NOW, 'command')!).state;
    expect(contents(next)['2026-11-23']).toBe('## 14:52\ntext\n\n## 16:10\n');
  });

  it('opens a new day when the last day is not today', () => {
    const state = makeState([{ day: '2026-11-22', content: '## 10:00\nold\n\n' }]);
    const next = state.update(newNoteSpec(state, NOW, 'command')!).state;
    expect(contents(next)).toEqual({ '2026-11-22': '## 10:00\nold', '2026-11-23': '## 16:10\n' });
  });

  it('inserts the time stamp when typing in an empty today', () => {
    const state = makeState([
      { day: '2026-11-22', content: 'old' },
      { day: '2026-11-23', content: '' },
    ]);
    const next = userEdit(state, { changes: { from: state.doc.length, insert: 'H' }, selection: { anchor: state.doc.length + 1 } });
    expect(contents(next)['2026-11-23']).toBe('## 16:10\nH');
    expect(next.selection.main.head).toBe(next.doc.length);
  });
});

describe('journal saving', () => {
  it('writes only the files of the days that were edited', async () => {
    const store = new MemoryStore({
      '2026/11/2026-11-22.md': '## 10:00\nyesterday\n',
      '2026/11/2026-11-23.md': '## 14:52\ntoday\n',
    });
    const saver = new Saver(store, { delayMs: 0 });
    const journal = new Journal(store, saver);
    const days = await journal.readDays(['2026-11-22', '2026-11-23']);
    let state = makeState(days);
    journal.attach(() => state);

    const tr = state.update({ changes: { from: state.doc.length, insert: ' edited' }, userEvent: 'input.type' });
    state = tr.state;
    journal.handleTransaction(tr);
    await saver.flush();

    expect(store.snapshot()).toEqual({
      '2026/11/2026-11-22.md': '## 10:00\nyesterday\n',
      '2026/11/2026-11-23.md': '## 14:52\ntoday edited\n',
    });
  });

  it('creates the file of a new day and never writes empty days', async () => {
    const store = new MemoryStore({ '2026/11/2026-11-22.md': 'old\n' });
    const saver = new Saver(store, { delayMs: 0 });
    const journal = new Journal(store, saver);
    const days = [...(await journal.readDays(['2026-11-22'])), { day: '2026-11-23', content: '' }];
    let state = makeState(days);
    journal.attach(() => state);

    journal.scheduleSave('2026-11-23');
    await saver.flush();
    expect(Object.keys(store.snapshot())).toEqual(['2026/11/2026-11-22.md']);

    const tr = state.update(newNoteSpec(state, NOW, 'command')!);
    state = tr.state;
    journal.handleTransaction(tr);
    await saver.flush();
    expect(store.snapshot()['2026/11/2026-11-23.md']).toBe('## 16:10\n\n');
    expect(tr.annotation(programmatic)).toBe(true);
  });
});
