import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** Layout and colors come from CSS variables so light and dark themes share one definition. */
const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: '16px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-text)',
    lineHeight: '1.65',
    overflowAnchor: 'none',
  },
  '.cm-content': {
    maxWidth: 'var(--column-width)',
    margin: '0 auto',
    padding: '20vh 32px 40vh',
    caretColor: 'var(--fg)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--selection) !important' },
  '.cm-day-separator': {
    margin: '48px 0 12px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    userSelect: 'none',
  },
  '.cm-note-header': { paddingTop: '14px !important' },
  '.cm-note-time': {
    color: 'var(--fg-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    userSelect: 'none',
  },
});

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.5em', fontWeight: '600' },
  { tag: tags.heading2, fontSize: '1.3em', fontWeight: '600' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: tags.quote, color: 'var(--fg-muted)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--fg-faint)' },
]);

export function editorTheme(): Extension {
  return [baseTheme, syntaxHighlighting(markdownHighlight)];
}
