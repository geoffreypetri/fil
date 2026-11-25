import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { pagesField } from '../src/editor/pageField';
import { buildDocument } from '../src/journal/pageSync';
import { fromPageOffset, toPageOffset } from '../src/journal/sessionRestore';
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
  const stateOf = (inbox: string, pages: { name: string; content: string }[]): EditorState => {
    const built = buildDocument(inbox, pages);
    return EditorState.create({ doc: built.doc, extensions: pagesField.init(() => built.pages) });
  };
  const pages = [
    { name: 'Yesterday', content: '# Yesterday\nold' },
    { name: 'Today', content: '# Today\ntoday text' },
  ];

  it('maps a position to its page and back, even when earlier pages are added', () => {
    const before = stateOf('', pages);
    const pos = before.doc.toString().indexOf('text');
    const saved = toPageOffset(before, pos);
    expect(saved).toEqual({ page: 'Today', offset: '# Today\ntoday '.length });
    const after = stateOf('inbox', [{ name: 'Earlier', content: '# Earlier' }, ...pages]);
    const restored = fromPageOffset(after, saved)!;
    expect(after.sliceDoc(restored, restored + 4)).toBe('text');
    expect(fromPageOffset(after, { page: 'Gone', offset: 3 })).toBeNull();
    expect(toPageOffset(after, 2)).toEqual({ page: 'Inbox', offset: 2 });
  });
});
