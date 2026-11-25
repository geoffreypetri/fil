import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { helperChange } from '../src/editor/helpers';
import { pagesField } from '../src/editor/pageField';
import { nextScope } from '../src/editor/selectScope';
import { buildDocument } from '../src/journal/pageSync';

const NOW = new Date(2026, 10, 25, 14, 52);

function apply(doc: string, id: Parameters<typeof helperChange>[1], cursor = doc.length, typed = 0): string {
  const state = EditorState.create({ doc });
  const change = helperChange(state, id, cursor - typed, cursor, NOW);
  return state.update({ changes: change, selection: { anchor: change.cursor } }).state.sliceDoc(0) + '|';
}

describe('writing helpers', () => {
  it('inserts the date and the time inline', () => {
    expect(apply('Meeting on ', 'date')).toBe('Meeting on 2026-11-25|');
    expect(apply('Call at /now', 'now', 12, 4)).toBe('Call at 14:52|');
  });

  it('starts headings and tasks on their own line', () => {
    expect(apply('/today', 'today', 6, 6)).toBe('# 2026-11-25\n|');
    expect(apply('text /note', 'note', 10, 5)).toBe('text \n## 14:52\n|');
    expect(apply('', 'todo')).toBe('- [ ] |');
    expect(apply('buy milk', 'todo')).toBe('buy milk\n- [ ] |');
  });
});

describe('progressive select all on pages', () => {
  const built = buildDocument('inbox line', [
    { name: 'Project', content: '# Project\nintro\n\n## Meeting\nfirst line\nsecond line\n\n## Other\nx' },
    { name: 'Next', content: '# Next\ny' },
  ]);
  const at = (text: string): EditorState => {
    const state = EditorState.create({ doc: built.doc, extensions: pagesField.init(() => built.pages) });
    return state.update({ selection: EditorSelection.cursor(built.doc.indexOf(text) + 2) }).state;
  };

  it('selects the paragraph, the section, the page, then everything', () => {
    let state = at('second line');
    const steps: string[] = [];
    for (let i = 0; i < 5; i++) {
      const scope = nextScope(state);
      if (!scope) {
        steps.push('end');
        break;
      }
      state = state.update({ selection: EditorSelection.range(scope.from, scope.to) }).state;
      steps.push(state.sliceDoc(scope.from, scope.to));
    }
    expect(steps).toEqual([
      'first line\nsecond line',
      '## Meeting\nfirst line\nsecond line',
      '# Project\nintro\n\n## Meeting\nfirst line\nsecond line\n\n## Other\nx',
      built.doc,
      'end',
    ]);
  });

  it('works in the inbox too', () => {
    const state = at('inbox line');
    expect(state.sliceDoc(nextScope(state)!.from, nextScope(state)!.to)).toBe('inbox line');
  });
});
