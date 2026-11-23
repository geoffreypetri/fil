import type { EditorView } from '@codemirror/view';
import { checkboxes } from './editor/checkboxes';
import { createJournalEditor } from './editor/journalEditor';
import { tagAutocomplete } from './editor/tagAutocomplete';
import { refreshTags, tagContext } from './editor/tagContext';
import { tagDecorations } from './editor/tagDecorations';
import type { FileStore } from './fs/store';
import { IdbIndexCache } from './index/cache';
import { buildIndex } from './index/indexBuilder';
import { TagIndex } from './index/tagIndex';
import { Journal } from './journal/journal';
import { scanFolder } from './model/folderScan';
import { paletteCss } from './model/palette';
import { dayKeyOf } from './model/paths';
import { Saver } from './sync/saver';
import { StatusHub } from './sync/status';
import { TagService } from './tags/tagService';
import { h } from './ui/dom';
import { mountStatusIndicator } from './ui/statusIndicator';
import { openSettingsPanel } from './ui/topic/settingsPanel';
import './app.css';

export interface AppOptions {
  onChangeFolder: () => void;
}

export interface AppContext {
  readonly store: FileStore;
  readonly status: StatusHub;
  readonly saver: Saver;
  readonly journal: Journal;
  readonly tags: TagService;
  view: EditorView | null;
  openSettings(name: string): void;
}

/** Mounts the application on an open notes folder. Returns a function that tears it down. */
export function startApp(root: HTMLElement, store: FileStore, options: AppOptions): () => void {
  const status = new StatusHub();
  const cache = new IdbIndexCache();
  const saver: Saver = new Saver(store, {
    onState: (state, error) => status.set('saver', state, error ? [error] : []),
    onWritten: (path, text, lastModified) => tags.onFileWritten(path, text, lastModified),
  });
  const tags: TagService = new TagService(store, new TagIndex(), cache, saver, (messages) =>
    status.set('tags', 'saved', messages),
  );
  const journal = new Journal(store, saver);

  const editorHost = h('div', { class: 'app__editor' });
  const shell = h('div', { class: 'app' }, editorHost);
  root.replaceChildren(shell);
  const paletteStyle = h('style', {}, paletteCss());
  document.head.append(paletteStyle);
  const disposers: (() => void)[] = [mountStatusIndicator(shell, status), () => paletteStyle.remove()];

  const context: AppContext = {
    store,
    status,
    saver,
    journal,
    tags,
    view: null,
    openSettings: (name) => openSettingsPanel(tags, name, () => context.view?.focus()),
  };

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
    await tags.loadSheets(scan);
    const days = await journal.initialDays(scan, dayKeyOf(new Date()));
    const view = createJournalEditor({
      parent: editorHost,
      days,
      onTransaction: (tr) => journal.handleTransaction(tr),
      extensions: [tagContext.of(tags.editorContext()), tagDecorations(), tagAutocomplete(), checkboxes()],
    });
    journal.attach(() => view.state);
    context.view = view;
    disposers.push(() => view.destroy());
    disposers.push(tags.onTableChange(() => view.dispatch({ effects: refreshTags.of(null) })));

    await buildIndex(store, scan, tags.index, cache);
  })().catch((error: unknown) => {
    status.set('load', 'error', [error instanceof Error ? error.message : String(error)]);
  });

  void options;
  if (import.meta.env.DEV) (window as unknown as { fil: AppContext }).fil = context;
  return () => {
    flush();
    for (const dispose of disposers.reverse()) dispose();
    root.replaceChildren();
  };
}
