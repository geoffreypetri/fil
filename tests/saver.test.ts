import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isConflictFile } from '../src/fs/conflicts';
import { MemoryStore } from '../src/fs/memoryStore';
import { Saver } from '../src/sync/saver';
import type { SaveState } from '../src/sync/status';

describe('Saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces writes per file', async () => {
    const store = new MemoryStore();
    const states: SaveState[] = [];
    const saver = new Saver(store, { delayMs: 800, onState: (s) => states.push(s) });
    let text = 'a';
    saver.schedule('x.md', () => text);
    await vi.advanceTimersByTimeAsync(500);
    text = 'ab';
    saver.schedule('x.md', () => text);
    await vi.advanceTimersByTimeAsync(500);
    expect(await store.stat('x.md')).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(store.snapshot()).toEqual({ 'x.md': 'ab' });
    expect(states.at(-1)).toBe('saved');
    expect(states).toContain('saving');
  });

  it('only writes the files that changed', async () => {
    const store = new MemoryStore({ 'a.md': 'A', 'b.md': 'B' });
    const write = vi.spyOn(store, 'write');
    const saver = new Saver(store);
    for (const file of await store.list()) saver.track(file.path, file.lastModified, 'A');
    saver.schedule('a.md', () => 'A2');
    await saver.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual({ 'a.md': 'A2', 'b.md': 'B' });
  });

  it('preserves the disk version as a conflict copy when it changed meanwhile', async () => {
    const store = new MemoryStore({ 'd.md': 'base' });
    const saver = new Saver(store, { now: () => new Date(2026, 10, 23, 14, 52, 0) });
    saver.track('d.md', (await store.stat('d.md'))!.lastModified, 'base');
    store.externalWrite('d.md', 'from another computer');
    saver.schedule('d.md', () => 'local edit');
    await saver.flush();
    const files = store.snapshot();
    expect(files['d.md']).toBe('local edit');
    const copy = Object.keys(files).find((path) => path !== 'd.md')!;
    expect(copy).toBe('d (conflicted copy 2026-11-23 145200 fil).md');
    expect(files[copy]).toBe('from another computer');
    expect(isConflictFile(copy)).toBe(true);
  });

  it('reports errors and retries on flush', async () => {
    const store = new MemoryStore();
    const states: SaveState[] = [];
    const saver = new Saver(store, { onState: (s) => states.push(s) });
    store.failWrite = () => true;
    saver.schedule('x.md', () => 'x');
    await saver.flush();
    expect(states.at(-1)).toBe('error');
    store.failWrite = null;
    await saver.flush();
    expect(states.at(-1)).toBe('saved');
    expect(store.snapshot()).toEqual({ 'x.md': 'x' });
  });
});

describe('conflict detection', () => {
  it('recognizes conflict copies from sync tools', () => {
    expect(isConflictFile('Notes (conflicted copy 2026-11-24).md')).toBe(true);
    expect(isConflictFile('Notes (1).md')).toBe(true);
    expect(isConflictFile('Notes-DESKTOP-conflict.md')).toBe(true);
    expect(isConflictFile('Notes.sync-conflict-20261123-145200-ABC.md')).toBe(true);
    expect(isConflictFile('Notes.md')).toBe(false);
    expect(isConflictFile('Conflict resolution.md')).toBe(false);
    expect(isConflictFile('tags/project-x.md')).toBe(false);
  });
});
