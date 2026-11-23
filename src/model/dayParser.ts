/** A note header line: "## 14:52". */
export const TIME_HEADER = /^## ([01]\d|2[0-3]):([0-5]\d)[ \t]*$/;

export interface NoteBlock {
  /** "HH:MM", or null for text written before the first header of the file. */
  readonly time: string | null;
  /** First line of the note (its header line when it has one), 0-based. */
  readonly startLine: number;
  /** Last line of the note, inclusive. */
  readonly endLine: number;
}

export function parseTimeHeader(line: string): string | null {
  const match = TIME_HEADER.exec(line);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/**
 * Splits a day file into notes. Each note starts at a "## HH:MM" line.
 * Non-blank text before the first header becomes a note without time.
 */
export function parseNotes(lines: readonly string[]): NoteBlock[] {
  const notes: NoteBlock[] = [];
  let current: { time: string | null; startLine: number } | null = null;

  const close = (endLine: number): void => {
    if (current) notes.push({ ...current, endLine });
  };

  lines.forEach((line, index) => {
    const time = parseTimeHeader(line);
    if (time !== null) {
      close(index - 1);
      current = { time, startLine: index };
    } else if (!current && line.trim() !== '') {
      current = { time: null, startLine: 0 };
    }
  });
  close(lines.length - 1);
  return notes;
}

/** Returns the note containing the given line, if any. */
export function noteAtLine(notes: readonly NoteBlock[], line: number): NoteBlock | undefined {
  return notes.find((note) => note.startLine <= line && line <= note.endLine);
}
