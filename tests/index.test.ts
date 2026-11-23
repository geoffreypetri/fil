import { describe, expect, it } from 'vitest';
import { MemoryIndexCache } from '../src/index/cache';
import { buildIndex } from '../src/index/indexBuilder';
import { TagIndex } from '../src/index/tagIndex';
import { MemoryStore } from '../src/fs/memoryStore';
import { parseTaskLine, setTaskInText, setTaskLineDone } from '../src/model/actions';
import { indexDay } from '../src/model/dayIndex';
import { scanFolder } from '../src/model/folderScan';
import { TagTable } from '../src/model/tagTable';

const DAY_22 = `## 09:30
Team sync on #project-x planning.
- [ ] send minutes
- [x] book room

## 16:10
Idea for #fil.
- [ ] ping Paul about mockups #project-x
- [ ] unrelated task
`;

const DAY_23 = `## 10:00
#px follow-up
- [ ] review specs
\`\`\`
- [ ] not a task #project-x
\`\`\`
`;

describe('actions', () => {
  it('parses task lines', () => {
    expect(parseTaskLine('- [ ] todo')).toEqual({ done: false, text: 'todo', boxOffset: 3, markerLength: 6 });
    expect(parseTaskLine('  * [X] done')?.done).toBe(true);
    expect(parseTaskLine('- [] nope')).toBeNull();
    expect(setTaskLineDone('- [ ] a', true)).toBe('- [x] a');
    expect(setTaskLineDone('- [x] a', false)).toBe('- [ ] a');
  });

  it('checks the right line in a file', () => {
    expect(setTaskInText(DAY_22, 7, 'ping Paul about mockups #project-x', true)).toBe(
      DAY_22.replace('- [ ] ping Paul', '- [x] ping Paul'),
    );
  });

  it('finds the line again when the file shifted', () => {
    const shifted = `extra line\n${DAY_22}`;
    expect(setTaskInText(shifted, 7, 'ping Paul about mockups #project-x', true)).toBe(
      shifted.replace('- [ ] ping Paul', '- [x] ping Paul'),
    );
  });

  it('refuses to write when the line is gone or ambiguous', () => {
    expect(setTaskInText(DAY_22, 7, 'something else', true)).toBeNull();
    expect(setTaskInText('- [ ] a\n- [ ] a\n', 5, 'a', true)).toBeNull();
  });

  it('keeps CRLF line breaks', () => {
    expect(setTaskInText('x\r\n- [ ] a\r\n', 1, 'a', true)).toBe('x\r\n- [x] a\r\n');
  });
});

describe('day index', () => {
  it('indexes notes, tags and actions', () => {
    const entry = indexDay('2026-11-22', DAY_22, 1);
    expect(entry.notes.map((n) => [n.time, n.tags])).toEqual([
      ['09:30', ['project-x']],
      ['16:10', ['fil', 'project-x']],
    ]);
    expect(entry.actions.map((a) => [a.line, a.done, a.text, a.note])).toEqual([
      [2, false, 'send minutes', 0],
      [3, true, 'book room', 0],
      [7, false, 'ping Paul about mockups #project-x', 1],
      [8, false, 'unrelated task', 1],
    ]);
  });

  it('ignores tasks and tags in code blocks', () => {
    const entry = indexDay('2026-11-23', DAY_23, 1);
    expect(entry.actions.map((a) => a.text)).toEqual(['review specs']);
    expect(entry.notes[0]!.tags).toEqual(['px']);
  });
});

describe('tag index', () => {
  const index = new TagIndex();
  index.setMany([indexDay('2026-11-22', DAY_22, 1), indexDay('2026-11-23', DAY_23, 2)]);
  const plain = (raw: string): string => raw;
  const table = new TagTable([
    {
      name: 'project-x',
      path: 'tags/project-x.md',
      lastModified: 1,
      settings: { aliases: ['px'], archived: false },
    },
  ]);
  const resolve = (raw: string): string => table.canonical(raw);

  it('attaches actions to tags through their line or their note', () => {
    const actions = index.actionsFor(['project-x'], plain).map((a) => a.action.text);
    expect(actions).toEqual(['send minutes', 'book room', 'ping Paul about mockups #project-x', 'unrelated task']);
    expect(index.actionsFor(['fil'], plain).map((a) => a.action.text)).toEqual([
      'ping Paul about mockups #project-x',
      'unrelated task',
    ]);
  });

  it('resolves aliases at query time', () => {
    expect(index.actionsFor(['project-x'], resolve).map((a) => a.action.text)).toContain('review specs');
    expect(index.notesWith(['project-x'], resolve).map((n) => `${n.day} ${n.note.time}`)).toEqual([
      '2026-11-22 09:30',
      '2026-11-22 16:10',
      '2026-11-23 10:00',
    ]);
  });

  it('combines several tags with AND', () => {
    expect(index.notesWith(['project-x', 'fil'], resolve).map((n) => n.note.time)).toEqual(['16:10']);
    expect(index.actionsFor(['project-x', 'fil'], resolve).map((a) => a.time)).toEqual(['16:10', '16:10']);
  });

  it('computes usage for completion ordering', () => {
    const usage = index.usage(resolve);
    expect(usage.get('project-x')).toEqual({ notes: 3, lastUsed: '2026-11-23 10:00' });
    expect(usage.get('fil')).toEqual({ notes: 1, lastUsed: '2026-11-22 16:10' });
    expect(usage.has('px')).toBe(false);
  });

  it('counts raw tag usage', () => {
    expect(index.rawTagUsage('project-x')).toEqual({ notes: 2, days: ['2026-11-22'] });
  });
});

describe('index builder', () => {
  it('reads files once and then uses the cache', async () => {
    const store = new MemoryStore({
      '2026/11/2026-11-22.md': DAY_22,
      '2026/11/2026-11-23.md': DAY_23,
    });
    const cache = new MemoryIndexCache();
    const first = new TagIndex();
    expect(await buildIndex(store, await scanFolder(store), first, cache)).toEqual({ read: 2, cached: 0 });

    store.externalWrite('2026/11/2026-11-23.md', '## 11:00\n#new\n');
    const second = new TagIndex();
    expect(await buildIndex(store, await scanFolder(store), second, cache)).toEqual({ read: 1, cached: 1 });
    expect(second.get('2026-11-23')!.notes[0]!.tags).toEqual(['new']);
    expect(second.all().map((d) => d.day)).toEqual(['2026-11-22', '2026-11-23']);
  });
});
