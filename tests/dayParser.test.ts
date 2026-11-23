import { describe, expect, it } from 'vitest';
import { noteAtLine, parseNotes, parseTimeHeader, splitLines } from '../src/model/dayParser';

const DAY = `## 14:52
Team sync on #project-x planning.

## 16:10
Idea: drag and drop images later.
- [ ] ping Paul about mockups #project-x
`;

describe('day parser', () => {
  it('recognizes note headers only when exact', () => {
    expect(parseTimeHeader('## 14:52')).toBe('14:52');
    expect(parseTimeHeader('## 14:52  ')).toBe('14:52');
    expect(parseTimeHeader('## 24:00')).toBeNull();
    expect(parseTimeHeader('### 14:52')).toBeNull();
    expect(parseTimeHeader('## 14:52 meeting')).toBeNull();
  });

  it('splits a day into notes', () => {
    const notes = parseNotes(splitLines(DAY));
    expect(notes).toEqual([
      { time: '14:52', startLine: 0, endLine: 2 },
      { time: '16:10', startLine: 3, endLine: 6 },
    ]);
    expect(noteAtLine(notes, 5)?.time).toBe('16:10');
  });

  it('keeps text written before the first header as an untimed note', () => {
    const notes = parseNotes(splitLines('\nfree text\n## 09:00\nnote'));
    expect(notes).toEqual([
      { time: null, startLine: 0, endLine: 1 },
      { time: '09:00', startLine: 2, endLine: 3 },
    ]);
  });

  it('handles empty files and CRLF line breaks', () => {
    expect(parseNotes(splitLines(''))).toEqual([]);
    expect(parseNotes(splitLines('## 08:00\r\nhello'))).toEqual([{ time: '08:00', startLine: 0, endLine: 1 }]);
  });
});
