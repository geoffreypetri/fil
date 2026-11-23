import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { buildDocument, type DaySource } from '../model/segments';
import { dayWidgets } from './dayWidgets';
import { livePreview } from './livePreview';
import { newNoteExtensions } from './newNote';
import { segmentExtensions } from './segmentField';
import { editorTheme, journalLayout } from './theme';

export interface JournalEditorOptions {
  parent: HTMLElement;
  days: readonly DaySource[];
  onTransaction: (tr: Transaction) => void;
  extensions?: Extension;
}

/** Shared editing setup, also used by the tag sheet editor. */
export function baseEditing(compact = false): Extension {
  return [
    history(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    livePreview(),
    editorTheme(compact),
  ];
}

/** The single full-screen editor showing the whole journal. */
export function createJournalEditor(options: JournalEditorOptions): EditorView {
  const state = EditorState.create({
    doc: buildDocument(options.days),
    selection: { anchor: buildDocument(options.days).length },
    extensions: [
      segmentExtensions(),
      dayWidgets(),
      newNoteExtensions(),
      baseEditing(),
      journalLayout,
      EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Journal' }),
      options.extensions ?? [],
    ],
  });
  const view = new EditorView({
    state,
    parent: options.parent,
    dispatchTransactions: (transactions, editor) => {
      editor.update(transactions);
      for (const tr of transactions) options.onTransaction(tr);
    },
  });
  scrollToEnd(view);
  return view;
}

/** Places the cursor at the end of the journal and scrolls there. */
export function scrollToEnd(view: EditorView): void {
  const end = view.state.doc.length;
  view.dispatch({ selection: { anchor: end }, effects: EditorView.scrollIntoView(end, { y: 'end' }) });
  view.focus();
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
  });
}
