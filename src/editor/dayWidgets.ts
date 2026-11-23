import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { formatDate } from '../i18n';
import { parseTimeHeader } from '../model/dayParser';
import { dateOfDayKey, type DayKey } from '../model/paths';
import { SENTINEL } from '../model/segments';
import { sentinelField } from './segmentField';

class DaySeparatorWidget extends WidgetType {
  constructor(readonly day: DayKey) {
    super();
  }
  override eq(other: DaySeparatorWidget): boolean {
    return other.day === this.day;
  }
  toDOM(): HTMLElement {
    // Padding rather than margins: CodeMirror measures block widgets by their border box.
    const element = document.createElement('div');
    element.className = 'cm-day-separator';
    element.dataset.day = this.day;
    const label = document.createElement('div');
    label.className = 'cm-day-separator__label';
    label.textContent = formatDate(dateOfDayKey(this.day));
    element.append(label);
    return element;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

class TimeWidget extends WidgetType {
  constructor(readonly time: string) {
    super();
  }
  override eq(other: TimeWidget): boolean {
    return other.time === this.time;
  }
  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'cm-note-time';
    element.textContent = this.time;
    return element;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDaySeparators(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const sentinel of state.field(sentinelField)) {
    const line = state.doc.lineAt(sentinel.pos);
    builder.add(
      line.from,
      line.to,
      Decoration.replace({ widget: new DaySeparatorWidget(sentinel.day), block: true }),
    );
  }
  return builder.finish();
}

/** Day separators replace the sentinel lines. Block widgets must come from a state field. */
const daySeparators = StateField.define<DecorationSet>({
  create: buildDaySeparators,
  update(decorations, tr) {
    if (!tr.docChanged) return decorations;
    return tr.state.field(sentinelField) === tr.startState.field(sentinelField)
      ? decorations.map(tr.changes)
      : buildDaySeparators(tr.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

const hiddenHeader = Decoration.replace({ block: true });

/**
 * "## 14:52" lines stay in the files but are not shown in the text: the time appears in a
 * column to the left of the note's first line, outside the editable text. When a header has
 * no line after it in its day, it is shown inline instead.
 */
function buildTimeHeaders(state: EditorState): { decorations: DecorationSet; atomic: DecorationSet } {
  const decorations = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  const { doc } = state;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const time = parseTimeHeader(line.text);
    if (time === null) continue;
    const next = number < doc.lines ? doc.line(number + 1) : null;
    if (!next || next.text.startsWith(SENTINEL)) {
      const inline = Decoration.replace({ widget: new TimeWidget(time) });
      decorations.add(line.from, line.to, inline);
      atomic.add(line.from, line.to, inline);
      continue;
    }
    decorations.add(line.from, line.to, hiddenHeader);
    decorations.add(next.from, next.from, Decoration.line({ class: 'cm-note-start', attributes: { 'data-time': time } }));
    // The line break belongs to the header: deleting backwards from the note removes the time stamp.
    atomic.add(line.from, next.from, hiddenHeader);
  }
  return { decorations: decorations.finish(), atomic: atomic.finish() };
}

const timeHeaders = StateField.define<{ decorations: DecorationSet; atomic: DecorationSet }>({
  create: buildTimeHeaders,
  update(value, tr) {
    return tr.docChanged ? buildTimeHeaders(tr.state) : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
});

export function dayWidgets(): Extension {
  return [daySeparators, timeHeaders];
}
