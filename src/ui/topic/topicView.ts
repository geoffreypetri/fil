import { EditorView } from '@codemirror/view';
import { segmentsOf } from '../../editor/segmentField';
import { revealNotes, setTopicTags } from '../../editor/topicFilter';
import type { FileStore } from '../../fs/store';
import { formatDateTime, t } from '../../i18n';
import type { ActionRef } from '../../index/tagIndex';
import { setActionDone } from '../../journal/actionToggle';
import type { Journal } from '../../journal/journal';
import { parseTimeHeader } from '../../model/dayParser';
import type { DayKey } from '../../model/paths';
import { SENTINEL } from '../../model/segments';
import type { Saver } from '../../sync/saver';
import type { StatusHub } from '../../sync/status';
import type { TagService } from '../../tags/tagService';
import { h } from '../dom';
import { OpenActions } from './openActions';
import { createSheetEditor } from './sheetEditor';
import './topic.css';

export interface TopicViewDeps {
  readonly host: HTMLElement;
  readonly store: FileStore;
  readonly saver: Saver;
  readonly journal: Journal;
  readonly tags: TagService;
  readonly status: StatusHub;
  view(): EditorView | null;
  openSettings(name: string): void;
}

/**
 * Topic view, in the same screen as the journal: the tag sheet (pinned), the open actions,
 * then the journal itself as history, with notes lacking the tag folded away.
 */
export class TopicView {
  private tagsValue: readonly string[] | null = null;
  private sheet: EditorView | null = null;
  private readonly actions: OpenActions;
  private readonly header = h('header', { class: 'topic__header' });
  private readonly sheetHost = h('div', { class: 'topic__sheet' });
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly deps: TopicViewDeps) {
    this.actions = new OpenActions({
      tags: deps.tags,
      onToggle: (ref, done) => this.toggle(ref, done),
      onGoTo: (ref) => void this.goTo(ref.day, ref.action.line),
    });
    deps.host.hidden = true;
    deps.host.append(
      h('div', { class: 'topic__inner' }, this.header, this.sheetHost, this.actions.element),
      h('div', { class: 'topic__history-label' }, h('span', { class: 'topic__label' }, t('topic.history'))),
    );
    this.disposers.push(
      deps.tags.index.subscribe(() => this.refreshActions()),
      deps.tags.onTableChange(() => {
        if (this.tagsValue) this.renderHeader();
      }),
    );
  }

  get tags(): readonly string[] | null {
    return this.tagsValue;
  }

  isOpen(): boolean {
    return this.tagsValue !== null;
  }

  /** Opens the topic of one or more tags (combined with AND). */
  async open(tags: readonly string[]): Promise<void> {
    const names = [...new Set(tags.map(this.deps.tags.resolve))];
    if (names.length === 0) return;
    const single = names.length === 1 ? names[0]! : null;
    const sameSheet = this.tagsValue?.length === 1 && single === this.tagsValue[0];
    this.tagsValue = names;
    this.deps.host.hidden = false;
    document.documentElement.dataset.topic = 'open';

    if (!sameSheet) {
      this.sheet?.destroy();
      this.sheet = single ? createSheetEditor(this.sheetHost, this.deps.tags, this.deps.saver, single) : null;
      this.sheetHost.hidden = single === null;
    }
    this.renderHeader();
    this.refreshActions();

    await this.loadDaysWithTopic(names);
    const view = this.deps.view();
    if (view) {
      view.dispatch({ effects: setTopicTags.of(names) });
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end' }) });
    }
  }

  /** Adds a tag to the current topic (AND), or opens it alone. */
  async add(tag: string): Promise<void> {
    await this.open([...(this.tagsValue ?? []), tag]);
  }

  close(): void {
    if (!this.tagsValue) return;
    this.tagsValue = null;
    this.sheet?.destroy();
    this.sheet = null;
    this.deps.host.hidden = true;
    delete document.documentElement.dataset.topic;
    const view = this.deps.view();
    if (view) {
      view.dispatch({ effects: setTopicTags.of(null), scrollIntoView: true });
      view.focus();
    }
  }

  destroy(): void {
    this.close();
    for (const dispose of this.disposers) dispose();
  }

  /** Makes sure every day holding a note of the topic is in the editor. */
  private async loadDaysWithTopic(names: readonly string[]): Promise<void> {
    const loaded = this.deps.journal.loadedDays();
    const missing = [
      ...new Set(this.deps.tags.index.notesWith(names, this.deps.tags.resolve).map((n) => n.day)),
    ].filter((day) => !loaded.has(day));
    await this.loadDays(missing);
  }

  private async loadDays(days: readonly DayKey[]): Promise<void> {
    if (days.length === 0) return;
    const sources = await this.deps.journal.readDays(days);
    const spec = this.deps.journal.insertDaysSpec(sources);
    const view = this.deps.view();
    if (spec && view) view.dispatch(spec);
  }

  private renderHeader(): void {
    const names = this.tagsValue;
    if (!names) return;
    const { tags } = this.deps;
    const pill = (name: string): HTMLElement =>
      h('span', { class: `tag-pill topic__tag tag-c-${tags.colorOf(name)}` }, `#${name}`);
    const close = h(
      'button',
      { class: 'topic__close', title: t('topic.close'), 'aria-label': t('topic.close'), onclick: () => this.close() },
      '×',
    );

    if (names.length > 1) {
      const parts: Node[] = [];
      names.forEach((name, index) => {
        if (index > 0) parts.push(h('span', { class: 'topic__and' }, t('topic.and')));
        parts.push(pill(name));
      });
      this.header.replaceChildren(h('div', { class: 'topic__title' }, ...parts), close);
      return;
    }

    const name = names[0]!;
    const info = tags.table.info(name);
    const modified = tags.sheetModified(name);
    const title = h(
      'button',
      {
        class: 'topic__title topic__title--button',
        title: t('topic.settings'),
        onclick: () => this.deps.openSettings(name),
      },
      pill(name),
      info.settings.label ? h('span', { class: 'topic__label-text' }, info.settings.label) : null,
      ...info.aliases.map((alias) => h('span', { class: 'topic__alias' }, `#${alias}`)),
    );
    const date =
      modified !== null
        ? h('span', { class: 'topic__modified' }, t('topic.sheetModified', { date: formatDateTime(new Date(modified)) }))
        : '';
    this.header.replaceChildren(title, date, close);
  }

  private refreshActions(): void {
    if (!this.tagsValue) return;
    this.actions.update(this.deps.tags.index.actionsFor(this.tagsValue, this.deps.tags.resolve));
  }

  private async toggle(ref: ActionRef, done: boolean): Promise<boolean> {
    try {
      const ok = await setActionDone(ref, done, this.deps.view(), this.deps.store, this.deps.saver);
      if (!ok) this.deps.status.set('actions', 'saved', [t('topic.actionMissing')]);
      return ok;
    } catch (error) {
      this.deps.status.set('actions', 'error', [error instanceof Error ? error.message : String(error)]);
      return false;
    }
  }

  /** Scrolls the journal to a line of a day file, revealing it if it is folded. */
  async goTo(day: DayKey, fileLine: number): Promise<void> {
    await this.loadDays([day]);
    const view = this.deps.view();
    if (!view) return;
    const segment = segmentsOf(view.state).find((s) => s.day === day);
    if (!segment) return;
    const { doc } = view.state;
    const lineNumber = Math.min(doc.lineAt(segment.from).number + fileLine, doc.lineAt(segment.to).number);
    const pos = doc.line(lineNumber).from;
    view.dispatch({
      effects: [revealNotes.of([pos, ...this.noteStartsAround(view, pos)]), EditorView.scrollIntoView(pos, { y: 'center' })],
      selection: { anchor: pos },
    });
    view.focus();
  }

  /** Start of the note containing `pos` (so revealing it unfolds the whole note). */
  private noteStartsAround(view: EditorView, pos: number): number[] {
    const { doc } = view.state;
    for (let line = doc.lineAt(pos); ; line = doc.line(line.number - 1)) {
      if (parseTimeHeader(line.text) !== null) return [line.from];
      // Text before the first time stamp of a day is an untimed note starting after the separator.
      if (line.text.startsWith(SENTINEL)) return [Math.min(line.to + 1, doc.length)];
      if (line.number === 1) return [];
    }
  }
}
