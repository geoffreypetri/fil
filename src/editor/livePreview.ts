import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { parseTimeHeader } from '../model/dayParser';

const hidden = Decoration.replace({});
const linkText = Decoration.mark({ class: 'cm-link-text' });
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark']);

/**
 * Lines being edited: their Markdown marks stay visible. Only the cursor line counts (or a
 * selection within one line), and only while the editor has focus, so selecting a large
 * block (Ctrl+A) or leaving the editor never makes the layout jump.
 */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    if (first === view.state.doc.lineAt(range.to).number) lines.add(first);
  }
  return lines;
}

function buildPreview(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const active = activeLines(view);
  const ranges: Range<Decoration>[] = [];
  const isActive = (pos: number): boolean => active.has(doc.lineAt(pos).number);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (INLINE_MARKS.has(node.name)) {
          if (!isActive(node.from)) ranges.push(hidden.range(node.from, node.to));
        } else if (node.name === 'HeaderMark') {
          const line = doc.lineAt(node.from);
          // "## 14:52" lines are note time stamps, rendered by their own widget.
          if (isActive(node.from) || parseTimeHeader(line.text) !== null || node.from !== line.from) return;
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          ranges.push(hidden.range(node.from, end));
        } else if (node.name === 'Link') {
          if (isActive(node.from)) return false;
          // [text](url): keep only "text", styled as a link by the highlighter.
          const link = node.node;
          const marks: { from: number; to: number }[] = [];
          for (let child = link.firstChild; child; child = child.nextSibling) {
            if (child.name === 'LinkMark' || child.name === 'URL' || child.name === 'LinkTitle') {
              marks.push({ from: child.from, to: child.to });
            }
          }
          // Only "[text](url)" links: reference links and bare brackets are left alone.
          if (marks.length < 3 || doc.sliceString(marks[0]!.from, marks[0]!.to) !== '[') return false;
          for (const mark of marks) ranges.push(hidden.range(mark.from, mark.to));
          if (marks[1]!.from > marks[0]!.to) ranges.push(linkText.range(marks[0]!.to, marks[1]!.from));
          return false;
        }
        return undefined;
      },
    });
  }
  return Decoration.set(ranges, true);
}

/**
 * Light live preview: Markdown marks for headings, emphasis and links are hidden except on the
 * lines being edited, so the text reads cleanly while staying plain Markdown.
 */
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildPreview(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildPreview(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export function livePreview(): Extension {
  return livePreviewPlugin;
}
