import type { EditorView } from '@codemirror/view';
import type { FileStore } from '../fs/store';
import type { ActionRef } from '../index/tagIndex';
import { parseTaskLine, setTaskInText } from '../model/actions';
import { dayPath } from '../model/paths';
import { segmentsOf } from '../editor/segmentField';
import type { Saver } from '../sync/saver';

/**
 * Checks or unchecks an action from the index. When its day is loaded in the editor, the change
 * goes through the editor (and its normal saving); otherwise the day file is rewritten directly.
 * Returns false when the action could not be found anymore.
 */
export async function setActionDone(
  ref: ActionRef,
  done: boolean,
  view: EditorView | null,
  store: FileStore,
  saver: Saver,
): Promise<boolean> {
  if (view) {
    const segment = segmentsOf(view.state).find((s) => s.day === ref.day);
    if (segment) {
      const { doc } = view.state;
      const firstLine = doc.lineAt(segment.from).number;
      const lastLine = doc.lineAt(segment.to).number;
      const matches = (number: number): boolean =>
        number >= firstLine && number <= lastLine && parseTaskLine(doc.line(number).text)?.text === ref.action.text;
      let target = firstLine + ref.action.line;
      if (!matches(target)) {
        const candidates = [];
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
  const path = dayPath(ref.day);
  const { text } = await store.read(path);
  const next = setTaskInText(text, ref.action.line, ref.action.text, done);
  if (next === null) return false;
  await saver.writeNow(path, next);
  return true;
}
