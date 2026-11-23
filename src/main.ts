import './theme/tokens.css';
import { setLocale } from './i18n';
import { registerServiceWorker } from './sw/registerSW';
import { renderSetupScreen, renderUnsupportedScreen } from './ui/setupScreen';

export function isBrowserSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function start(): void {
  const root = document.getElementById('app');
  if (!root) return;
  setLocale('en');
  registerServiceWorker();

  if (!isBrowserSupported()) {
    renderUnsupportedScreen(root);
    return;
  }

  renderSetupScreen(root, {
    onChooseFolder: () => {
      // Folder selection is implemented in the next step.
    },
  });
}

start();
