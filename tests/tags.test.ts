import { describe, expect, it } from 'vitest';
import { extractLineTags, extractTags, isValidTag, normalizeTag, normalizeTagChar } from '../src/model/tags';

describe('tag naming', () => {
  it('validates names', () => {
    expect(isValidTag('project-x')).toBe(true);
    expect(isValidTag('été2026')).toBe(true);
    expect(isValidTag('a')).toBe(true);
    expect(isValidTag('a'.repeat(40))).toBe(true);
    expect(isValidTag('a'.repeat(41))).toBe(false);
    expect(isValidTag('12')).toBe(false);
    expect(isValidTag('-x')).toBe(false);
    expect(isValidTag('Project')).toBe(false);
    expect(isValidTag('a_b')).toBe(false);
    expect(isValidTag('a/b')).toBe(false);
  });

  it('normalizes input', () => {
    expect(normalizeTag('#Project X')).toBe('project-x');
    expect(normalizeTag('  my_tag ')).toBe('my-tag');
    expect(normalizeTag('Été')).toBe('été');
    expect(normalizeTag('#12')).toBeNull();
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTagChar('A')).toBe('a');
    expect(normalizeTagChar('_')).toBe('-');
  });
});

describe('tag extraction', () => {
  const tags = (line: string): string[] => extractLineTags(line).map((m) => m.tag);

  it('finds tags in text', () => {
    expect(tags('Sync on #project-x with #fil.')).toEqual(['project-x', 'fil']);
    expect(tags('#start of line')).toEqual(['start']);
    expect(tags('(#paren) "#quoted"')).toEqual(['paren', 'quoted']);
    expect(tags('accents #réunion-été')).toEqual(['réunion-été']);
  });

  it('reports exact offsets', () => {
    expect(extractLineTags('ab #cd ef')).toEqual([{ tag: 'cd', from: 3, to: 6 }]);
  });

  it('ignores numbers, headings, words and invalid names', () => {
    expect(tags('issue #12 and # heading')).toEqual([]);
    expect(tags('C# and a#b')).toEqual([]);
    expect(tags('#Upper #camelCase')).toEqual([]);
    expect(tags(`#${'a'.repeat(41)}`)).toEqual([]);
  });

  it('ignores URLs and inline code', () => {
    expect(tags('see https://example.com/page#section and www.site.org/#x')).toEqual([]);
    expect(tags('[link](https://x.org/#anchor) `#notatag` #real')).toEqual(['real']);
  });

  it('ignores fenced code blocks', () => {
    const text = 'before #a\n```\n#notatag\n```\nafter #b\n~~~js\n#nope\n~~~';
    expect(extractTags(text)).toEqual(['a', 'b']);
  });
});
