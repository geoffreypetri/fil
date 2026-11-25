import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { pagesField } from './pageField';

// The same decoration for every title: a first-page variant would change height as soon as
// earlier pages are loaded above it, and make the view jump.
const titleLine = Decoration.line({ class: 'cm-page-title' });

/** Marks the first line of each page so pages read as distinct blocks of the document. */
function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const pages = view.state.field(pagesField);
  const { from, to } = view.viewport;
  for (const page of pages) {
    if (page.from >= from && page.from <= to) builder.add(page.from, page.from, titleLine);
  }
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
