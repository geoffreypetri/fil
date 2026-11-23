import type { FileStore } from '../fs/store';
import { parseSheet } from '../model/frontmatter';
import type { FolderScan } from '../model/folderScan';
import { isValidTag } from '../model/tags';
import type { SheetRecord } from '../model/tagTable';

export interface LoadedSheet {
  readonly record: SheetRecord;
  readonly text: string;
}

/** Reads every tag sheet. Files whose name is not a valid tag are reported, not loaded. */
export async function loadSheets(
  store: FileStore,
  sheets: FolderScan['sheets'],
): Promise<{ sheets: LoadedSheet[]; invalid: string[] }> {
  const loaded: LoadedSheet[] = [];
  const invalid: string[] = [];
  await Promise.all(
    sheets.map(async (file) => {
      if (!isValidTag(file.stem)) {
        invalid.push(file.path);
        return;
      }
      try {
        const { text, lastModified } = await store.read(file.path);
        loaded.push({
          text,
          record: { name: file.stem, path: file.path, lastModified, settings: parseSheet(text).settings },
        });
      } catch {
        invalid.push(file.path);
      }
    }),
  );
  loaded.sort((a, b) => a.record.name.localeCompare(b.record.name));
  return { sheets: loaded, invalid };
}
