import type { DayKey } from './paths';

/**
 * The editor shows one continuous document made of day segments:
 *
 *   ￼2026-11-22\n<content of 2026-11-22.md>\n￼2026-11-23\n<content of 2026-11-23.md>
 *
 * Each segment starts with a sentinel line (U+FFFC followed by the day key). The editor replaces
 * that line with the day separator widget and protects it from edits; it is never written to disk.
 * Because the document is self-describing, segments can always be recovered from its text.
 */
export const SENTINEL = '￼';

export interface DaySource {
  readonly day: DayKey;
  /** Segment content, as returned by `fileTextToContent`. */
  readonly content: string;
}

export interface Segment {
  readonly day: DayKey;
  /** Start of the sentinel line. */
  readonly sentinelFrom: number;
  /** Start of the content (just after the sentinel line break). */
  readonly from: number;
  /** End of the content (before the line break that precedes the next sentinel). */
  readonly to: number;
}

/** Normalizes a file for display: LF line breaks, one trailing newline removed, no sentinels. */
export function fileTextToContent(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replaceAll(SENTINEL, '');
  return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
}

/** Inverse of `fileTextToContent`: every non-empty file ends with a newline. */
export function contentToFileText(content: string): string {
  return content === '' ? '' : `${content}\n`;
}

export function sentinelLine(day: DayKey): string {
  return `${SENTINEL}${day}`;
}

export function segmentText(source: DaySource): string {
  return `${sentinelLine(source.day)}\n${source.content}`;
}

/** Builds the document text from days in chronological order. */
export function buildDocument(days: readonly DaySource[]): string {
  return days.map(segmentText).join('\n');
}

/** Recovers every segment from the document text. */
export function findSegments(text: string): Segment[] {
  const starts: { day: DayKey; sentinelFrom: number; from: number }[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const lineEnd = text.indexOf('\n', lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    if (text.charCodeAt(lineStart) === 0xfffc) {
      starts.push({
        day: text.slice(lineStart + 1, end),
        sentinelFrom: lineStart,
        from: Math.min(end + 1, text.length),
      });
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return { ...start, to: next ? next.sentinelFrom - 1 : text.length };
  });
}

/** The segment containing `pos` (a sentinel line belongs to its own segment). */
export function segmentAt(segments: readonly Segment[], pos: number): Segment | undefined {
  let low = 0;
  let high = segments.length - 1;
  let found: Segment | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle]!;
    if (segment.sentinelFrom <= pos) {
      found = segment;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Days whose content intersects any of the given [from, to] ranges. */
export function daysInRanges(
  segments: readonly Segment[],
  ranges: Iterable<{ from: number; to: number }>,
): Set<DayKey> {
  const days = new Set<DayKey>();
  for (const range of ranges) {
    for (const segment of segments) {
      if (segment.sentinelFrom > range.to) break;
      // A change at the line break just before the next sentinel still belongs to this segment.
      if (segment.to + 1 >= range.from) days.add(segment.day);
    }
  }
  return days;
}

export function segmentContent(text: string, segment: Segment): string {
  return text.slice(segment.from, segment.to);
}
