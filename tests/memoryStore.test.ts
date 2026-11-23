import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/fs/memoryStore';
import { AlreadyExistsError, NotFoundError } from '../src/fs/store';

describe('MemoryStore', () => {
  it('writes, reads and lists files recursively', async () => {
    const store = new MemoryStore();
    await store.write('2026/11/2026-11-23.md', '## 14:52\nHello');
    await store.write('tags/project-x.md', 'Sheet');
    expect((await store.read('2026/11/2026-11-23.md')).text).toBe('## 14:52\nHello');
    expect((await store.list()).map((f) => f.path)).toEqual(['2026/11/2026-11-23.md', 'tags/project-x.md']);
    expect((await store.list('tags')).map((f) => f.path)).toEqual(['tags/project-x.md']);
    expect(await store.list('missing')).toEqual([]);
  });

  it('updates lastModified on every write', async () => {
    const store = new MemoryStore();
    const first = await store.write('a.md', '1');
    const second = await store.write('a.md', '2');
    expect(second.lastModified).toBeGreaterThan(first.lastModified);
  });

  it('reports missing files', async () => {
    const store = new MemoryStore();
    expect(await store.stat('nope.md')).toBeNull();
    await expect(store.read('nope.md')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('renames without overwriting', async () => {
    const store = new MemoryStore({ 'tags/a.md': 'A', 'tags/b.md': 'B' });
    await expect(store.rename('tags/a.md', 'tags/b.md')).rejects.toBeInstanceOf(AlreadyExistsError);
    await store.rename('tags/a.md', 'tags/c.md');
    expect(store.snapshot()).toEqual({ 'tags/b.md': 'B', 'tags/c.md': 'A' });
  });

  it('can simulate write failures', async () => {
    const store = new MemoryStore();
    store.failWrite = (path) => path === 'bad.md';
    await expect(store.write('bad.md', 'x')).rejects.toThrow();
    await store.write('good.md', 'x');
  });
});
