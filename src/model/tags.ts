/**
 * Tag naming rules: "#" followed by 1–40 lowercase letters (accents allowed), digits and hyphens,
 * starting with a letter. A tag is therefore always a valid file name: tags/<tag>.md.
 */
export const TAG_NAME = /^[\p{Ll}][\p{Ll}\p{N}-]{0,39}$/u;
export const MAX_TAG_LENGTH = 40;

/** A tag in text: not glued to a preceding word, and not followed by more name characters. */
const TAG_IN_TEXT = /(?<![\p{L}\p{N}_&/#])#([\p{Ll}][\p{Ll}\p{N}-]{0,39})(?![\p{L}\p{N}_-])/gu;

/** Ranges where "#" never starts a tag: inline code, URLs, Markdown link destinations. */
const MASKS: readonly RegExp[] = [
  /(`+)[^`]*?\1/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]*/gi,
  /\bwww\.[^\s<>()]*/gi,
  /\]\([^)]*\)/g,
];

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export interface TagMatch {
  /** Tag name without "#". */
  readonly tag: string;
  /** Offset of "#" in the searched text. */
  readonly from: number;
  /** Offset just after the tag name. */
  readonly to: number;
}

export function isValidTag(name: string): boolean {
  return TAG_NAME.test(name);
}

/**
 * Normalizes user input into a tag name: strips "#", lowercases, turns spaces and "_" into "-".
 * Returns null when the result is not a valid tag.
 */
export function normalizeTag(input: string): string | null {
  const name = input
    .trim()
    .replace(/^#+/, '')
    .toLocaleLowerCase()
    .replace(/[\s_]+/g, '-');
  return isValidTag(name) ? name : null;
}

/** Normalizes one typed character inside a tag: uppercase → lowercase, "_" or space → "-". */
export function normalizeTagChar(char: string): string {
  if (char === '_' || char === ' ') return '-';
  return char.toLocaleLowerCase();
}

function maskedRanges(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const mask of MASKS) {
    mask.lastIndex = 0;
    for (const match of line.matchAll(mask)) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/** Tags of a single line, ignoring inline code and URLs. Offsets are relative to the line. */
export function extractLineTags(line: string): TagMatch[] {
  if (!line.includes('#')) return [];
  const masks = maskedRanges(line);
  const result: TagMatch[] = [];
  TAG_IN_TEXT.lastIndex = 0;
  for (const match of line.matchAll(TAG_IN_TEXT)) {
    const from = match.index;
    if (masks.some(([start, end]) => from >= start && from < end)) continue;
    result.push({ tag: match[1]!, from, to: from + match[0].length });
  }
  return result;
}

/** For each line, whether it belongs to a fenced code block (fence lines included). */
export function codeLines(lines: readonly string[]): boolean[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker[0]!.repeat(3);
      else if (marker.startsWith(fence)) fence = null;
      return true;
    }
    return fence !== null;
  });
}

/** Tags of each line of a text, skipping fenced code blocks. Returns one array per line. */
export function extractTagsByLine(lines: readonly string[]): TagMatch[][] {
  const code = codeLines(lines);
  return lines.map((line, index) => (code[index] ? [] : extractLineTags(line)));
}

/** Unique tag names of a text, in order of first appearance. */
export function extractTags(text: string): string[] {
  const seen = new Set<string>();
  for (const line of extractTagsByLine(text.split(/\r\n|\r|\n/))) {
    for (const match of line) seen.add(match.tag);
  }
  return [...seen];
}
