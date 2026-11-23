import {
  EditorState,
  Facet,
  Prec,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { dayKeyOf, timeOf } from '../model/paths';
import { sentinelLine } from '../model/segments';
import { programmatic, segmentsOf } from './segmentField';

/** Clock used for time stamps; replaceable in tests. */
export const clock = Facet.define<() => Date, () => Date>({
  combine: (values) => values[0] ?? (() => new Date()),
});

export type NewNoteTrigger = 'enter' | 'command';

/**
 * Builds the transaction that starts a new note at the end of the document:
 * - "enter": only when the cursor is on an empty last line (a blank line followed by Enter);
 * - "command" (Ctrl+Enter): from anywhere.
 * A new day segment is appended when the last segment is not today.
 */
export function newNoteSpec(state: EditorState, now: Date, trigger: NewNoteTrigger): TransactionSpec | null {
  const docEnd = state.doc.length;
  const segments = segmentsOf(state);
  const last = segments[segments.length - 1];

  if (trigger === 'enter') {
    const { main } = state.selection;
    if (state.selection.ranges.length > 1 || !main.empty || main.head !== docEnd) return null;
    if (state.doc.lineAt(docEnd).text.trim() !== '') return null;
    if (!last || last.from > docEnd) return null;
  }

  const header = `## ${timeOf(now)}`;
  const today = dayKeyOf(now);
  let from: number;
  let insert: string;

  if (last && last.day === today) {
    const content = state.doc.sliceString(last.from, last.to);
    const trimmedEnd = last.from + content.trimEnd().length;
    from = trimmedEnd;
    insert = trimmedEnd === last.from ? `${header}\n` : `\n\n${header}\n`;
  } else if (last) {
    const content = state.doc.sliceString(last.from, last.to);
    from = last.from + content.trimEnd().length;
    insert = `\n${sentinelLine(today)}\n${header}\n`;
  } else {
    from = 0;
    insert = `${sentinelLine(today)}\n${header}\n`;
  }

  return {
    changes: { from, to: docEnd, insert },
    selection: { anchor: from + insert.length },
    annotations: programmatic.of(true),
    userEvent: 'input.newnote',
    scrollIntoView: true,
  };
}

export function insertNewNote(view: EditorView, trigger: NewNoteTrigger): boolean {
  const spec = newNoteSpec(view.state, view.state.facet(clock)(), trigger);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

/**
 * Typing into today's empty segment starts a note: its time stamp is inserted first.
 */
const autoTimestamp = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(programmatic) || !(tr.isUserEvent('input') || tr.isUserEvent('paste'))) {
    return tr;
  }
  const now = tr.startState.facet(clock)();
  const today = dayKeyOf(now);
  const segment = segmentsOf(tr.startState).find((s) => s.day === today);
  if (!segment || tr.startState.doc.sliceString(segment.from, segment.to).trim() !== '') return tr;

  let typedInside = false;
  let startsWithHeader = false;
  tr.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
    if (fromA >= segment.from && fromA <= segment.to && inserted.length > 0) {
      typedInside = true;
      startsWithHeader = inserted.toString().startsWith('## ');
    }
  });
  if (!typedInside || startsWithHeader) return tr;
  return [tr, { changes: { from: segment.from, insert: `## ${timeOf(now)}\n` }, sequential: true }];
});

export function newNoteExtensions(): Extension {
  return [
    autoTimestamp,
    Prec.high(
      keymap.of([
        { key: 'Enter', run: (view) => insertNewNote(view, 'enter') },
        { key: 'Mod-Enter', run: (view) => insertNewNote(view, 'command'), preventDefault: true },
      ]),
    ),
  ];
}
