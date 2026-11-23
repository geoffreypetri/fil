import { t } from '../i18n';
import type { StatusHub } from '../sync/status';
import { h } from './dom';
import './statusIndicator.css';

/** Discreet corner indicator: "saved" / "saving…" / "error", details on hover. */
export function mountStatusIndicator(parent: HTMLElement, hub: StatusHub): () => void {
  const element = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  parent.append(element);
  const unsubscribe = hub.subscribe(({ state, messages }) => {
    element.dataset.state = state;
    element.textContent = t(`status.${state}`);
    element.title = messages.join('\n');
    element.classList.toggle('status--warning', state !== 'error' && messages.length > 0);
  });
  return () => {
    unsubscribe();
    element.remove();
  };
}
