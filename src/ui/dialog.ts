import { h } from './dom';
import './dialog.css';

export interface DialogHandle {
  readonly element: HTMLDialogElement;
  close(): void;
}

/**
 * Opens a modal dialog. Escape and clicks on the backdrop close it.
 * Focus returns to the previously focused element when it closes.
 */
export function openDialog(
  content: HTMLElement,
  options: { className?: string; onClose?: () => void; label?: string } = {},
): DialogHandle {
  const previous = document.activeElement as HTMLElement | null;
  const element = h('dialog', { class: `dialog ${options.className ?? ''}`, 'aria-label': options.label });
  element.append(content);
  document.body.append(element);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    element.close();
    element.remove();
    options.onClose?.();
    previous?.focus();
  };
  element.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  element.addEventListener('mousedown', (event) => {
    if (event.target === element) close();
  });
  element.showModal();
  return { element, close };
}
