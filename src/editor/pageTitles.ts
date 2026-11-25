import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { pagesField } from './pageField';

const titleLine = Decoration.line({ class: 'cm-page-title' });
const firstTitleLine = Decoration.line({ class: 'cm-page-title cm-page-title--first' });

/** Marks the first line of each page so pages read as distinct blocks of the document. */
function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const pages = view.state.field(pagesField);
  const { from, to } = view.viewport;
  pages.forEach((page, index) => {
    if (page.from < from || page.from > to) return;
    builder.add(page.from, page.from, index === 0 && page.from === 0 ? firstTitleLine : titleLine);
  });
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.startState.field(pagesField) !== update.state.field(pagesField)) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

export function pageTitles(): Extension {
  return plugin;
}
