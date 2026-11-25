import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Facet, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { t, type MessageKey } from '../i18n';
import { dayKeyOf, timeOf } from '../model/paths';
import { inCode } from './tagContext';

export type HelperId = 'today' | 'now' | 'date' | 'note' | 'todo';

/** What helpers need from the app; absent in editors without pages (tag sheets). */
export interface HelperContext {
  now(): Date;
  /** Opens a page if it exists; resolves to false when there is no such page. */
  goToPage?(name: string): Promise<boolean>;
}

export const helperContext = Facet.define<HelperContext, HelperContext>({
  combine: (values) => values[0] ?? { now: () => new Date() },
});

export const HELPERS: readonly HelperId[] = ['today', 'now', 'date', 'note', 'todo'];

const LABELS: Record<HelperId, MessageKey> = {
  today: 'helper.today',
  now: 'helper.now',
  date: 'helper.date',
  note: 'helper.note',
  todo: 'helper.todo',
};

export function helperLabel(id: HelperId): string {
  return t(LABELS[id]);
}

/** Text the helper inserts, shown as a hint in the menu. */
export function helperPreview(id: HelperId, now: Date): string {
  switch (id) {
    case 'today':
      return `# ${dayKeyOf(now)}`;
    case 'now':
      return timeOf(now);
    case 'date':
      return dayKeyOf(now);
    case 'note':
      return `## ${timeOf(now)}`;
    case 'todo':
      return '- [ ] ';
  }
}

/**
 * Inserts what a helper produces in place of [from, to] (the typed "/command", or the cursor).
 * Line-level helpers (today, note, todo) start their own line.
 */
export function helperChange(
  state: EditorState,
  id: HelperId,
  from: number,
  to: number,
  now: Date,
): { from: number; to: number; insert: string; cursor: number } {
  const line = state.doc.lineAt(from);
  const before = state.doc.sliceString(line.from, from);
  const after = state.doc.sliceString(to, line.to);
  const inline = id === 'now' || id === 'date';
  let insert = helperPreview(id, now);
  if (!inline) {
    const needsBreakBefore = before.trim() !== '';
    const headingLike = id === 'today' || id === 'note';
    if (needsBreakBefore) insert = `\n${insert}`;
    // A heading is followed by a fresh line to write on.
    if (headingLike) insert = `${insert}\n`;
    const start = needsBreakBefore ? from : line.from;
    const end = needsBreakBefore ? to : to + (after.trim() === '' ? after.length : 0);
    return { from: start, to: end, insert, cursor: start + insert.length };
  }
  return { from, to, insert, cursor: from + insert.length };
}

/** Runs a helper at [from, to]. "today" opens today's page instead when it already exists. */
export async function runHelper(view: EditorView, id: HelperId, from: number, to: number): Promise<void> {
  const context = view.state.facet(helperContext);
  const now = context.now();
  if (id === 'today' && context.goToPage) {
    if (to > from) view.dispatch({ changes: { from, to }, userEvent: 'delete' });
    if (await context.goToPage(dayKeyOf(now))) return;
    const pos = Math.min(from, view.state.doc.length);
    from = pos;
    to = pos;
  }
  const change = helperChange(view.state, id, from, to, now);
  view.dispatch({
    changes: { from: change.from, to: change.to, insert: change.insert },
    selection: { anchor: change.cursor },
    scrollIntoView: true,
    userEvent: 'input.helper',
  });
  view.focus();
}

/** "/" at the start of a line or after a space opens the helper menu. */
export function helperCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/(?:^|(?<=\s))\/[a-z]*$/);
  if (!match || inCode(context.state, match.from, 1)) return null;
  const query = match.text.slice(1);
  const now = context.state.facet(helperContext).now();
  const options: Completion[] = HELPERS.filter((id) => id.startsWith(query)).map((id) => ({
    label: `/${id}`,
    detail: `${helperLabel(id)} · ${helperPreview(id, now).trim()}`,
    type: 'keyword',
    apply: (view, _completion, from, to) => void runHelper(view, id, from, to),
  }));
  return options.length > 0 ? { from: match.from, to: context.pos, options, filter: false } : null;
}
