import { codeLines, extractLineTags } from './tags';

/** Heading level (1–6) of a Markdown ATX heading line, or 0. */
export function headingLevel(line: string): number {
  const match = /^(#{1,6})[ \t]+\S/.exec(line);
  return match ? match[1]!.length : 0;
}

export interface Unit {
  /** "heading": a heading line; "block": a paragraph, list or code block (lines without blank). */
  readonly kind: 'heading' | 'block';
  readonly startLine: number;
  readonly endLine: number;
  /** Tags written in the unit itself. */
  readonly ownTags: readonly string[];
  /**
   * Tags that apply to the unit: its own and those of every heading it is under. A tag in a
   * heading covers its whole section, down to the next heading of the same or a higher level.
   */
  readonly tags: readonly string[];
  /** Heading lines enclosing the unit (outermost first); for a heading, its parents. */
  readonly headings: readonly number[];
}

const unique = (values: Iterable<string>): string[] => [...new Set(values)];

/**
 * Splits a page into units. A "note", for tags and actions, is the section of a heading that
 * carries the tag; otherwise it is the paragraph (block of consecutive non-blank lines).
 */
export function parseUnits(lines: readonly string[]): Unit[] {
  const code = codeLines(lines);
  const units: Unit[] = [];
  const stack: { line: number; level: number; tags: string[] }[] = [];
  const inherited = (): string[] => unique(stack.flatMap((h) => h.tags));

  let block: { start: number; tags: string[] } | null = null;
  const closeBlock = (end: number): void => {
    if (!block) return;
    units.push({
      kind: 'block',
      startLine: block.start,
      endLine: end,
      ownTags: unique(block.tags),
      tags: unique([...inherited(), ...block.tags]),
      headings: stack.map((h) => h.line),
    });
    block = null;
  };

  lines.forEach((line, index) => {
    const level = code[index] ? 0 : headingLevel(line);
    if (level > 0) {
      closeBlock(index - 1);
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      const own = extractLineTags(line).map((m) => m.tag);
      units.push({
        kind: 'heading',
        startLine: index,
        endLine: index,
        ownTags: unique(own),
        tags: unique([...inherited(), ...own]),
        headings: stack.map((h) => h.line),
      });
      stack.push({ line: index, level, tags: own });
      return;
    }
    if (line.trim() === '' && !code[index]) {
      closeBlock(index - 1);
      return;
    }
    block ??= { start: index, tags: [] };
    if (!code[index]) block.tags.push(...extractLineTags(line).map((m) => m.tag));
  });
  closeBlock(lines.length - 1);
  return units;
}

/** The unit containing a line, if any (blank lines belong to none). */
export function unitAtLine(units: readonly Unit[], line: number): Unit | undefined {
  return units.find((unit) => unit.startLine <= line && line <= unit.endLine);
}
