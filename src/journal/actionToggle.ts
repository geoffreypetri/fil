import type { EditorView } from '@codemirror/view';
import { pageRanges } from '../editor/pageField';
import type { FileStore } from '../fs/store';
import type { ActionRef } from '../index/tagIndex';
import { parseTaskLine, setTaskInText } from '../model/actions';
import { INBOX_FILE_PATH, pageNameOf } from '../model/pages';
import type { Saver } from '../sync/saver';

/**
 * Checks or unchecks an action from the index. When its page is in the editor, the change goes
 * through the editor (and its normal saving); otherwise the file is rewritten directly.
 * Returns false when the action could not be found anymore.
 */
export async function setActionDone(
  ref: ActionRef,
  done: boolean,
  view: EditorView | null,
  store: FileStore,
  saver: Saver,
): Promise<boolean> {
  const name = pageNameOf(ref.path);
  if (view && name !== null) {
    const { inbox, pages } = pageRanges(view.state);
    const range =
      ref.path === INBOX_FILE_PATH
        ? inbox
        : pages.find((r) => r.page.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (range) {
      const { doc } = view.state;
      const firstLine = doc.lineAt(range.from).number;
      const lastLine = doc.lineAt(range.to).number;
      const matches = (number: number): boolean =>
        number >= firstLine && number <= lastLine && parseTaskLine(doc.line(number).text)?.text === ref.action.text;
      // The editor may show one more line than the file: a title added to a file without one.
      let target = [firstLine + ref.action.line, firstLine + ref.action.line + 1].find(matches);
      if (target === undefined) {
        const candidates: number[] = [];
        for (let n = firstLine; n <= lastLine; n++) if (matches(n)) candidates.push(n);
        if (candidates.length !== 1) return false;
        target = candidates[0]!;
      }
      const line = doc.line(target);
      const task = parseTaskLine(line.text)!;
      const from = line.from + task.boxOffset;
      view.dispatch({ changes: { from, to: from + 1, insert: done ? 'x' : ' ' }, userEvent: 'input.toggle' });
      return true;
    }
  }
  const { text } = await store.read(ref.path);
  const next = setTaskInText(text, ref.action.line, ref.action.text, done);
  if (next === null) return false;
  await saver.writeNow(ref.path, next);
  return true;
}
