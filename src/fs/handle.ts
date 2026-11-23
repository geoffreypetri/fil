import { createStore, del, get, set } from 'idb-keyval';

const store = createStore('fil-settings', 'handles');
const FOLDER_KEY = 'notesFolder';
const READ_WRITE = { mode: 'readwrite' } as const;

export type FolderState =
  | { kind: 'none' }
  | { kind: 'granted'; handle: FileSystemDirectoryHandle }
  | { kind: 'needsPermission'; handle: FileSystemDirectoryHandle };

/** Loads the remembered folder and checks whether permission is still granted. */
export async function loadFolder(): Promise<FolderState> {
  let handle: FileSystemDirectoryHandle | undefined;
  try {
    handle = await get<FileSystemDirectoryHandle>(FOLDER_KEY, store);
  } catch {
    return { kind: 'none' };
  }
  if (!handle) return { kind: 'none' };
  const permission = await handle.queryPermission(READ_WRITE);
  if (permission === 'granted') return { kind: 'granted', handle };
  if (permission === 'prompt') return { kind: 'needsPermission', handle };
  return { kind: 'none' };
}

/** Must run in a user gesture. Returns true when access is granted. */
export async function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.requestPermission(READ_WRITE)) === 'granted';
}

/** Opens the directory picker. Returns null when the user cancels. Must run in a user gesture. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: 'fil-notes', mode: 'readwrite' });
    await set(FOLDER_KEY, handle, store);
    return handle;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

export async function forgetFolder(): Promise<void> {
  await del(FOLDER_KEY, store);
}
