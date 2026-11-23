import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** Layout and colors come from CSS variables so light and dark themes share one definition. */
const baseTheme = EditorView.theme({
  '&': {
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: '16px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-text)',
    lineHeight: '1.65',
  },
  '.cm-content': { caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0' },
  // Native selection: it highlights the text itself, not full-width blocks.
  '.cm-content ::selection, .cm-content::selection': { backgroundColor: 'var(--selection)' },
  '.cm-day-separator': {
    padding: '48px 0 12px',
  },
  '.cm-day-separator__label': {
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    userSelect: 'none',
  },
  // First line of a note: its time sits in the left column, outside the text.
  '.cm-line.cm-note-start': { position: 'relative', paddingTop: '14px' },
  '.cm-line.cm-note-start::before': {
    content: 'attr(data-time)',
    position: 'absolute',
    top: '14px',
    left: '-64px',
    width: '48px',
    textAlign: 'right',
    color: 'var(--fg-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    fontWeight: '400',
    fontStyle: 'normal',
    lineHeight: 'calc(16px * 1.65)',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  '.cm-link-text': { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-tag': {
    color: 'var(--tag-fg)',
    backgroundColor: 'var(--tag-bg)',
    borderRadius: '4px',
    padding: '1px 3px',
    cursor: 'pointer',
  },
  '.cm-task-box': {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'baseline',
  },
  '.cm-task-box input': {
    margin: '0 2px 0 0',
    width: '14px',
    height: '14px',
    accentColor: 'var(--fg-muted)',
    cursor: 'pointer',
    position: 'relative',
    top: '2px',
  },
  '.cm-task-done': { color: 'var(--fg-muted)' },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg)',
    boxShadow: '0 6px 24px rgb(0 0 0 / 12%)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-text)',
    maxHeight: '16em',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--surface)',
    color: 'var(--fg)',
  },
  '.cm-completionDetail': { color: 'var(--fg-faint)', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-hidden-notes': {
    padding: '2px 0',
    color: 'var(--fg-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-hidden-notes:hover': { color: 'var(--accent)' },
  '.cm-hidden-notes--empty': { height: '0', padding: '0' },
  '.cm-note-time': {
    color: 'var(--fg-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    userSelect: 'none',
  },
});

const highlight = (headingSizes: readonly [string, string, string]): HighlightStyle =>
  HighlightStyle.define([
    { tag: tags.heading1, fontSize: headingSizes[0], fontWeight: '600' },
    { tag: tags.heading2, fontSize: headingSizes[1], fontWeight: '600' },
    { tag: tags.heading3, fontSize: headingSizes[2], fontWeight: '600' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
    { tag: tags.strong, fontWeight: '600' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.link, tags.url], color: 'var(--accent)' },
    { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
    { tag: tags.quote, color: 'var(--fg-muted)' },
    { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--fg-faint)' },
  ]);

const journalHighlight = highlight(['1.5em', '1.3em', '1.15em']);
/** Tag sheets are short reference cards: headings stay close to the text size. */
const compactHighlight = highlight(['1.15em', '1.05em', '1em']);

/** Layout of the full-screen journal: centered column, generous margins. */
export const journalLayout = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflowAnchor: 'none' },
  '.cm-content': {
    maxWidth: 'calc(var(--column-width) + 128px)',
    margin: '0 auto',
    // The left padding holds the time column; the right one keeps the text centered.
    padding: '20vh 96px 40vh',
  },
});

export function editorTheme(compact = false): Extension {
  return [baseTheme, syntaxHighlighting(compact ? compactHighlight : journalHighlight)];
}
