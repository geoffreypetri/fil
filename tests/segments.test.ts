import { describe, expect, it } from 'vitest';
import {
  SENTINEL,
  buildDocument,
  contentToFileText,
  daysInRanges,
  fileTextToContent,
  findSegments,
  segmentAt,
  segmentContent,
} from '../src/model/segments';

const days = [
  { day: '2026-11-21', content: '## 10:00\nfirst' },
  { day: '2026-11-22', content: '' },
  { day: '2026-11-23', content: '## 14:52\nsecond\n\n## 16:10\nthird' },
];

describe('segments', () => {
  it('round-trips file text', () => {
    expect(fileTextToContent('a\nb\n')).toBe('a\nb');
    expect(contentToFileText('a\nb')).toBe('a\nb\n');
    expect(contentToFileText(fileTextToContent('a\n\n'))).toBe('a\n\n');
    expect(fileTextToContent('a\r\nb\r\n')).toBe('a\nb');
    expect(contentToFileText('')).toBe('');
    expect(fileTextToContent(`x${SENTINEL}y`)).toBe('xy');
  });

  it('builds a document and recovers every segment', () => {
    const text = buildDocument(days);
    const segments = findSegments(text);
    expect(segments.map((s) => s.day)).toEqual(days.map((d) => d.day));
    expect(segments.map((s) => segmentContent(text, s))).toEqual(days.map((d) => d.content));
  });

  it('finds the segment at a position', () => {
    const text = buildDocument(days);
    const segments = findSegments(text);
    expect(segmentAt(segments, 0)?.day).toBe('2026-11-21');
    expect(segmentAt(segments, text.indexOf('second'))?.day).toBe('2026-11-23');
    expect(segmentAt(segments, text.length)?.day).toBe('2026-11-23');
  });

  it('attributes an edit to the day it touches only', () => {
    const original = buildDocument(days);
    const at = original.indexOf('second') + 'second'.length;
    const edited = `${original.slice(0, at)} edited${original.slice(at)}`;
    const segments = findSegments(edited);
    expect([...daysInRanges(segments, [{ from: at, to: at + 7 }])]).toEqual(['2026-11-23']);
    expect(segmentContent(edited, segments[2]!)).toBe('## 14:52\nsecond edited\n\n## 16:10\nthird');
    expect(segmentContent(edited, segments[0]!)).toBe('## 10:00\nfirst');
  });

  it('attributes typing at the end of a segment to that segment', () => {
    const text = buildDocument(days);
    const segments = findSegments(text);
    const endOfFirst = segments[0]!.to;
    expect([...daysInRanges(segments, [{ from: endOfFirst, to: endOfFirst }])]).toEqual(['2026-11-21']);
    // Typing in the empty second day.
    const emptyDay = segments[1]!;
    expect([...daysInRanges(segments, [{ from: emptyDay.from, to: emptyDay.from }])]).toEqual(['2026-11-22']);
  });
});
