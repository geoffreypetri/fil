import { StateEffect, StateField, type EditorState, type Extension, Prec } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { plural, t } from '../i18n';
import { parseNotes } from '../model/dayParser';
import { extractTagsByLine } from '../model/tags';
import { segmentsOf } from './segmentField';
import { refreshTags, tagContext } from './tagContext';

/** Sets the tags of the topic view (combined with AND), or null for the full journal. */
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
  /** Position of the note's first line, or null for a day separator block. */
  readonly note: number | null;
  readonly visible: boolean;
}

/**
 * Splits the document into blocks (day separators and notes) and decides which are visible:
 * a note is visible when it carries every topic tag; a day separator when its day has a
 * visible note. The last day always stays visible so the user can keep writing.
 */
export function topicBlocks(state: EditorState, tags: readonly string[], revealed: ReadonlySet<number>): Block[] {
  const { doc } = state;
  const canonical = state.facet(tagContext).canonical;
  const segments = segmentsOf(state);
  const blocks: Block[] = [];

  segments.forEach((segment, segmentIndex) => {
    const content = doc.sliceString(segment.from, segment.to);
    const lines = content.split('\n');
    const lineStarts: number[] = [];
    let offset = segment.from;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }
    const lineEnd = (index: number): number => lineStarts[index]! + lines[index]!.length;
    const tagsByLine = extractTagsByLine(lines);
    const notes = parseNotes(lines);
    const isLast = segmentIndex === segments.length - 1;

    const noteBlocks: Block[] = notes.map((note) => {
      const names = new Set(tagsByLine.slice(note.startLine, note.endLine + 1).flat().map((m) => canonical(m.tag)));
      const from = lineStarts[note.startLine]!;
      return {
        from,
        to: lineEnd(note.endLine),
        note: from,
        visible: tags.every((tag) => names.has(tag)) || revealed.has(from),
      };
    });
    const firstNoteLine = notes[0]?.startLine ?? lines.length;
    const headerEnd = firstNoteLine > 0 ? lineEnd(firstNoteLine - 1) : doc.lineAt(segment.sentinelFrom).to;
    blocks.push({
      from: segment.sentinelFrom,
      to: headerEnd,
      note: null,
      visible: isLast || noteBlocks.some((b) => b.visible),
    });
    blocks.push(...noteBlocks);
  });
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
    ranges.push(
      Decoration.replace({ widget: new HiddenNotesWidget(notes.length, notes), block: true }).range(
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
