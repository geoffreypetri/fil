import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { segmentExtensions } from '../src/editor/segmentField';
import { fromDayOffset, toDayOffset } from '../src/journal/sessionRestore';
import { buildDocument } from '../src/model/segments';
import { IDLE_RELOAD_MS, mayReload } from '../src/sw/updater';

describe('automatic update policy', () => {
  const base = { updateReady: true, hidden: false, now: 1_000_000, lastActivity: null, startedAt: 1_000_000 - 60_000 };

  it('never reloads without a waiting update', () => {
    expect(mayReload({ ...base, updateReady: false, hidden: true })).toBe(false);
  });

  it('reloads while the window is in the background', () => {
    expect(mayReload({ ...base, hidden: true, lastActivity: base.now - 1000 })).toBe(true);
  });

  it('waits for 10 minutes of inactivity when the window is visible', () => {
    expect(mayReload({ ...base, lastActivity: base.now - 5_000 })).toBe(false);
    expect(mayReload({ ...base, lastActivity: base.now - IDLE_RELOAD_MS })).toBe(true);
  });

  it('applies an update found right after launch, before any input', () => {
    expect(mayReload({ ...base, startedAt: base.now - 3_000 })).toBe(true);
    expect(mayReload({ ...base, startedAt: base.now - 60_000 })).toBe(false);
  });
});

describe('position kept across a reload', () => {
  const days = [
    { day: '2026-11-24', content: '## 10:00\nyesterday' },
    { day: '2026-11-25', content: '## 09:00\ntoday text' },
  ];
  const stateOf = (list: typeof days): EditorState =>
    EditorState.create({ doc: buildDocument(list), extensions: segmentExtensions() });

  it('maps a position to its day and back, even when older days are added', () => {
    const before = stateOf(days);
    const pos = before.doc.toString().indexOf('text');
    const saved = toDayOffset(before, pos);
    expect(saved).toEqual({ day: '2026-11-25', offset: 'today '.length + '## 09:00\n'.length });
    const after = stateOf([{ day: '2026-11-01', content: 'older' }, ...days]);
    expect(after.sliceDoc(fromDayOffset(after, saved)!, fromDayOffset(after, saved)! + 4)).toBe('text');
    expect(fromDayOffset(after, { day: '2026-01-01', offset: 3 })).toBeNull();
  });
});
