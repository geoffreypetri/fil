/** A Markdown task line: "- [ ] text" or "- [x] text" (also with * or +, and indented). */
export const TASK_LINE = /^(\s*[-*+] \[)([ xX])(\] )(.*)$/;

export interface TaskLine {
  readonly done: boolean;
  readonly text: string;
  /** Offset of the box character (" " or "x") in the line. */
  readonly boxOffset: number;
  /** Length of the "- [ ] " marker. */
  readonly markerLength: number;
}

export function parseTaskLine(line: string): TaskLine | null {
  const match = TASK_LINE.exec(line);
  if (!match) return null;
  const [, before, box, after, text] = match as unknown as [string, string, string, string, string];
  return {
    done: box !== ' ',
    text,
    boxOffset: before.length,
    markerLength: before.length + box.length + after.length,
  };
}

export function setTaskLineDone(line: string, done: boolean): string {
  const task = parseTaskLine(line);
  if (!task) return line;
  return line.slice(0, task.boxOffset) + (done ? 'x' : ' ') + line.slice(task.boxOffset + 1);
}

/**
 * Checks or unchecks the task at `lineNumber` (0-based) in a file's text. The line must still
 * match `expectedText`, so a stale index never writes to the wrong line. Returns the new text,
 * or null when the line no longer matches.
 */
export function setTaskInText(
  text: string,
  lineNumber: number,
  expectedText: string,
  done: boolean,
): string | null {
  const lines = text.split('\n');
  const findLine = (): number => {
    const matches = (index: number): boolean => {
      const raw = lines[index];
      if (raw === undefined) return false;
      return parseTaskLine(raw.replace(/\r$/, ''))?.text === expectedText;
    };
    if (matches(lineNumber)) return lineNumber;
    // The file may have shifted slightly since it was indexed: look for a unique match.
    const candidates = lines.map((_, index) => index).filter(matches);
    return candidates.length === 1 ? candidates[0]! : -1;
  };
  const index = findLine();
  if (index === -1) return null;
  const line = lines[index]!;
  const carriageReturn = line.endsWith('\r') ? '\r' : '';
  lines[index] = setTaskLineDone(line.replace(/\r$/, ''), done) + carriageReturn;
  return lines.join('\n');
}
