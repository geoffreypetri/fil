import {
  AlreadyExistsError,
  NotFoundError,
  splitPath,
  type FileContent,
  type FileInfo,
  type FileStore,
} from './store';

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');
}

/** FileStore backed by a directory handle from the File System Access API. */
export class FsAccessStore implements FileStore {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.root.name;
  }

  private async directory(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const parts = splitPath(path);
    const fileName = parts.pop();
    if (!fileName) throw new NotFoundError(path);
    try {
      const dir = await this.directory(parts, create);
      return await dir.getFileHandle(fileName, { create });
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundError(path);
      throw error;
    }
  }

  async list(dir = ''): Promise<FileInfo[]> {
    let start: FileSystemDirectoryHandle;
    try {
      start = await this.directory(splitPath(dir), false);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const result: FileInfo[] = [];
    const walk = async (handle: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const entry of handle.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'directory') {
          // Hidden folders (.git, .obsidian, .stfolder…) never contain Fil files.
          if (!entry.name.startsWith('.')) await walk(entry as FileSystemDirectoryHandle, path);
        } else {
          const file = await (entry as FileSystemFileHandle).getFile();
          result.push({ path, lastModified: file.lastModified, size: file.size });
        }
      }
    };
    await walk(start, splitPath(dir).join('/'));
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }

  async stat(path: string): Promise<FileInfo | null> {
    try {
      const file = await (await this.fileHandle(path)).getFile();
      return { path, lastModified: file.lastModified, size: file.size };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async read(path: string): Promise<FileContent> {
    const file = await (await this.fileHandle(path)).getFile();
    return { path, lastModified: file.lastModified, size: file.size, text: await file.text() };
  }

  async write(path: string, text: string): Promise<FileInfo> {
    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    const file = await handle.getFile();
    return { path, lastModified: file.lastModified, size: file.size };
  }

  async rename(from: string, to: string): Promise<void> {
    if (await this.stat(to)) throw new AlreadyExistsError(to);
    // Copy then remove: portable across browsers, unlike FileSystemHandle.move().
    const { text } = await this.read(from);
    await this.write(to, text);
    await this.remove(from);
  }

  async remove(path: string): Promise<void> {
    const parts = splitPath(path);
    const fileName = parts.pop();
    if (!fileName) throw new NotFoundError(path);
    try {
      const dir = await this.directory(parts, false);
      await dir.removeEntry(fileName);
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundError(path);
      throw error;
    }
  }
}
