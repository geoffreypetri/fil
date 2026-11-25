import { StateEffect, StateField, type EditorState, type Extension, Prec } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { plural, t } from '../i18n';
import { parseUnits } from '../model/units';
import { pageRanges } from './pageField';
import { refreshTags, tagContext } from './tagContext';

/** Sets the tags of the topic view (combined with AND), or null for the whole document. */
export const setTopicTags = StateEffect.define<readonly string[] | null>();

/** Reveals hidden notes, identified by the position of their first line. */
export const revealNotes = StateEffect.define<readonly number[]>();

interface TopicState {
  readonly tags: readonly string[] | null;
  readonly revealed: readonly number[];
}

export const topicState = StateField.define<TopicState>({
  create: () => ({ tags: null, revealed: [] }),
  update(value, tr) {
    let { tags, revealed } = value;
    if (tr.docChanged) revealed = revealed.map((pos) => tr.changes.mapPos(pos, -1));
    for (const effect of tr.effects) {
      if (effect.is(setTopicTags)) {
        tags = effect.value;
        revealed = [];
      } else if (effect.is(revealNotes)) {
        revealed = [...revealed, ...effect.value];
      }
    }
    return tags === value.tags && revealed === value.revealed ? value : { tags, revealed };
  },
});

export interface Block {
  readonly from: number;
  readonly to: number;
  /** Position identifying the note (to reveal it), or null for blank space. */
  readonly note: number | null;
  /** Whether the block is a note (paragraph) rather than a heading or blank space. */
  readonly isNote: boolean;
  readonly visible: boolean;
}

/**
 * Splits the document into blocks (headings and paragraphs, with the blank lines after them)
 * and decides which are visible: a note is visible when every topic tag applies to it — written
 * in it, or in a heading it is under. Headings above a visible note stay visible for context.
 * The end of the document always stays visible so the user can keep writing.
 */
export function topicBlocks(state: EditorState, tags: readonly string[], revealed: ReadonlySet<number>): Block[] {
  const { doc } = state;
  const canonical = state.facet(tagContext).canonical;
  const { inbox, pages } = pageRanges(state);
  const parts = [inbox, ...pages].filter(
    (part, index) => !(index === 0 && part.from === part.to && pages.length > 0 && pages[0]!.from === 0),
  );
  const blocks: Block[] = [];

  for (const part of parts) {
    const lines = doc.sliceString(part.from, part.to).split('\n');
    const lineStarts: number[] = [];
    let offset = part.from;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }
    const lineEnd = (index: number): number => lineStarts[index]! + lines[index]!.length;
    const units = parseUnits(lines);
    if (units.length === 0) {
      blocks.push({ from: part.from, to: part.to, note: null, isNote: false, visible: false });
      continue;
    }
    const shown = units.map((unit) => {
      const names = new Set(unit.tags.map(canonical));
      return tags.every((tag) => names.has(tag)) || revealed.has(lineStarts[unit.startLine]!);
    });
    const contextHeadings = new Set(units.flatMap((unit, i) => (shown[i] ? unit.headings : [])));
    units.forEach((unit, i) => {
      const next = units[i + 1];
      const startLine = i === 0 ? 0 : unit.startLine;
      const endLine = next ? next.startLine - 1 : lines.length - 1;
      blocks.push({
        from: lineStarts[startLine]!,
        to: lineEnd(endLine),
        note: lineStarts[unit.startLine]!,
        isNote: unit.kind === 'block',
        visible: shown[i]! || (unit.kind === 'heading' && contextHeadings.has(unit.startLine)),
      });
    });
  }
  const last = blocks.at(-1);
  if (last && !last.visible) blocks[blocks.length - 1] = { ...last, visible: true };
  return blocks;
}

class HiddenNotesWidget extends WidgetType {
  constructor(
    readonly count: number,
    readonly notes: readonly number[],
  ) {
    super();
  }
  override eq(other: HiddenNotesWidget): boolean {
    return other.count === this.count && other.notes.join() === this.notes.join();
  }
  toDOM(view: EditorView): HTMLElement {
    const element = document.createElement('div');
    element.className = this.count > 0 ? 'cm-hidden-notes' : 'cm-hidden-notes cm-hidden-notes--empty';
    if (this.count > 0) {
      element.textContent = plural('topic.hidden', this.count);
      element.setAttribute('role', 'button');
      element.title = t('topic.reveal');
      element.addEventListener('mousedown', (event) => {
        event.preventDefault();
        view.dispatch({ effects: revealNotes.of(this.notes) });
      });
    }
    return element;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function buildFilter(state: EditorState): DecorationSet {
  const { tags, revealed } = state.field(topicState);
  if (!tags) return Decoration.none;
  const blocks = topicBlocks(state, tags, new Set(revealed));
  const ranges = [];
  for (let i = 0; i < blocks.length; ) {
    if (blocks[i]!.visible) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < blocks.length && !blocks[j + 1]!.visible) j += 1;
    const run = blocks.slice(i, j + 1);
    const notes = run.flatMap((b) => (b.note === null ? [] : [b.note]));
    const count = run.filter((b) => b.isNote).length;
    ranges.push(
      Decoration.replace({ widget: new HiddenNotesWidget(count, notes), block: true }).range(
        run[0]!.from,
        run[run.length - 1]!.to,
      ),
    );
    i = j + 1;
  }
  return Decoration.set(ranges);
}

const filterDecorations = StateField.define<DecorationSet>({
  create: buildFilter,
  update(decorations, tr) {
    const topicChanged = tr.startState.field(topicState) !== tr.state.field(topicState);
    const refreshed = tr.effects.some((e) => e.is(refreshTags));
    if (topicChanged || refreshed || (tr.docChanged && tr.state.field(topicState).tags)) return buildFilter(tr.state);
    return decorations.map(tr.changes);
  },
  provide: (field) => [
    Prec.high(EditorView.decorations.from(field)),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

export function topicFilter(): Extension {
  return [topicState, filterDecorations];
}
