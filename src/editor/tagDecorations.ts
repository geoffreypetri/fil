import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { extractLineTags, normalizeTagChar } from '../model/tags';
import { lineInCodeBlock, refreshTags, tagContext } from './tagContext';

function buildTagDecorations(view: EditorView): DecorationSet {
  const context = view.state.facet(tagContext);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (line.text.includes('#') && !lineInCodeBlock(view.state, line.from)) {
        for (const match of extractLineTags(line.text)) {
          const name = context.canonical(match.tag);
          builder.add(
            line.from + match.from,
            line.from + match.to,
            Decoration.mark({
              class: `cm-tag tag-c-${context.colorOf(match.tag)}`,
              attributes: { 'data-tag': name, title: name === match.tag ? `#${name}` : `#${match.tag} → #${name}` },
            }),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const tagHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildTagDecorations(view);
    }
    update(update: ViewUpdate): void {
      const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshTags)));
      if (update.docChanged || update.viewportChanged || refreshed) {
        this.decorations = buildTagDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Clicking a tag opens its topic view; Shift+click adds it to the current topic (AND).
 * Alt+click places the cursor in the tag instead.
 */
const tagClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.altKey || event.metaKey || event.ctrlKey) return false;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cm-tag');
    const name = target?.dataset.tag;
    if (!name) return false;
    event.preventDefault();
    view.state.facet(tagContext).openTag(name, event.shiftKey);
    return true;
  },
});

const TAG_PREFIX_BEFORE = /(?<![\p{L}\p{N}_&/#])#[\p{Ll}][\p{Ll}\p{N}-]*$|(?<![\p{L}\p{N}_&/#])#$/u;

/**
 * Normalizes characters typed inside a tag: uppercase → lowercase, "_" → "-".
 * (A space still ends the tag.)
 */
const tagInputNormalizer = EditorView.inputHandler.of((view, from, to, text) => {
  if (text.length !== 1 || (text === normalizeTagChar(text) && text !== '_')) return false;
  if (text === ' ') return false;
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  const match = TAG_PREFIX_BEFORE.exec(before);
  if (!match) return false;
  // "_" cannot start a tag.
  if (match[0] === '#' && text === '_') return false;
  if (!/[\p{Lu}\p{Lt}_]/u.test(text)) return false;
  if (lineInCodeBlock(view.state, line.from)) return false;
  const insert = normalizeTagChar(text);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.type',
  });
  return true;
});

export function tagDecorations(): Extension {
  return [tagHighlighter, tagClicks, tagInputNormalizer];
}
