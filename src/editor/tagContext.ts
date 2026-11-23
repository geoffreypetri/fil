import { syntaxTree } from '@codemirror/language';
import { Facet, StateEffect, type EditorState } from '@codemirror/state';
import { hashColor, type PaletteColor } from '../model/palette';

export interface TagCompletion {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly label?: string;
}

/** What the editor needs to know about tags; provided by the app. */
export interface TagEditorContext {
  canonical(raw: string): string;
  colorOf(raw: string): PaletteColor;
  /** Completion candidates, most recently used first (archived tags excluded). */
  completions(): readonly TagCompletion[];
  /** Opens the topic view of a tag (primary name). */
  openTag(name: string): void;
}

const defaultContext: TagEditorContext = {
  canonical: (raw) => raw,
  colorOf: (raw) => hashColor(raw),
  completions: () => [],
  openTag: () => undefined,
};

export const tagContext = Facet.define<TagEditorContext, TagEditorContext>({
  combine: (values) => values[0] ?? defaultContext,
});

/** Dispatched when the tag table changes (colors, aliases) to redraw tag decorations. */
export const refreshTags = StateEffect.define<null>();

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'URL', 'Autolink']);

/** Whether a position is inside code or a URL, according to the Markdown syntax tree. */
export function inCode(state: EditorState, pos: number, side: -1 | 1 = -1): boolean {
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  return false;
}

/** Whether a line starts inside a fenced or indented code block. */
export function lineInCodeBlock(state: EditorState, lineFrom: number): boolean {
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(lineFrom, 1); node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}
