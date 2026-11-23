import type { FileStore } from './fs/store';
import { h } from './ui/dom';

export interface AppOptions {
  onChangeFolder: () => void;
}

/** Mounts the application on an open notes folder. Returns a function that tears it down. */
export function startApp(root: HTMLElement, store: FileStore, options: AppOptions): () => void {
  root.replaceChildren(h('main', { class: 'app' }, h('p', {}, store.name)));
  void options;
  return () => root.replaceChildren();
}
