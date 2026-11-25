import { describe, expect, it } from 'vitest';
import { MemoryIndexCache } from '../src/index/cache';
import { buildIndex } from '../src/index/indexBuilder';
import { TagIndex } from '../src/index/tagIndex';
import { MemoryStore } from '../src/fs/memoryStore';
import { parseTaskLine, setTaskInText, setTaskLineDone } from '../src/model/actions';
import { indexPage } from '../src/model/pageIndex';
import { scanFolder } from '../src/model/folderScan';
import { TagTable } from '../src/model/tagTable';

const PAGE_A = `# Sync #project-x
Team sync, planning.
- [ ] send minutes
- [x] book room

## Ideas
Idea for #fil.
- [ ] ping Paul about mockups #project-x
- [ ] unrelated task
`;

const PAGE_B = `# Follow-up
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
    expect(setTaskInText(PAGE_A, 7, 'ping Paul about mockups #project-x', true)).toBe(
      PAGE_A.replace('- [ ] ping Paul', '- [x] ping Paul'),
    );
  });

  it('finds the line again when the file shifted', () => {
    const shifted = `extra line\n${PAGE_A}`;
    expect(setTaskInText(shifted, 7, 'ping Paul about mockups #project-x', true)).toBe(
      shifted.replace('- [ ] ping Paul', '- [x] ping Paul'),
    );
  });

  it('refuses to write when the line is gone or ambiguous', () => {
    expect(setTaskInText(PAGE_A, 7, 'something else', true)).toBeNull();
    expect(setTaskInText('- [ ] a\n- [ ] a\n', 5, 'a', true)).toBeNull();
  });

  it('keeps CRLF line breaks', () => {
    expect(setTaskInText('x\r\n- [ ] a\r\n', 1, 'a', true)).toBe('x\r\n- [x] a\r\n');
  });
});

describe('tag index', () => {
  const index = new TagIndex();
  index.setMany([indexPage('Sync.md', PAGE_A, 1), indexPage('Follow-up.md', PAGE_B, 2)]);
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

  it('attaches actions to tags through their line, paragraph or heading', () => {
    expect(index.actionsFor(['project-x'], plain).map((a) => a.action.text)).toEqual([
      'send minutes',
      'book room',
      'ping Paul about mockups #project-x',
      'unrelated task',
    ]);
    expect(index.actionsFor(['fil'], plain).map((a) => a.action.text)).toEqual([
      'ping Paul about mockups #project-x',
      'unrelated task',
    ]);
  });

  it('resolves aliases at query time', () => {
    expect(index.actionsFor(['project-x'], resolve).map((a) => a.action.text)).toContain('review specs');
    expect(index.notesWith(['project-x'], resolve).map((n) => `${n.path}:${n.note.startLine}`)).toEqual([
      'Follow-up.md:1',
      'Sync.md:0',
      'Sync.md:1',
      'Sync.md:5',
      'Sync.md:6',
    ]);
  });

  it('combines several tags with AND', () => {
    expect(index.actionsFor(['project-x', 'fil'], resolve).map((a) => a.action.line)).toEqual([7, 8]);
  });

  it('computes usage for completion ordering', () => {
    const usage = index.usage(resolve);
    expect(usage.get('project-x')).toEqual({ notes: 3, lastUsed: 2 });
    expect(usage.get('fil')).toEqual({ notes: 1, lastUsed: 1 });
    expect(usage.has('px')).toBe(false);
  });

  it('counts raw tag usage', () => {
    expect(index.rawTagUsage('project-x')).toEqual({ notes: 2, paths: ['Sync.md'] });
  });
});

describe('index builder', () => {
  it('reads files once and then uses the cache', async () => {
    const store = new MemoryStore({ 'Sync.md': PAGE_A, 'Follow-up.md': PAGE_B });
    const cache = new MemoryIndexCache();
    const first = new TagIndex();
    expect(await buildIndex(store, await scanFolder(store), first, cache)).toEqual({ read: 2, cached: 0 });

    store.externalWrite('Follow-up.md', '# Follow-up\n#new\n');
    const second = new TagIndex();
    expect(await buildIndex(store, await scanFolder(store), second, cache)).toEqual({ read: 1, cached: 1 });
    expect(second.get('Follow-up.md')!.notes.flatMap((n) => n.ownTags)).toEqual(['new']);
  });
});
