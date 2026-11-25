import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { segmentsOf } from '../editor/segmentField';
import type { DayKey } from '../model/paths';

const KEY = 'fil.restore';
/** A snapshot older than this is ignored (it belongs to another session). */
const MAX_AGE_MS = 2 * 60_000;

/** A document position expressed relative to its day, so it survives a rebuilt document. */
export interface DayOffset {
  readonly day: DayKey;
  readonly offset: number;
}

export interface SessionSnapshot {
  readonly savedAt: number;
  readonly anchor: DayOffset | null;
  readonly head: DayOffset | null;
  /** Top visible position and its distance from the top of the editor. */
  readonly scroll: (DayOffset & { readonly margin: number }) | null;
  readonly topic: readonly string[] | null;
}

export function toDayOffset(state: EditorState, pos: number): DayOffset | null {
  const segment = segmentsOf(state).find((s) => s.sentinelFrom <= pos && pos <= s.to);
  return segment ? { day: segment.day, offset: Math.max(0, pos - segment.from) } : null;
}

export function fromDayOffset(state: EditorState, value: DayOffset | null): number | null {
  if (!value) return null;
  const segment = segmentsOf(state).find((s) => s.day === value.day);
  return segment ? Math.min(segment.from + value.offset, segment.to) : null;
}

export function captureSession(view: EditorView, topic: readonly string[] | null): SessionSnapshot {
  const { state } = view;
  const top = view.lineBlockAtHeight(Math.max(0, view.scrollDOM.getBoundingClientRect().top - view.documentTop));
  const scroll = toDayOffset(state, top.from);
  return {
    savedAt: Date.now(),
    anchor: toDayOffset(state, state.selection.main.anchor),
    head: toDayOffset(state, state.selection.main.head),
    scroll: scroll ? { ...scroll, margin: Math.max(0, top.top + view.documentTop - view.scrollDOM.getBoundingClientRect().top) } : null,
    topic,
  };
}

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Without storage the app simply restarts at the end of the journal.
  }
}

/** Returns the snapshot saved just before an update reload, once. */
export function takeSession(now = Date.now()): SessionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as SessionSnapshot;
    return now - snapshot.savedAt <= MAX_AGE_MS ? snapshot : null;
  } catch {
    return null;
  }
}

/** Puts the cursor and the scroll position back where they were. */
export function applySession(view: EditorView, snapshot: SessionSnapshot): void {
  const { state } = view;
  const anchor = fromDayOffset(state, snapshot.anchor);
  const head = fromDayOffset(state, snapshot.head) ?? anchor;
  const scroll = fromDayOffset(state, snapshot.scroll);
  view.dispatch({
    selection: anchor !== null ? { anchor, head: head ?? anchor } : undefined,
    effects:
      scroll !== null
        ? EditorView.scrollIntoView(scroll, { y: 'start', yMargin: snapshot.scroll?.margin ?? 0 })
        : undefined,
  });
  view.focus();
}
