import { EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { headingLevel, parseUnits, unitAtLine } from '../model/units';
import { pageAt, pageRanges } from './pageField';

export interface Scope {
  readonly from: number;
  readonly to: number;
}

/**
 * Successive scopes around the cursor: the paragraph, each section it is in (from the
 * innermost heading out to the page), then the whole document. Duplicates are skipped.
 */
export function selectionScopes(state: EditorState): Scope[] {
  const { doc } = state;
  const head = state.selection.main.from;
  const page = pageAt(state, head);
  const part = page ?? pageRanges(state).inbox;
  const lines = doc.sliceString(part.from, part.to).split('\n');
  const lineStarts: number[] = [];
  let offset = part.from;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const lineEnd = (index: number): number => lineStarts[index]! + lines[index]!.length;
  const trimmed = (from: number, to: number): Scope => ({
    from,
    to: from + doc.sliceString(from, to).trimEnd().length,
  });

  const cursorLine = Math.max(0, lineStarts.findLastIndex((start) => start <= head));
  const units = parseUnits(lines);
  const unit = unitAtLine(units, cursorLine);
  const scopes: Scope[] = [];
  if (unit?.kind === 'block') scopes.push(trimmed(lineStarts[unit.startLine]!, lineEnd(unit.endLine)));

  // Sections, innermost first: the heading the cursor is on (if any), then its parents.
  const headings = [...(unit?.headings ?? []), ...(unit?.kind === 'heading' ? [unit.startLine] : [])].reverse();
  for (const line of headings) {
    const level = headingLevel(lines[line]!);
    let end = lines.length - 1;
    for (let n = line + 1; n < lines.length; n++) {
      const other = headingLevel(lines[n]!);
      if (other > 0 && other <= level && units.some((u) => u.kind === 'heading' && u.startLine === n)) {
        end = n - 1;
        break;
      }
    }
    scopes.push(trimmed(lineStarts[line]!, lineEnd(end)));
  }
  scopes.push(trimmed(part.from, part.to));
  scopes.push({ from: 0, to: doc.length });

  return scopes.filter(
    (scope, index, all) =>
      scope.to > scope.from && all.findIndex((s) => s.from === scope.from && s.to === scope.to) === index,
  );
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

/** Ctrl+A selects the paragraph, then its section(s), then the page, then the whole document. */
export function selectNextScope(view: EditorView): boolean {
  const scope = nextScope(view.state);
  if (scope) view.dispatch({ selection: EditorSelection.range(scope.from, scope.to), userEvent: 'select' });
  return true;
}

export function progressiveSelectAll(): Extension {
  return Prec.high(keymap.of([{ key: 'Mod-a', run: selectNextScope, preventDefault: true }]));
}
