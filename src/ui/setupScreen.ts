import { t } from '../i18n';
import { VERSION_LABEL } from '../version';
import { h } from './dom';
import './setupScreen.css';

export interface SetupScreenOptions {
  /** Name of a previously used folder that needs permission again, if any. */
  reconnectFolder?: string;
  onChooseFolder: () => void;
  onReconnect?: () => void;
  error?: string;
}

/** The single first-run screen: "Choose notes folder" (or reconnect to the previous one). */
export function renderSetupScreen(root: HTMLElement, options: SetupScreenOptions): void {
  const actions = h('div', { class: 'setup__actions' });

  if (options.reconnectFolder && options.onReconnect) {
    actions.append(
      h(
        'button',
        { class: 'setup__button', onclick: options.onReconnect },
        t('setup.reconnect', { folder: options.reconnectFolder }),
      ),
      h('button', { class: 'setup__link', onclick: options.onChooseFolder }, t('setup.otherFolder')),
    );
  } else {
    actions.append(
      h('button', { class: 'setup__button', onclick: options.onChooseFolder }, t('setup.chooseFolder')),
    );
  }

  const text = options.reconnectFolder ? t('setup.reconnectHint') : t('setup.tagline');

  root.replaceChildren(
    h(
      'main',
      { class: 'setup' },
      h(
        'div',
        { class: 'setup__inner' },
        h('h1', { class: 'setup__title' }, t('setup.title')),
        h('p', { class: 'setup__text' }, text),
        actions,
        options.error ? h('p', { class: 'setup__error', role: 'alert' }, options.error) : null,
        h('p', { class: 'setup__version' }, VERSION_LABEL),
      ),
    ),
  );
  actions.querySelector('button')?.focus();
}

/** Shown when the File System Access API is missing. Never throws. */
export function renderUnsupportedScreen(root: HTMLElement): void {
  root.replaceChildren(
    h(
      'main',
      { class: 'setup' },
      h(
        'div',
        { class: 'setup__inner' },
        h('h1', { class: 'setup__title' }, t('browser.unsupported.title')),
        h('p', { class: 'setup__text' }, t('browser.unsupported.body')),
        h('p', { class: 'setup__version' }, VERSION_LABEL),
      ),
    ),
  );
}
