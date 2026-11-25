import { parseTaskLine } from './actions';
import { codeLines, extractLineTags } from './tags';
import { parseUnits, unitAtLine } from './units';

export interface NoteEntry {
  readonly startLine: number;
  readonly endLine: number;
  /** Tags applying to the note (own and inherited from headings), raw (aliases not resolved). */
  readonly tags: readonly string[];
  /** Tags written in the note itself. */
  readonly ownTags: readonly string[];
}

export interface ActionEntry {
  /** 0-based line in the page file. */
  readonly line: number;
  readonly done: boolean;
  readonly text: string;
  /** Tags of the action: its line, its paragraph and the headings it is under. */
  readonly tags: readonly string[];
}

export interface PageEntry {
  /** File path, e.g. "Project X.md". */
  readonly path: string;
  readonly lastModified: number;
  /** Units that carry at least one tag. */
  readonly notes: readonly NoteEntry[];
  readonly actions: readonly ActionEntry[];
}

const unique = (values: Iterable<string>): string[] => [...new Set(values)];

/** Builds the index entry of one page file. */
export function indexPage(path: string, text: string, lastModified: number): PageEntry {
  const lines = text.split(/\r\n|\r|\n/);
  const units = parseUnits(lines);
  const code = codeLines(lines);
  const notes: NoteEntry[] = units
    .filter((unit) => unit.tags.length > 0)
    .map((unit) => ({ startLine: unit.startLine, endLine: unit.endLine, tags: unit.tags, ownTags: unit.ownTags }));

  const actions: ActionEntry[] = [];
  lines.forEach((line, index) => {
    const task = code[index] ? null : parseTaskLine(line);
    if (!task) return;
    const unit = unitAtLine(units, index);
    actions.push({
      line: index,
      done: task.done,
      text: task.text,
      tags: unique([...extractLineTags(line).map((m) => m.tag), ...(unit?.tags ?? [])]),
    });
  });
  return { path, lastModified, notes, actions };
}
