import { describe, expect, it } from 'vitest';
import { splitAliasInput, validateAliases } from '../src/model/aliasRules';
import { parseSheet, splitFrontmatter, writeBody, writeSettings } from '../src/model/frontmatter';
import { TagTable, type SheetRecord, type TagSettings } from '../src/model/tagTable';

const SHEET = `---
color: indigo
aliases: [px, projetx]
label: Projet X — refonte interfaces
archived: false
publish: true # used by another tool
---
**State:** design in progress.

## Decisions
- V1 scope frozen.
`;

describe('front matter', () => {
  it('splits front matter and body', () => {
    const { yaml, body } = splitFrontmatter(SHEET);
    expect(yaml?.split('\n')[0]).toBe('color: indigo');
    expect(body.startsWith('**State:**')).toBe(true);
    expect(splitFrontmatter('no front matter')).toEqual({ yaml: null, body: 'no front matter' });
    expect(splitFrontmatter('---\nunclosed')).toEqual({ yaml: null, body: '---\nunclosed' });
    expect(splitFrontmatter('---\n---\nbody')).toEqual({ yaml: '', body: 'body' });
    expect(splitFrontmatter('---\r\na: 1\r\n---\r\nbody')).toEqual({ yaml: 'a: 1', body: 'body' });
  });

  it('parses known settings', () => {
    expect(parseSheet(SHEET).settings).toEqual({
      color: 'indigo',
      aliases: ['px', 'projetx'],
      label: 'Projet X — refonte interfaces',
      archived: false,
    });
  });

  it('ignores invalid values', () => {
    const { settings } = parseSheet('---\ncolor: "#ff0000"\naliases: "PX, bad!, 12"\narchived: yes\n---\n');
    expect(settings).toEqual({ color: undefined, aliases: ['px'], label: undefined, archived: false });
    expect(parseSheet('---\n: : broken [\n---\nbody').settings.aliases).toEqual([]);
  });

  it('rewrites only the front matter, keeping unknown keys, order and comments', () => {
    const next = writeSettings(SHEET, { color: 'teal', aliases: ['px'], archived: true });
    expect(next).toBe(`---
color: teal
aliases: [px]
archived: true
publish: true # used by another tool
---
**State:** design in progress.

## Decisions
- V1 scope frozen.
`);
  });

  it('creates a front matter on a sheet without one, and removes an empty one', () => {
    const settings: TagSettings = { color: 'red', aliases: [], label: 'Label', archived: false };
    expect(writeSettings('Body\n', settings)).toBe('---\ncolor: red\nlabel: Label\n---\nBody\n');
    expect(writeSettings('---\ncolor: red\n---\nBody\n', { aliases: [], archived: false })).toBe('Body\n');
    expect(writeSettings('', { aliases: ['a'], archived: false })).toBe('---\naliases: [a]\n---\n');
  });

  it('replaces the body only', () => {
    expect(writeBody(SHEET, 'New body\n')).toBe(`${SHEET.slice(0, SHEET.indexOf('**State'))}New body\n`);
    expect(writeBody('old', 'new')).toBe('new');
  });
});

const sheet = (name: string, settings: Partial<TagSettings> = {}): SheetRecord => ({
  name,
  path: `tags/${name}.md`,
  lastModified: 1,
  settings: { aliases: [], archived: false, ...settings },
});

describe('tag table', () => {
  it('resolves aliases to primary names', () => {
    const table = new TagTable([sheet('project-x', { aliases: ['px', 'projetx'], color: 'indigo' })]);
    expect(table.canonical('px')).toBe('project-x');
    expect(table.canonical('other')).toBe('other');
    expect(table.colorOf('px')).toBe('indigo');
    expect(table.info('project-x').aliases).toEqual(['px', 'projetx']);
    expect(table.conflicts).toEqual([]);
  });

  it('lets the first tag in alphabetical order win a disputed alias', () => {
    const table = new TagTable([sheet('zeta', { aliases: ['shared'] }), sheet('alpha', { aliases: ['shared'] })]);
    expect(table.canonical('shared')).toBe('alpha');
    expect(table.info('zeta').aliases).toEqual([]);
    expect(table.conflicts).toEqual([{ alias: 'shared', winner: 'alpha', loser: 'zeta' }]);
  });

  it('reports an alias that collides with another sheet', () => {
    const table = new TagTable([sheet('project-x', { aliases: ['px'] }), sheet('px')]);
    expect(table.canonical('px')).toBe('project-x');
    expect(table.conflicts).toEqual([{ alias: 'px', winner: 'project-x', loser: 'px' }]);
    const reversed = new TagTable([sheet('px'), sheet('zz', { aliases: ['px'] })]);
    expect(reversed.canonical('px')).toBe('px');
    expect(reversed.conflicts).toEqual([{ alias: 'px', winner: 'px', loser: 'zz' }]);
  });

  it('ignores invalid sheet names and aliases equal to the name', () => {
    const table = new TagTable([sheet('Bad Name'), sheet('ok', { aliases: ['ok'] })]);
    expect(table.sheetNames()).toEqual(['ok']);
    expect(table.info('ok').aliases).toEqual([]);
  });
});

describe('alias validation', () => {
  const table = new TagTable([sheet('project-x', { aliases: ['px'] }), sheet('fil', { aliases: ['app'] })]);
  const used = new Set(['project-x', 'px', 'fil', 'meeting']);

  it('accepts new, own and normalized aliases', () => {
    expect(validateAliases('project-x', splitAliasInput('px, #ProjetX, project-x'), table, used)).toEqual({
      aliases: ['px', 'projetx'],
      errors: [],
    });
  });

  it('rejects aliases owned by other tags or used in notes', () => {
    const result = validateAliases('project-x', ['app', 'fil', 'meeting', '12'], table, used);
    expect(result.aliases).toEqual([]);
    expect(result.errors).toEqual([
      { input: 'app', reason: 'taken', owner: 'fil' },
      { input: 'fil', reason: 'taken', owner: 'fil' },
      { input: 'meeting', reason: 'used' },
      { input: '12', reason: 'invalid' },
    ]);
  });
});
