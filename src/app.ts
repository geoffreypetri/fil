import type { EditorView } from '@codemirror/view';
import { createJournalEditor } from './editor/journalEditor';
import type { FileStore } from './fs/store';
import { Journal } from './journal/journal';
import { scanFolder } from './model/folderScan';
import { dayKeyOf } from './model/paths';
import { Saver } from './sync/saver';
import { StatusHub } from './sync/status';
import { h } from './ui/dom';
import { mountStatusIndicator } from './ui/statusIndicator';
import './app.css';

export interface AppOptions {
  onChangeFolder: () => void;
}

export interface AppContext {
  readonly store: FileStore;
  readonly status: StatusHub;
  readonly saver: Saver;
  readonly journal: Journal;
  view: EditorView | null;
}

/** Mounts the application on an open notes folder. Returns a function that tears it down. */
export function startApp(root: HTMLElement, store: FileStore, options: AppOptions): () => void {
  const status = new StatusHub();
  const saver = new Saver(store, {
    onState: (state, error) => status.set('saver', state, error ? [error] : []),
  });
  const journal = new Journal(store, saver);
  const context: AppContext = { store, status, saver, journal, view: null };

  const editorHost = h('div', { class: 'app__editor' });
  const shell = h('div', { class: 'app' }, editorHost);
  root.replaceChildren(shell);
  const disposers: (() => void)[] = [mountStatusIndicator(shell, status)];

  const flush = (): void => void saver.flush();
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  disposers.push(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  });

  void (async () => {
    const scan = await scanFolder(store);
    const days = await journal.initialDays(scan, dayKeyOf(new Date()));
    const view = createJournalEditor({
      parent: editorHost,
      days,
      onTransaction: (tr) => journal.handleTransaction(tr),
    });
    journal.attach(() => view.state);
    context.view = view;
    disposers.push(() => view.destroy());
  })().catch((error: unknown) => {
    status.set('load', 'error', [error instanceof Error ? error.message : String(error)]);
  });

  void options;
  return () => {
    flush();
    for (const dispose of disposers.reverse()) dispose();
    root.replaceChildren();
  };
}
