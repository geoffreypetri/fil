import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKeyOf,
  dayPath,
  isDayKey,
  parseDayPath,
  parseTagSheetPath,
  tagSheetPath,
  timeOf,
} from '../src/model/paths';

describe('paths', () => {
  it('maps days to files and back', () => {
    expect(dayPath('2026-11-23')).toBe('2026/11/2026-11-23.md');
    expect(parseDayPath('2026/11/2026-11-23.md')).toBe('2026-11-23');
  });

  it('rejects non-canonical day paths', () => {
    expect(parseDayPath('2026/10/2026-11-23.md')).toBeNull();
    expect(parseDayPath('2026/11/2026-11-31.md')).toBeNull();
    expect(parseDayPath('2026/11/2026-11-23 (1).md')).toBeNull();
    expect(parseDayPath('notes/2026-11-23.md')).toBeNull();
  });

  it('formats local days and times', () => {
    const date = new Date(2026, 10, 23, 9, 5);
    expect(dayKeyOf(date)).toBe('2026-11-23');
    expect(timeOf(date)).toBe('09:05');
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('maps tag sheets', () => {
    expect(tagSheetPath('project-x')).toBe('tags/project-x.md');
    expect(parseTagSheetPath('tags/project-x.md')).toBe('project-x');
    expect(parseTagSheetPath('tags/sub/x.md')).toBeNull();
  });
});
