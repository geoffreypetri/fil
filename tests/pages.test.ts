import { describe, expect, it } from 'vitest';
import { isConflictFile } from '../src/fs/conflicts';
import { classifyFiles } from '../src/model/folderScan';
import { indexPage } from '../src/model/pageIndex';
import {
  orderPages,
  pageDisplayText,
  pageFileText,
  pageNameOf,
  parseH1,
  parseIndex,
  titleToName,
  trashPath,
  uniqueName,
  writeIndex,
} from '../src/model/pages';
import { headingLevel, parseUnits } from '../src/model/units';

describe('page headings and names', () => {
  it('recognizes level-1 headings only', () => {
    expect(parseH1('# 2026-11-25')).toBe('2026-11-25');
    expect(parseH1('#   Project X  ')).toBe('Project X');
    expect(parseH1('# Title ##')).toBe('Title');
    expect(parseH1('#tag')).toBeNull();
    expect(parseH1('# ')).toBeNull();
    expect(parseH1('## Section')).toBeNull();
  });

  it('turns titles into portable file names', () => {
    expect(titleToName('2026-11-25')).toBe('2026-11-25');
    expect(titleToName('Projet X — réunion #fil')).toBe('Projet X — réunion');
    expect(titleToName('a/b: c? "d" <e> | [f]')).toBe('a b c d e f');
    expect(titleToName('Notes (2)')).toBe('Notes 2');
    expect(titleToName('Ends with dot.')).toBe('Ends with dot');
    expect(titleToName('#only-a-tag')).toBe('Untitled');
    expect(titleToName('CON')).toBe('CON _');
    expect(titleToName('x'.repeat(200)).length).toBe(120);
  });

  it('makes names unique, ignoring case, with reserved names', () => {
    expect(uniqueName('Project', ['project'])).toBe('Project 2');
    expect(uniqueName('Project', ['Project', 'Project 2'])).toBe('Project 3');
    expect(uniqueName('Inbox', [])).toBe('Inbox 2');
    expect(uniqueName('Index', [])).toBe('Index 2');
    expect(uniqueName('Free', ['Other'])).toBe('Free');
  });

  it('finds pages among files', () => {
    expect(pageNameOf('Project X.md')).toBe('Project X');
    expect(pageNameOf('index.md')).toBeNull();
    expect(pageNameOf('tags/x.md')).toBeNull();
    expect(pageNameOf('2026/11/2026-11-25.md')).toBeNull();
    expect(pageNameOf('Notes (1).md')).toBeNull();
    expect(pageNameOf('image.png')).toBeNull();
    expect(isConflictFile('Conflict resolution.md')).toBe(false);
  });

  it('adds a heading to files that have none, except the inbox', () => {
    expect(pageDisplayText('Notes', 'Some text\n')).toBe('# Notes\nSome text');
    expect(pageDisplayText('Notes', '# Real title\nx\n')).toBe('# Real title\nx');
    expect(pageDisplayText('Inbox', 'loose text\n')).toBe('loose text');
    expect(pageDisplayText('Empty', '')).toBe('# Empty');
    expect(pageFileText('# A\nb')).toBe('# A\nb\n');
  });

  it('names trashed pages with a time stamp', () => {
    expect(trashPath('Project', new Date(2026, 10, 25, 19, 42, 5))).toBe('.fil/trash/Project 2026-11-25 194205.md');
  });
});

describe('index.md', () => {
  it('round-trips the page order', () => {
    const text = writeIndex(['Inbox', '2026-11-24', 'Project X']);
    expect(parseIndex(text)).toEqual(['Inbox', '2026-11-24', 'Project X']);
    expect(parseIndex('- [[A]]\n* [[B|alias]]\nnot a link\n- [[a]]')).toEqual(['A', 'B']);
  });

  it('orders pages: inbox, index order, then new files by modification time', () => {
    const files = [
      { name: 'Later', lastModified: 30 },
      { name: 'B', lastModified: 5 },
      { name: 'Inbox', lastModified: 1 },
      { name: 'A', lastModified: 9 },
      { name: 'Earlier', lastModified: 20 },
    ];
    expect(orderPages(['B', 'Gone', 'a'], files)).toEqual(['Inbox', 'B', 'A', 'Earlier', 'Later']);
  });

  it('classifies folder files', () => {
    const scan = classifyFiles([
      { path: 'index.md', lastModified: 1, size: 1 },
      { path: 'Project.md', lastModified: 1, size: 1 },
      { path: 'Project (1).md', lastModified: 1, size: 1 },
      { path: 'tags/project.md', lastModified: 1, size: 1 },
      { path: '2026/11/2026-11-25.md', lastModified: 1, size: 1 },
    ]);
    expect(scan.pages.map((p) => p.name)).toEqual(['Project']);
    expect(scan.index?.path).toBe('index.md');
    expect(scan.sheets.map((s) => s.stem)).toEqual(['project']);
    expect(scan.conflicts.map((c) => c.path)).toEqual(['Project (1).md']);
  });
});

const PAGE = `# Project X #work
Intro paragraph.

## Meeting #client
Discussed scope.
- [ ] send minutes

### Details
Budget is fine.

## Ideas
Random idea with #fil
and its second line.
- [ ] try it

Unrelated paragraph.
\`\`\`
# not a heading #nope
\`\`\``;

describe('note units', () => {
  const units = parseUnits(PAGE.split('\n'));
  const describe_ = (line: number) => units.find((u) => u.startLine <= line && line <= u.endLine);

  it('detects headings outside code', () => {
    expect(headingLevel('### Details')).toBe(3);
    expect(headingLevel('#tag')).toBe(0);
    expect(units.filter((u) => u.kind === 'heading').map((u) => u.startLine)).toEqual([0, 3, 7, 10]);
  });

  it('applies a heading tag to its whole section, sub-sections included', () => {
    expect(describe_(4)!.tags).toEqual(['work', 'client']);
    expect(describe_(8)!.tags).toEqual(['work', 'client']);
    expect(describe_(11)!.tags).toEqual(['work', 'fil']);
    expect(describe_(15)!.tags).toEqual(['work']);
  });

  it('uses the paragraph when the tag is in the text', () => {
    const idea = describe_(11)!;
    expect([idea.startLine, idea.endLine]).toEqual([11, 13]);
    expect(idea.ownTags).toEqual(['fil']);
  });

  it('ignores tags in code blocks', () => {
    expect(describe_(17)!.tags).toEqual(['work']);
  });

  it('indexes notes and actions with their tags', () => {
    const entry = indexPage('Project X.md', PAGE, 7);
    expect(entry.actions.map((a) => [a.line, a.text, a.tags])).toEqual([
      [5, 'send minutes', ['work', 'client']],
      [13, 'try it', ['work', 'fil']],
    ]);
    expect(entry.notes.some((n) => n.ownTags.includes('nope'))).toBe(false);
  });
});
