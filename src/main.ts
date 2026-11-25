import './theme/tokens.css';
import { setLocale, t } from './i18n';
import { FsAccessStore } from './fs/fsAccessStore';
import { loadFolder, pickFolder, requestFolderPermission } from './fs/handle';
import type { FileStore } from './fs/store';
import { listenForInstallPrompt } from './sw/install';
import { startUpdater } from './sw/updater';
import { renderSetupScreen, renderUnsupportedScreen } from './ui/setupScreen';
import { startApp } from './app';
import { applyStoredTheme } from './ui/theme';

export function isBrowserSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function boot(root: HTMLElement): Promise<void> {
  let stopApp: (() => void) | null = null;

  const open = (store: FileStore): void => {
    stopApp?.();
    stopApp = startApp(root, store, { onChangeFolder: chooseFolder });
  };

  async function chooseFolder(): Promise<void> {
    try {
      const handle = await pickFolder();
      if (handle) open(new FsAccessStore(handle));
    } catch (error) {
      showSetup(undefined, t('setup.error', { message: errorMessage(error) }));
    }
  }

  const showSetup = (handle?: FileSystemDirectoryHandle, error?: string): void => {
    renderSetupScreen(root, {
      reconnectFolder: handle?.name,
      onChooseFolder: () => void chooseFolder(),
      onReconnect: handle
        ? () => {
            requestFolderPermission(handle)
              .then((granted) => (granted ? open(new FsAccessStore(handle)) : showSetup(handle)))
              .catch((err: unknown) => showSetup(handle, t('setup.error', { message: errorMessage(err) })));
          }
        : undefined,
      error,
    });
  };

  // Development only: ?opfs uses the browser's private file system instead of a picked folder.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('opfs')) {
    open(new FsAccessStore(await navigator.storage.getDirectory()));
    return;
  }

  const state = await loadFolder().catch(() => ({ kind: 'none' }) as const);
  if (state.kind === 'granted') open(new FsAccessStore(state.handle));
  else if (state.kind === 'needsPermission') showSetup(state.handle);
  else showSetup();
}

function storedLocale(): string {
  try {
    return localStorage.getItem('fil.locale') ?? 'en';
  } catch {
    return 'en';
  }
}

function start(): void {
  const root = document.getElementById('app');
  if (!root) return;
  setLocale(storedLocale());
  applyStoredTheme();
  listenForInstallPrompt();
  startUpdater();
  if (!isBrowserSupported()) {
    renderUnsupportedScreen(root);
    return;
  }
  void boot(root);
}

start();
