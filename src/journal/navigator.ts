import { EditorView } from '@codemirror/view';
import { pageRanges } from '../editor/pageField';
import { revealNotes } from '../editor/topicFilter';
import { isInbox } from '../model/pages';
import { headingLevel } from '../model/units';
import type { PageSync } from './pageSync';

const lower = (name: string): string => name.toLocaleLowerCase();

/** Loads pages into the editor and moves the cursor to them. */
export class Navigator {
  constructor(
    private readonly sync: PageSync,
    private readonly view: () => EditorView | null,
  ) {}

  /**
   * Makes sure the given pages are in the editor. The document always holds the last pages, so
   * the pages between the oldest requested one and the first loaded one are loaded too.
   */
  async loadPages(names: readonly string[]): Promise<void> {
    const order = this.sync.allNames().filter((name) => !isInbox(name)).map(lower);
    const loaded = new Set(this.sync.loadedNames().map(lower));
    const missing = names.filter((name) => !isInbox(name) && !loaded.has(lower(name)) && order.includes(lower(name)));
    if (missing.length === 0) return;
    const oldest = missing.sort((a, b) => order.indexOf(lower(a)) - order.indexOf(lower(b)))[0]!;
    const sources = await this.sync.readPages(this.sync.namesUpTo(oldest));
    const spec = this.sync.insertBeforeSpec(sources);
    const view = this.view();
    if (spec && view) view.dispatch(spec);
  }

  /** Content range of a page (or of the inbox) in the editor. */
  private range(name: string): { from: number; to: number } | null {
    const view = this.view();
    if (!view) return null;
    const { inbox, pages } = pageRanges(view.state);
    if (isInbox(name)) return inbox;
    return pages.find((r) => r.page.name !== null && lower(r.page.name) === lower(name)) ?? null;
  }

  /** Scrolls to a line of a page file (0-based), unfolding its note if a topic hides it. */
  async goToLine(name: string, fileLine: number): Promise<void> {
    await this.loadPages([name]);
    const view = this.view();
    const range = this.range(name);
    if (!view || !range) return;
    const { doc } = view.state;
    const lineNumber = Math.min(doc.lineAt(range.from).number + fileLine, doc.lineAt(range.to).number);
    const pos = doc.line(lineNumber).from;
    view.dispatch({
      effects: [revealNotes.of(noteStarts(view, pos)), EditorView.scrollIntoView(pos, { y: 'center' })],
      selection: { anchor: pos },
    });
    view.focus();
  }

  /** Scrolls to the title of a page and puts the cursor at its end. */
  async goToPage(name: string): Promise<boolean> {
    await this.loadPages([name]);
    const view = this.view();
    const range = this.range(name);
    if (!view || !range) return false;
    view.dispatch({
      selection: { anchor: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: 'start', yMargin: 48 }),
    });
    view.focus();
    return true;
  }
}

/** The line itself and the start of its paragraph, so revealing unfolds the whole note. */
function noteStarts(view: EditorView, pos: number): number[] {
  const { doc } = view.state;
  const starts = [pos];
  for (let line = doc.lineAt(pos); line.number > 1; ) {
    const previous = doc.line(line.number - 1);
    if (previous.text.trim() === '' || headingLevel(line.text) > 0) break;
    line = previous;
    starts.push(line.from);
  }
  return starts;
}
