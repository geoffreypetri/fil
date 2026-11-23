import type { FileStore } from '../fs/store';
import { indexDay, type DayEntry } from '../model/dayIndex';
import type { FolderScan } from '../model/folderScan';
import type { IndexCache } from './cache';
import type { TagIndex } from './tagIndex';

/**
 * Fills the index with every day file of the folder, reusing cached entries whose lastModified
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
  const fresh: DayEntry[] = [];
  const toRead: FolderScan['days'][number][] = [];

  for (const file of scan.days) {
    const cached = cachedEntries.get(file.path);
    if (cached && cached.lastModified === file.lastModified && cached.day === file.day) fresh.push(cached);
    else toRead.push(file);
  }
  index.setMany(fresh);

  for (let i = 0; i < toRead.length; i += batchSize) {
    const batch = toRead.slice(i, i + batchSize);
    const entries = await Promise.all(
      batch.map(async (file) => {
        try {
          const { text, lastModified } = await store.read(file.path);
          return [file.path, indexDay(file.day, text, lastModified)] as [string, DayEntry];
        } catch {
          return null;
        }
      }),
    );
    const read = entries.filter((e): e is [string, DayEntry] => e !== null);
    index.setMany(read.map(([, entry]) => entry));
    await cache.save(store.name, read);
  }

  await cache.prune(store.name, new Set(scan.days.map((d) => d.path)));
  return { read: toRead.length, cached: fresh.length };
}
