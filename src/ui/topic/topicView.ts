import { EditorView } from '@codemirror/view';
import { fromDisk } from '../../editor/pageField';
import { setTopicTags } from '../../editor/topicFilter';
import { parseSheet } from '../../model/frontmatter';
import { INBOX_NAME, pageNameOf } from '../../model/pages';
import { tagSheetPath } from '../../model/paths';
import type { FileStore } from '../../fs/store';
import { formatDateTime, t } from '../../i18n';
import type { ActionRef } from '../../index/tagIndex';
import { setActionDone } from '../../journal/actionToggle';
import type { Navigator } from '../../journal/navigator';
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
  readonly tags: TagService;
  readonly status: StatusHub;
  readonly navigator: Navigator;
  view(): EditorView | null;
  openSettings(name: string): void;
}

/**
 * Topic view, in the same screen as the notes: the tag sheet (pinned), the open actions,
 * then the document itself as history, with notes lacking the tag folded away.
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
      onGoTo: (ref) => void deps.navigator.goToLine(pageNameOf(ref.path) ?? INBOX_NAME, ref.action.line),
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

    await this.loadPagesWithTopic(names);
    const view = this.deps.view();
    if (view) {
      view.dispatch({ effects: setTopicTags.of(names) });
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end' }) });
    }
  }

  /** Shows a sheet changed on disk, unless it has local edits waiting to be saved. */
  reloadSheet(name: string): void {
    if (!this.sheet || this.tagsValue?.length !== 1 || this.tagsValue[0] !== name) return;
    if (this.deps.saver.isPending(tagSheetPath(name))) return;
    const text = this.deps.tags.sheetText(name);
    const body = text === null ? '' : parseSheet(text).body;
    const current = this.sheet.state.doc.toString();
    if (body !== current) {
      this.sheet.dispatch({
        changes: { from: 0, to: current.length, insert: body },
        annotations: fromDisk.of(true),
      });
    }
    this.renderHeader();
  }

  focusSheet(): void {
    this.sheet?.focus();
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

  /** Makes sure every page holding a note of the topic is in the editor. */
  private async loadPagesWithTopic(names: readonly string[]): Promise<void> {
    const pages = this.deps.tags.index
      .notesWith(names, this.deps.tags.resolve)
      .flatMap((note) => pageNameOf(note.path) ?? []);
    await this.deps.navigator.loadPages([...new Set(pages)]);
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
}
