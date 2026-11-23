import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { formatDayHeading } from '../i18n';
import { parseTimeHeader } from '../model/dayParser';
import { dateOfDayKey, type DayKey } from '../model/paths';
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
    label.textContent = formatDayHeading(dateOfDayKey(this.day));
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

const noteHeaderLine = Decoration.line({ class: 'cm-note-header' });

function buildTimeHeaders(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const builder = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const time = parseTimeHeader(line.text);
      if (time !== null) {
        builder.add(line.from, line.from, noteHeaderLine);
        const replace = Decoration.replace({ widget: new TimeWidget(time) });
        builder.add(line.from, line.to, replace);
        atomic.add(line.from, line.to, replace);
      }
      pos = line.to + 1;
    }
  }
  return { decorations: builder.finish(), atomic: atomic.finish() };
}

/** "## 14:52" lines are shown as a discreet, atomic time stamp. */
const timeHeaders = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = buildTimeHeaders(view));
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildTimeHeaders(update.view));
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);

export function dayWidgets(): Extension {
  return [daySeparators, timeHeaders];
}
