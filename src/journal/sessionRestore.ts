import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { pageAt, pageRanges } from '../editor/pageField';
import { INBOX_NAME, isInbox } from '../model/pages';

const KEY = 'fil.restore';
/** A snapshot older than this is ignored (it belongs to another session). */
const MAX_AGE_MS = 2 * 60_000;

/** A document position expressed relative to its page, so it survives a rebuilt document. */
export interface PageOffset {
  readonly page: string;
  readonly offset: number;
}

export interface SessionSnapshot {
  readonly savedAt: number;
  readonly anchor: PageOffset | null;
  readonly head: PageOffset | null;
  /** Top visible position and its distance from the top of the editor. */
  readonly scroll: (PageOffset & { readonly margin: number }) | null;
  readonly topic: readonly string[] | null;
}

export function toPageOffset(state: EditorState, pos: number): PageOffset | null {
  const range = pageAt(state, pos);
  if (range) return range.page.name ? { page: range.page.name, offset: pos - range.from } : null;
  return { page: INBOX_NAME, offset: pos };
}

export function fromPageOffset(state: EditorState, value: PageOffset | null): number | null {
  if (!value) return null;
  const { inbox, pages } = pageRanges(state);
  const range = isInbox(value.page)
    ? inbox
    : pages.find((r) => r.page.name?.toLocaleLowerCase() === value.page.toLocaleLowerCase());
  return range ? Math.min(range.from + value.offset, range.to) : null;
}

export function captureSession(view: EditorView, topic: readonly string[] | null): SessionSnapshot {
  const { state } = view;
  const top = view.lineBlockAtHeight(Math.max(0, view.scrollDOM.getBoundingClientRect().top - view.documentTop));
  const scroll = toPageOffset(state, top.from);
  return {
    savedAt: Date.now(),
    anchor: toPageOffset(state, state.selection.main.anchor),
    head: toPageOffset(state, state.selection.main.head),
    scroll: scroll ? { ...scroll, margin: Math.max(0, top.top + view.documentTop - view.scrollDOM.getBoundingClientRect().top) } : null,
    topic,
  };
}

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Without storage the app simply restarts at the end of the document.
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
  const anchor = fromPageOffset(state, snapshot.anchor);
  const head = fromPageOffset(state, snapshot.head) ?? anchor;
  const scroll = fromPageOffset(state, snapshot.scroll);
  view.dispatch({
    selection: anchor !== null ? { anchor, head: head ?? anchor } : undefined,
    effects:
      scroll !== null
        ? EditorView.scrollIntoView(scroll, { y: 'start', yMargin: snapshot.scroll?.margin ?? 0 })
        : undefined,
  });
  view.focus();
}
