import { describe, expect, it } from 'vitest';
import { dayKeyOf, parseTagSheetPath, tagSheetPath, timeOf } from '../src/model/paths';

describe('paths', () => {
  it('formats local dates and times', () => {
    const date = new Date(2026, 10, 25, 9, 5);
    expect(dayKeyOf(date)).toBe('2026-11-25');
    expect(timeOf(date)).toBe('09:05');
  });

  it('maps tag sheets', () => {
    expect(tagSheetPath('project-x')).toBe('tags/project-x.md');
    expect(parseTagSheetPath('tags/project-x.md')).toBe('project-x');
    expect(parseTagSheetPath('tags/sub/x.md')).toBeNull();
    expect(parseTagSheetPath('tags/_merged/x.md')).toBeNull();
  });
});
