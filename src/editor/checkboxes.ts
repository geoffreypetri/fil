import { Prec, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { parseTaskLine } from '../model/actions';
import { lineInCodeBlock } from './tagContext';

class CheckboxWidget extends WidgetType {
  constructor(readonly done: boolean) {
    super();
  }
  override eq(other: CheckboxWidget): boolean {
    return other.done === this.done;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-task-box';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.done;
    input.tabIndex = -1;
    input.addEventListener('mousedown', (event) => {
      event.preventDefault();
      toggleTaskAt(view, view.posAtDOM(wrapper));
    });
    wrapper.append(input);
    return wrapper;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Toggles the task on the line containing `pos`. */
export function toggleTaskAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  const task = parseTaskLine(line.text);
  if (!task) return false;
  view.dispatch({
    changes: { from: line.from + task.boxOffset, to: line.from + task.boxOffset + 1, insert: task.done ? ' ' : 'x' },
    userEvent: 'input.toggle',
  });
  return true;
}

const doneLine = Decoration.line({ class: 'cm-task-done' });

function buildCheckboxes(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const builder = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const task = parseTaskLine(line.text);
      if (task && !lineInCodeBlock(view.state, line.from)) {
        const markerFrom = line.from + line.text.search(/\S/);
        const markerTo = line.from + task.markerLength - 1;
        const replace = Decoration.replace({ widget: new CheckboxWidget(task.done) });
        if (task.done) builder.add(line.from, line.from, doneLine);
        builder.add(markerFrom, markerTo, replace);
        atomic.add(markerFrom, markerTo, replace);
      }
      pos = line.to + 1;
    }
  }
  return { decorations: builder.finish(), atomic: atomic.finish() };
}

/** "- [ ]" and "- [x]" are shown as real checkboxes. */
const checkboxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = buildCheckboxes(view));
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildCheckboxes(update.view));
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);

/**
 * Enter on an empty task ("- [ ] " and nothing else) ends the list, as it does for an empty
 * bullet. Without this, the "[ ]" counts as content and the list never ends.
 */
export function endEmptyTask(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to || !/^\s*[-*+] \[[ xX]\]\s*$/.test(line.text)) return false;
  view.dispatch({ changes: { from: line.from, to: line.to }, selection: { anchor: line.from }, userEvent: 'delete' });
  return true;
}

export function checkboxes(): Extension {
  // Highest: the Markdown keymap (also high) would otherwise continue the list first.
  return [checkboxPlugin, Prec.highest(keymap.of([{ key: 'Enter', run: endEmptyTask }]))];
}
