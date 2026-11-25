import type { EditorView } from '@codemirror/view';
import { checkboxes } from './editor/checkboxes';
import { createJournalEditor } from './editor/journalEditor';
import { tagAutocomplete } from './editor/tagAutocomplete';
import { refreshTags, tagContext } from './editor/tagContext';
import { tagDecorations } from './editor/tagDecorations';
import { topicFilter } from './editor/topicFilter';
import type { FileStore } from './fs/store';
import { IdbIndexCache } from './index/cache';
import { buildIndex } from './index/indexBuilder';
import { TagIndex } from './index/tagIndex';
import { Journal } from './journal/journal';
import { Navigator } from './journal/navigator';
import { ProgressiveLoader } from './journal/progressiveLoader';
import { scanFolder } from './model/folderScan';
import { paletteCss } from './model/palette';
import { dayKeyOf } from './model/paths';
import { Saver } from './sync/saver';
import { StatusHub } from './sync/status';
import { ExternalWatcher } from './sync/watcher';
import { setBeforeReload } from './sw/updater';
import { applySession, captureSession, saveSession, takeSession } from './journal/sessionRestore';
import { consumeUpdateNotice, openWhatsNew } from './ui/whatsNew';
import { t } from './i18n';
import { APP_VERSION } from './version';
import { RenameService } from './tags/renameService';
import { TagService } from './tags/tagService';
import { CommandPalette } from './ui/palette/commandPalette';
import { rootMode } from './ui/palette/commands';
import { openRenameDialog } from './ui/renameDialog';
import { h } from './ui/dom';
import { mountStatusIndicator } from './ui/statusIndicator';
import { openSettingsPanel } from './ui/topic/settingsPanel';
import { TopicView } from './ui/topic/topicView';
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
  readonly topic: TopicView;
  readonly rename: RenameService;
  readonly palette: CommandPalette;
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
  const navigator = new Navigator(journal, () => context.view);

  const editorHost = h('div', { class: 'app__editor' });
  const topicHost = h('div', { class: 'topic' });
  const shell = h('div', { class: 'app' }, topicHost, editorHost);
  root.replaceChildren(shell);
  const paletteStyle = h('style', {}, paletteCss());
  document.head.append(paletteStyle);
  const disposers: (() => void)[] = [mountStatusIndicator(shell, status), () => paletteStyle.remove()];

  const openSettings = (name: string): void => openSettingsPanel(tags, name, () => context.view?.focus());
  const topic = new TopicView({
    host: topicHost,
    store,
    saver,
    journal,
    tags,
    status,
    navigator,
    view: () => context.view,
    openSettings,
  });
  tags.openTag = (name, add) => void (add ? topic.add(name) : topic.open([name]));
  disposers.push(() => topic.destroy());

  const rename = new RenameService({
    store,
    saver,
    tags,
    journal,
    view: () => context.view,
    onRenamed: (from, to) => {
      const current = topic.tags;
      if (current?.includes(from)) void topic.open(current.map((name) => (name === from ? to : name)));
    },
  });
  const focusEditor = (): void => {
    if (!document.querySelector('dialog[open]')) context.view?.focus();
  };
  const palette: CommandPalette = new CommandPalette(
    () =>
      rootMode({
        tags,
        topic,
        navigator,
        rename,
        chooseFolder: () => options.onChangeFolder(),
        openSettings,
        openRename: (name) => openRenameDialog(rename, name, () => undefined, focusEditor),
        focusSheet: () => topic.focusSheet(),
        report: (message, isError) => status.set('palette', isError ? 'error' : 'saved', [message]),
        openWhatsNew: () => openWhatsNew(focusEditor),
        onLocaleChange: () => {
          void saver.flush().then(() => location.reload());
        },
      }),
    focusEditor,
  );
  const context: AppContext = {
    store,
    status,
    saver,
    journal,
    tags,
    topic,
    rename,
    palette,
    view: null,
    openSettings,
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      if (palette.isOpen()) palette.close();
      else if (!document.querySelector('dialog[open]')) palette.open();
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented && topic.isOpen() && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      topic.close();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);
  disposers.push(() => window.removeEventListener('keydown', onKeyDown, true));

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
      extensions: [
        tagContext.of(tags.editorContext()),
        tagDecorations(),
        tagAutocomplete(),
        checkboxes(),
        topicFilter(),
      ],
    });
    journal.attach(() => view.state);
    context.view = view;
    disposers.push(() => view.destroy());
    disposers.push(tags.onTableChange(() => view.dispatch({ effects: refreshTags.of(null) })));

    const loader = new ProgressiveLoader(journal, view);
    loader.start();
    disposers.push(() => loader.stop());

    await buildIndex(store, scan, tags.index, cache);

    const watcher = new ExternalWatcher({
      store,
      saver,
      journal,
      tags,
      status,
      dispatch: (spec) => {
        if (spec) view.dispatch(spec);
      },
      onSheetChanged: (name) => topic.reloadSheet(name),
      today: () => dayKeyOf(new Date()),
    });
    watcher.start();
    disposers.push(() => watcher.stop());
    await watcher.check();

    // Back from an automatic update: same topic, cursor and scroll position as before.
    const snapshot = takeSession();
    if (snapshot) {
      if (snapshot.topic) await topic.open(snapshot.topic);
      applySession(view, snapshot);
    }
    if (consumeUpdateNotice()) showUpdateNotice();
  })().catch((error: unknown) => {
    status.set('load', 'error', [error instanceof Error ? error.message : String(error)]);
  });

  // Before an automatic update reloads the page: save everything and remember the position.
  setBeforeReload(async () => {
    await saver.flush();
    if (saver.hasPending()) throw new Error('Some files could not be saved');
    if (context.view) saveSession(captureSession(context.view, topic.tags));
  });
  disposers.push(() => setBeforeReload(async () => undefined));

  function showUpdateNotice(): void {
    const notice = h(
      'button',
      {
        class: 'notice',
        onclick: () => {
          notice.remove();
          openWhatsNew(focusEditor);
        },
      },
      t('whatsNew.updated', { version: APP_VERSION }),
    );
    shell.append(notice);
    setTimeout(() => notice.remove(), 12_000);
  }

  if (import.meta.env.DEV) (window as unknown as { fil: AppContext }).fil = context;
  return () => {
    flush();
    for (const dispose of disposers.reverse()) dispose();
    root.replaceChildren();
  };
}
