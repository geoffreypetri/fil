import changelog from '../../CHANGELOG.md?raw';
import { t } from '../i18n';
import { APP_VERSION } from '../version';
import { openDialog } from './dialog';
import { h } from './dom';
import './whatsNew.css';

/** Renders inline Markdown used in the changelog: **bold**, `code`, *italic*. */
function inline(text: string): Node[] {
  const nodes: Node[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    if (match[1] !== undefined) nodes.push(h('strong', {}, match[1]));
    else if (match[2] !== undefined) nodes.push(h('code', {}, match[2]));
    else nodes.push(h('em', {}, match[3]!));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

/** Turns the changelog (headings, bullet lists, paragraphs) into DOM nodes. Text only, no HTML. */
export function renderChangelog(markdown: string): HTMLElement {
  const root = h('div', { class: 'whats-new__content' });
  let list: HTMLUListElement | null = null;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) continue;
    if (line.startsWith('- ')) {
      list ??= root.appendChild(h('ul', {}));
      list.append(h('li', {}, ...inline(line.slice(2))));
      continue;
    }
    list = null;
    if (line.startsWith('## ')) root.append(h('h3', {}, line.slice(3)));
    else if (line.trim() !== '') root.append(h('p', {}, ...inline(line)));
  }
  return root;
}

export function openWhatsNew(onClose?: () => void): void {
  const body = h(
    'div',
    { class: 'dialog__body' },
    h('h2', { class: 'dialog__title' }, t('whatsNew.title', { version: APP_VERSION })),
    renderChangelog(changelog),
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { type: 'button', class: 'dialog__button dialog__button--primary', onclick: () => dialog.close() }, t('whatsNew.close')),
    ),
  );
  const dialog = openDialog(body, { className: 'whats-new', label: t('whatsNew.title', { version: APP_VERSION }), onClose });
}

const SEEN_KEY = 'fil.seenVersion';

/**
 * Returns true once after the app switched to a new version (not on the very first launch),
 * so the user can be told discreetly that Fil was updated.
 */
export function consumeUpdateNotice(): boolean {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, APP_VERSION);
    return seen !== null && seen !== APP_VERSION;
  } catch {
    return false;
  }
}
