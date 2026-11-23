import { EditorView } from '@codemirror/view';
import { segmentsOf } from '../editor/segmentField';
import { revealNotes } from '../editor/topicFilter';
import { parseTimeHeader } from '../model/dayParser';
import type { DayKey } from '../model/paths';
import { SENTINEL } from '../model/segments';
import type { Journal } from './journal';

/** Loads days into the journal editor and moves the cursor to them. */
export class Navigator {
  constructor(
    private readonly journal: Journal,
    private readonly view: () => EditorView | null,
  ) {}

  /** Inserts the given days (read from disk) at their chronological place. */
  async loadDays(days: readonly DayKey[]): Promise<void> {
    const loaded = this.journal.loadedDays();
    const missing = days.filter((day) => !loaded.has(day));
    if (missing.length === 0) return;
    const sources = await this.journal.readDays(missing);
    const spec = this.journal.insertDaysSpec(sources);
    const view = this.view();
    if (spec && view) view.dispatch(spec);
  }

  /** Scrolls to a line of a day file (0-based), unfolding its note if a topic hides it. */
  async goToLine(day: DayKey, fileLine: number): Promise<void> {
    await this.loadDays([day]);
    const view = this.view();
    if (!view) return;
    const segment = segmentsOf(view.state).find((s) => s.day === day);
    if (!segment) return;
    const { doc } = view.state;
    const lineNumber = Math.min(doc.lineAt(segment.from).number + fileLine, doc.lineAt(segment.to).number);
    const pos = doc.line(lineNumber).from;
    view.dispatch({
      effects: [revealNotes.of([pos, ...noteStart(view, pos)]), EditorView.scrollIntoView(pos, { y: 'center' })],
      selection: { anchor: pos },
    });
    view.focus();
  }

  /** Scrolls to the day separator of a day. */
  async goToDay(day: DayKey): Promise<void> {
    await this.loadDays([day]);
    const view = this.view();
    if (!view) return;
    const segment = segmentsOf(view.state).find((s) => s.day === day);
    if (!segment) return;
    view.dispatch({
      selection: { anchor: segment.from },
      effects: EditorView.scrollIntoView(segment.sentinelFrom, { y: 'start', yMargin: 48 }),
    });
    view.focus();
  }
}

/** Start of the note containing `pos` (so revealing it unfolds the whole note). */
function noteStart(view: EditorView, pos: number): number[] {
  const { doc } = view.state;
  for (let line = doc.lineAt(pos); ; line = doc.line(line.number - 1)) {
    if (parseTimeHeader(line.text) !== null) return [line.from];
    // Text before the first time stamp of a day is an untimed note starting after the separator.
    if (line.text.startsWith(SENTINEL)) return [Math.min(line.to + 1, doc.length)];
    if (line.number === 1) return [];
  }
}
