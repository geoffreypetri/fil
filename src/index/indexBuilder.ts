import type { FileStore } from '../fs/store';
import { indexPage, type PageEntry } from '../model/pageIndex';
import type { FolderScan } from '../model/folderScan';
import type { IndexCache } from './cache';
import type { TagIndex } from './tagIndex';

/**
 * Fills the index with every page of the folder, reusing cached entries whose lastModified
 * still matches. Files are read in small batches so the UI stays responsive.
 */
export async function buildIndex(
  store: FileStore,
  scan: FolderScan,
  index: TagIndex,
  cache: IndexCache,
  batchSize = 50,
): Promise<{ read: number; cached: number }> {
  const cachedEntries = await cache.load(store.name);
  const fresh: PageEntry[] = [];
  const toRead: FolderScan['pages'][number][] = [];

  for (const file of scan.pages) {
    const cached = cachedEntries.get(file.path);
    if (cached && cached.lastModified === file.lastModified && cached.path === file.path) fresh.push(cached);
    else toRead.push(file);
  }
  index.setMany(fresh);

  for (let i = 0; i < toRead.length; i += batchSize) {
    const batch = toRead.slice(i, i + batchSize);
    const entries = await Promise.all(
      batch.map(async (file) => {
        try {
          const { text, lastModified } = await store.read(file.path);
          return [file.path, indexPage(file.path, text, lastModified)] as [string, PageEntry];
        } catch {
          return null;
        }
      }),
    );
    const read = entries.filter((e): e is [string, PageEntry] => e !== null);
    index.setMany(read.map(([, entry]) => entry));
    await cache.save(store.name, read);
  }

  await cache.prune(store.name, new Set(scan.pages.map((p) => p.path)));
  return { read: toRead.length, cached: fresh.length };
}
