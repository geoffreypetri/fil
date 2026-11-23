import { parseTaskLine } from './actions';
import { parseNotes, splitLines } from './dayParser';
import type { DayKey } from './paths';
import { codeLines, extractTagsByLine } from './tags';

export interface NoteEntry {
  readonly time: string | null;
  readonly startLine: number;
  readonly endLine: number;
  /** Raw tags (as written, aliases not resolved), unique. */
  readonly tags: readonly string[];
}

export interface ActionEntry {
  /** 0-based line in the day file. */
  readonly line: number;
  readonly done: boolean;
  readonly text: string;
  /** Raw tags written on the action line itself. */
  readonly lineTags: readonly string[];
  /** Index of the note containing the action, or -1. */
  readonly note: number;
}

export interface DayEntry {
  readonly day: DayKey;
  readonly lastModified: number;
  readonly notes: readonly NoteEntry[];
  readonly actions: readonly ActionEntry[];
}

const unique = (values: Iterable<string>): string[] => [...new Set(values)];

/** Builds the index entry of one day file. */
export function indexDay(day: DayKey, text: string, lastModified: number): DayEntry {
  const lines = splitLines(text);
  const tagsByLine = extractTagsByLine(lines).map((matches) => matches.map((m) => m.tag));
  const notes: NoteEntry[] = parseNotes(lines).map((note) => ({
    ...note,
    tags: unique(tagsByLine.slice(note.startLine, note.endLine + 1).flat()),
  }));

  const code = codeLines(lines);
  const actions: ActionEntry[] = [];
  lines.forEach((line, index) => {
    const task = code[index] ? null : parseTaskLine(line);
    if (!task) return;
    actions.push({
      line: index,
      done: task.done,
      text: task.text,
      lineTags: unique(tagsByLine[index] ?? []),
      note: notes.findIndex((n) => n.startLine <= index && index <= n.endLine),
    });
  });
  return { day, lastModified, notes, actions };
}
