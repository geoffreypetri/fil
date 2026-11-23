import {
  Annotation,
  EditorSelection,
  EditorState,
  StateField,
  type ChangeSpec,
  type Extension,
  type Text,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DayKey } from '../model/paths';
import { SENTINEL, findSegments, type Segment } from '../model/segments';

/**
 * Marks transactions made by the app itself (loading days, reloading external changes).
 * They bypass sentinel protection and are not written back to disk.
 */
export const programmatic = Annotation.define<boolean>();

/** Marks transactions that mirror the disk (initial load, external reloads): nothing to save. */
export const fromDisk = Annotation.define<boolean>();

interface Sentinel {
  readonly day: DayKey;
  readonly pos: number;
}

function scanSentinels(doc: Text): Sentinel[] {
  return findSegments(doc.toString()).map((s) => ({ day: s.day, pos: s.sentinelFrom }));
}

/** Positions of the day sentinel lines, kept in sync with the document. */
export const sentinelField = StateField.define<readonly Sentinel[]>({
  create: (state) => scanSentinels(state.doc),
  update(sentinels, tr) {
    if (!tr.docChanged) return sentinels;
    // User edits never touch sentinel lines (see protectSentinels), so mapping is exact.
    if (!tr.annotation(programmatic)) {
      return sentinels.map((s) => ({ day: s.day, pos: tr.changes.mapPos(s.pos, 1) }));
    }
    return scanSentinels(tr.state.doc);
  },
});

/** All day segments of the current document. */
export function segmentsOf(state: EditorState): Segment[] {
  const sentinels = state.field(sentinelField);
  const { doc } = state;
  return sentinels.map((sentinel, index) => {
    const line = doc.lineAt(sentinel.pos);
    const next = sentinels[index + 1];
    return {
      day: sentinel.day,
      sentinelFrom: sentinel.pos,
      from: Math.min(line.to + 1, doc.length),
      to: next ? next.pos - 1 : doc.length,
    };
  });
}

export function segmentOfDay(state: EditorState, day: DayKey): Segment | undefined {
  return segmentsOf(state).find((segment) => segment.day === day);
}

export function segmentContentOf(state: EditorState, day: DayKey): string | null {
  const segment = segmentOfDay(state, day);
  return segment ? state.doc.sliceString(segment.from, segment.to) : null;
}

/** Ranges of the document that user edits may not touch: each sentinel line and its line breaks. */
function protectedRanges(state: EditorState): { from: number; to: number; lineEnd: number; start: number }[] {
  return state.field(sentinelField).map((sentinel) => {
    const line = state.doc.lineAt(sentinel.pos);
    return {
      start: line.from,
      lineEnd: line.to,
      from: Math.max(line.from - 1, 0),
      to: Math.min(line.to + 1, state.doc.length),
    };
  });
}

/**
 * Removes the parts of user changes that would touch a sentinel line. Insertions inside a
 * sentinel line are dropped; deletions spanning one keep only their unprotected parts.
 */
function filterProtected(tr: Transaction): Transaction | TransactionSpec {
  if (!tr.docChanged || tr.annotation(programmatic)) return tr;
  const ranges = protectedRanges(tr.startState);
  if (ranges.length === 0) return tr;

  let touched = false;
  const kept: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    let pieces = [{ from: fromA, to: toA }];
    for (const range of ranges) {
      if (fromA === toA) {
        if (fromA >= range.start && fromA <= range.lineEnd) {
          pieces = [];
          touched = true;
        }
        continue;
      }
      const next: { from: number; to: number }[] = [];
      for (const piece of pieces) {
        if (piece.to <= range.from || piece.from >= range.to) {
          next.push(piece);
          continue;
        }
        touched = true;
        if (piece.from < range.from) next.push({ from: piece.from, to: range.from });
        if (piece.to > range.to) next.push({ from: range.to, to: piece.to });
      }
      pieces = next;
    }
    pieces.forEach((piece, index) => {
      kept.push({ from: piece.from, to: piece.to, insert: index === 0 ? inserted.toString() : '' });
    });
  });
  if (!touched) return tr;
  if (kept.length === 0) return {};

  const changes = tr.startState.changes(kept);
  const last = kept[kept.length - 1] as { from: number; insert: string };
  const cursor = changes.mapPos(last.from, 1);
  return {
    changes,
    selection: EditorSelection.cursor(Math.min(cursor, changes.newLength)),
    userEvent: tr.annotation(Transaction.userEvent) ?? undefined,
    scrollIntoView: tr.scrollIntoView,
  };
}

const SENTINEL_LINE = new RegExp(`^${SENTINEL}.*(\\n|$)`, 'gm');

export function segmentExtensions(): Extension {
  return [
    sentinelField,
    EditorState.transactionFilter.of(filterProtected),
    EditorView.clipboardOutputFilter.of((text) => text.replace(SENTINEL_LINE, '')),
    EditorView.clipboardInputFilter.of((text) => text.replaceAll(SENTINEL, '')),
  ];
}
