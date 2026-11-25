# Fil

Fil is a free-form note-taking web app structured by `#tags`.

The whole screen is a single editor: one page of Markdown with no imposed structure. Each
`# Title` starts a page of its own, stored as its own file. Tags give each topic its own view — a
sheet describing its current state, its open actions and its history. Your notes are plain Markdown files in a folder you choose; Fil runs entirely in
your browser and makes no network request beyond loading the app.

- **Desktop only**: Chrome and Edge (it needs the File System Access API).
- **Local first**: no account, no server, no telemetry. Works offline once loaded.
- **Sync is yours**: point Fil at a folder synced by OneDrive, Dropbox, Syncthing… on each computer.

## Using Fil

| Action | How |
| --- | --- |
| New page | Type `# Title` on a line of its own. Everything up to the next `# …` belongs to it. |
| Writing helpers | Type `/` at the start of a line or after a space: `/today` (today's page, `# 2026-11-25`, or go to it if it exists), `/now` (`14:52`), `/date` (`2026-11-25`), `/note` (a `## 14:52` heading), `/todo` (`- [ ] `). Also in `Ctrl+K`. |
| Tag | Type `#` — completion suggests existing tags, most recently used first. |
| Action | Start a line with `- [ ] ` (or `/todo`). It is shown as a checkbox; `Enter` on an empty one ends the list. |
| Topic view | Click a tag, or `Ctrl+K` then the tag. `Shift`+click (or `Shift+Enter` in the palette) combines tags with AND. |
| Back to all notes | `Esc` |
| Select | `Ctrl+A` selects the paragraph; press again for its section(s), the page, then everything. |
| Commands | `Ctrl+K`: filter by tag, open a tag sheet, tag settings, rename a tag, undo the last rename, writing helpers, go to a page, theme, language, notes folder, what's new, version. |
| Place the cursor in a tag | `Alt`+click (a plain click opens the topic). |

Nothing is added automatically: no date, no time, no heading. For a chronological journal, start
each day with `/today` and each entry with `/note`.

The corner indicator shows `saved`, `saving…` or `error`; hover it for details (errors, conflict
copies, alias conflicts).

### Topic view

Opening a tag shows, in this order:

1. **The sheet** — free Markdown from `tags/<tag>.md`, edited in place (state, decisions,
   contacts…). The file is only created when you start typing. Click the header to change the
   tag's color, aliases, label or archive it.
2. **Open actions** — every `- [ ]` line that belongs to the tag (see *Notes* below). Checking
   one writes `- [x]` in the page it comes from. Done actions are folded.
3. **History** — the document itself, with notes that lack the tag folded into
   `⋯ N hidden notes` markers. It stays editable.

**Notes.** When the tag is in a heading (`## Meeting #client`), the note is the whole section:
everything under that heading, sub-sections included, down to the next heading of the same or a
higher level. A tag in a `# Title` therefore covers the whole page. Otherwise, the note is the
paragraph (lines without a blank line between them) where the tag is written. An action belongs
to a tag when its line, its paragraph or one of the headings it is under carries the tag.

When several tags are combined, there is no sheet: only actions and history.

## File format

```
<notes folder>/
  Inbox.md                 text written before the first heading
  2026-11-25.md            one file per "# Title"
  Project X.md
  index.md                 the order of the pages
  tags/
    project-x.md           one optional sheet per tag
  .fil/trash/              pages whose heading was deleted
```

A page is a Markdown file that starts with its heading:

```markdown
# 2026-11-25

## 14:52
Team sync on #project-x about the schedule. @Paul confirms the delivery.

## 16:10
Idea: #fil should support image drag and drop later.
- [ ] ping Paul about the mockups #project-x
```

**One heading, one file.** The file name is the title, without its tags and with the characters
that Windows, macOS or Linux forbid removed (`# Project X #work` → `Project X.md`). Two pages
with the same title get `Project X 2.md`.

- **Typing a new `# Title`** anywhere creates its file; the text below it moves into it.
- **Changing a title** renames the file, once the cursor has left the title line (not at every
  keystroke). A change of upper/lower case only keeps the file name, since Windows and macOS
  treat both as the same file.
- **Deleting a heading** merges its text into the page above and moves the file to
  `.fil/trash/<name> <date time>.md`. Nothing is lost.

**Order.** `index.md` lists the pages in display order as wiki links (`- [[Project X]]`), the
inbox first. Fil updates it as pages are created, renamed, moved or deleted; you can also reorder
its lines yourself. Pages that are not listed (created by another tool) are shown at the end.
`index.md` reads as a table of contents in Obsidian and other tools.

A Markdown file that does not start with a heading is shown under its file name as title, and the
heading is added to the file the first time you edit it. Files in subfolders are ignored.

A tag sheet starts with optional front matter holding the tag's parameters, followed by free
Markdown:

```markdown
---
color: indigo
aliases: [px, projetx]
label: Project X — interface redesign
archived: false
---
**State:** design in progress. Acceptance planned mid-January.

## Decisions
- V1 scope frozen at kick-off (Nov 20).
```

| Parameter | Meaning |
| --- | --- |
| `color` | One of `gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `indigo`, `violet`, `pink`. Each has light and dark variants with a contrast ratio of at least 4.5:1. Without it, the color is derived from the tag name. |
| `aliases` | Other names for the tag. `#px` in a note counts as `#project-x` everywhere; the note text is never rewritten. An alias cannot be another tag or another tag's alias. |
| `label` | Long name shown in the topic view and the palette. |
| `archived` | The tag still works but is no longer suggested by completion and sorts last in the palette. |

Unknown keys, their order and comments are preserved when Fil rewrites the front matter, so
sheets stay compatible with Obsidian and other tools. If two sheets claim the same alias, the
first tag in alphabetical order wins and the status indicator reports the conflict.

### Tag names

`#` followed by 1 to 40 lowercase letters (accents allowed), digits or hyphens, starting with a
letter: `#[\p{Ll}][\p{Ll}\p{N}-]{0,39}`. Typing is normalized (`#Projet_X` becomes
`#projet-x`), so a tag is always a valid file name. `#12`, `#` inside a URL and `#` inside code
are not tags.

### Renaming and merging

`Ctrl+K` → *Rename #tag…* shows how many notes and pages are concerned, then offers:

- **Rename and keep the old name as an alias** (default): only the sheet changes; no note is rewritten.
- **Rename everywhere**: `#old` is replaced by `#new` in every page (whole tags only).

The old tag's aliases always follow. If `#new` already exists, the tags are merged: aliases are
combined, the old sheet's body is appended under `## Merged from #old`, and the target keeps its
color and label. The old sheet is kept in `tags/_merged/`. Nothing is deleted. If anything fails
midway, every file already changed is restored; *Undo last rename* reverts the operation while
the app stays open.

### Working with other tools and sync services

- Files changed elsewhere are re-read when the window regains focus and every 30 seconds. A page
  created elsewhere appears at the end; a page deleted elsewhere leaves the document.
- If a file changed on disk while you had unsaved edits in it, your version is saved and the
  disk version is kept next to it as `<name> (conflicted copy <date> fil).md`.
- Conflict copies created by sync services (`… (conflicted copy …).md`, `… (1).md`,
  Syncthing's `.sync-conflict-…`) are reported, never read as notes or overwritten.

## Development

Requires Node.js 22.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. In development only, `http://localhost:5173/?opfs` runs the app on
the browser's private file system instead of a picked folder, which is handy for quick tests.

```bash
npm test
```

```bash
npm run build
```

The static build goes to `dist/`; `npm run preview` serves it at http://localhost:4173/fil/.

### Project layout

```
src/
  main.ts              boot: browser check, folder permission, app start
  app.ts               wires the modules together
  fs/                  FileStore interface, File System Access and in-memory implementations
  model/               pure logic: pages and index.md, note units, tags, actions, front matter,
                       tag table, palette, rename/merge
  index/               tag & action index, IndexedDB cache
  journal/             editor ↔ page files (PageSync), navigation, progressive loading,
                       action toggling, session restore
  editor/              CodeMirror extensions (pages, tags, checkboxes, helpers, topic filter…)
  sync/                debounced saver, status, external change watcher
  tags/                tag service (sheets, table, index updates), rename service
  ui/                  setup screen, status indicator, palette, dialogs, topic view
  i18n/                interface strings (en.ts is the reference) and Intl formatting
tests/                 Vitest unit tests, run against the in-memory file store
```

How it works, in short:

- The editor shows one document: the inbox, then the pages in `index.md` order. A state field
  follows each page's `# Title` line through edits; `PageSync` writes the files of the pages an
  edit touches, 800 ms after the last keystroke, and creates, renames or trashes files as
  headings appear, change or disappear. All disk operations go through one queue.
- The last 30 pages are loaded at startup; earlier pages load as you scroll up, without moving
  the text on screen.
- A background **index** of every page (notes, tags, actions with file and line) is cached in
  IndexedDB and invalidated by `lastModified`. Aliases are resolved at query time.
- A **service worker** caches the app for offline use and keeps it up to date on its own: the
  online version is checked at launch, every 30 minutes and when the window regains focus. A new
  version is downloaded in the background and applied when it cannot disturb you — the window
  is in the background, you have not typed or clicked for 10 minutes, or the app has just been
  launched. Edits are saved first, and the cursor, scroll position and topic view are restored.
  A discreet notice then links to *What's new*.
- **What's new** (`Ctrl+K` → *What's new*) shows `CHANGELOG.md`, bundled with the app. Add an
  entry there and bump the version in `package.json` for every user-visible change.

### Adding a language

Interface strings live in `src/i18n/en.ts`, the reference and fallback. To add French, create
`src/i18n/fr.ts` exporting a `Partial<Messages>`, then register it in `src/i18n/index.ts`
(`fr: { tag: 'fr-FR', messages: fr }`). It then appears under *Language…* in the palette. Dates
are always written `YYYY-MM-DD`, whatever the language.

## Deployment

Every push runs `.github/workflows/deploy.yml`: tests on every branch, then build and deployment
to GitHub Pages from the repository's default branch. One-time setup: in the repository, open *Settings → Pages* and set *Source* to
*GitHub Actions*.

The build uses the repository name as base path (`/fil/`). Set `BASE_PATH=/` when building for a
custom domain. The version shown in the palette is the `package.json` version plus the commit
hash.
