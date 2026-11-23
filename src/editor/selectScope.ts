import { EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { parseNotes, parseTimeHeader } from '../model/dayParser';
import { segmentsOf } from './segmentField';

export interface Scope {
  readonly from: number;
  readonly to: number;
}

/** Shrinks a range so it does not end on blank lines. */
function trimEnd(state: EditorState, from: number, to: number): number {
  const text = state.doc.sliceString(from, to);
  return from + text.trimEnd().length;
}

/**
 * Successive scopes around the cursor: the note (without its time stamp), the day, then the
 * whole journal. Empty scopes are skipped.
 */
export function selectionScopes(state: EditorState): Scope[] {
  const { main } = state.selection;
  const segments = segmentsOf(state);
  const segment = segments.find((s) => s.from <= main.from && main.from <= s.to) ?? segments.at(-1);
  const scopes: Scope[] = [];

  if (segment) {
    const lines = state.doc.sliceString(segment.from, segment.to).split('\n');
    const lineStarts: number[] = [];
    let offset = segment.from;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }
    const cursorLine = lineStarts.findLastIndex((start) => start <= main.from);
    const note = parseNotes(lines).find((n) => n.startLine <= cursorLine && cursorLine <= n.endLine);
    if (note) {
      const bodyLine = parseTimeHeader(lines[note.startLine]!) !== null ? note.startLine + 1 : note.startLine;
      if (bodyLine <= note.endLine) {
        const from = lineStarts[bodyLine]!;
        const end = lineStarts[note.endLine]! + lines[note.endLine]!.length;
        scopes.push({ from, to: trimEnd(state, from, end) });
      }
    }
    scopes.push({ from: segment.from, to: trimEnd(state, segment.from, segment.to) });
  }
  const first = segments[0];
  scopes.push({ from: first ? first.from : 0, to: state.doc.length });

  // A scope that only adds hidden time stamps looks the same on screen: keep the larger one.
  const visible = (scope: Scope): string =>
    state.doc
      .sliceString(scope.from, scope.to)
      .split('\n')
      .filter((line) => parseTimeHeader(line) === null)
      .join('\n');
  return scopes
    .filter((scope) => scope.to > scope.from)
    .filter((scope, index, all) => {
      const next = all[index + 1];
      return !next || visible(next) !== visible(scope);
    });
}

/** The next scope strictly larger than the current selection, or null when everything is selected. */
export function nextScope(state: EditorState): Scope | null {
  const { main } = state.selection;
  for (const scope of selectionScopes(state)) {
    const covers = scope.from <= main.from && scope.to >= main.to;
    const larger = scope.from < main.from || scope.to > main.to;
    if (covers && larger) return scope;
  }
  return null;
}

/** Ctrl+A selects the current note, then the day, then the whole journal. */
export function selectNextScope(view: EditorView): boolean {
  const scope = nextScope(view.state);
  if (scope) view.dispatch({ selection: EditorSelection.range(scope.from, scope.to), userEvent: 'select' });
  return true;
}

export function progressiveSelectAll(): Extension {
  return Prec.high(keymap.of([{ key: 'Mod-a', run: selectNextScope, preventDefault: true }]));
}
