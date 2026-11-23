# Fil

Fil is a free-form, chronological note-taking web app structured by `#tags`.

The whole screen is a single editor: past notes above, the note you are writing at the bottom.
Tags give each topic its own view — a sheet describing its current state, its open actions and
its history. Your notes are plain Markdown files in a folder you choose; Fil runs entirely in
your browser and makes no network request beyond loading the app.

- **Desktop only**: Chrome and Edge (it needs the File System Access API).
- **Local first**: no account, no server, no telemetry. Works offline once loaded.
- **Sync is yours**: point Fil at a folder synced by OneDrive, Dropbox, Syncthing… on each computer.

## Using Fil

| Action | How |
| --- | --- |
| New note | On an empty last line press `Enter`, or press `Ctrl+Enter` anywhere. The time stamp is inserted for you. |
| Tag | Type `#` — completion suggests existing tags, most recently used first. |
| Action | Start a line with `- [ ] `. It is shown as a checkbox. |
| Topic view | Click a tag, or `Ctrl+K` then the tag. `Shift`+click (or `Shift+Enter` in the palette) combines tags with AND. |
| Back to the journal | `Esc` |
| Commands | `Ctrl+K`: filter by tag, open a tag sheet, tag settings, rename a tag, undo the last rename, go to a date, theme, language, notes folder, version. |
| Place the cursor in a tag | `Alt`+click (a plain click opens the topic). |

The corner indicator shows `saved`, `saving…` or `error`; hover it for details (errors, conflict
copies, alias conflicts).

### Topic view

Opening a tag shows, in this order:

1. **The sheet** — free Markdown from `tags/<tag>.md`, edited in place (state, decisions,
   contacts…). The file is only created when you start typing. Click the header to change the
   tag's color, aliases, label or archive it.
2. **Open actions** — every `- [ ]` line that contains the tag or belongs to a note that does.
   Checking one writes `- [x]` in the day file it comes from. Done actions are folded.
3. **History** — the journal itself, with notes that lack the tag folded into `⋯ N hidden notes`
   markers. It stays editable.

When several tags are combined, there is no sheet: only actions and history.

## File format

```
<notes folder>/
  2026/
    11/
      2026-11-23.md        one file per day
  tags/
    project-x.md           one optional sheet per tag
```

A day file is a list of notes, each starting with its time:

```markdown
## 14:52
Team sync on #project-x about the schedule. @Paul confirms the delivery.

## 16:10
Idea: #fil should support image drag and drop later.
- [ ] ping Paul about the mockups #project-x
```

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

`Ctrl+K` → *Rename #tag…* shows how many notes and day files are concerned, then offers:

- **Rename and keep the old name as an alias** (default): only the sheet changes; no note is rewritten.
- **Rename everywhere**: `#old` is replaced by `#new` in every day file (whole tags only).

The old tag's aliases always follow. If `#new` already exists, the tags are merged: aliases are
combined, the old sheet's body is appended under `## Merged from #old`, and the target keeps its
color and label. The old sheet is kept in `tags/_merged/`. Nothing is deleted. If anything fails
midway, every file already changed is restored; *Undo last rename* reverts the operation while
the app stays open.

### Working with other tools and sync services

- Files changed elsewhere are re-read when the window regains focus and every 30 seconds.
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
  model/               pure logic: paths, day parsing, segments, tags, actions, front matter,
                       tag table, palette, rename/merge
  index/               tag & action index, IndexedDB cache
  journal/             editor ↔ day files, navigation, progressive loading, action toggling
  editor/              CodeMirror extensions (segments, widgets, tags, checkboxes, topic filter…)
  sync/                debounced saver, status, external change watcher
  tags/                tag service (sheets, table, index updates), rename service
  ui/                  setup screen, status indicator, palette, dialogs, topic view
  i18n/                interface strings (en.ts is the reference) and Intl formatting
tests/                 Vitest unit tests, run against the in-memory file store
```

How it works, in short:

- The editor shows one document made of **day segments**. Each segment starts with an invisible
  sentinel line (rendered as the day separator, protected from edits) followed by the content of
  the day file. An edit only rewrites the files of the days it touches, 800 ms after the last
  keystroke.
- The last 30 day files are loaded at startup; older days load as you scroll up.
- A background **index** of every day file (notes, tags, actions with file, line and time) is
  cached in IndexedDB and invalidated by `lastModified`. Aliases are resolved at query time.
- A **service worker** caches the app for offline use. New versions download in the background
  and take over on the next launch; the page never reloads while you are writing.

### Adding a language

Interface strings live in `src/i18n/en.ts`, the reference and fallback. To add French, create
`src/i18n/fr.ts` exporting a `Partial<Messages>`, then register it in `src/i18n/index.ts`
(`fr: { tag: 'fr-FR', messages: fr }`). It then appears under *Language…* in the palette. Dates
and times are formatted with `Intl` in the chosen language.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build, then deployment to GitHub
Pages. One-time setup: in the repository, open *Settings → Pages* and set *Source* to
*GitHub Actions*.

The build uses the repository name as base path (`/fil/`). Set `BASE_PATH=/` when building for a
custom domain. The version shown in the palette is the `package.json` version plus the commit
hash.
