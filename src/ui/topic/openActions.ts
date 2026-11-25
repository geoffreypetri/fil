import { t } from '../../i18n';
import type { ActionRef } from '../../index/tagIndex';
import { pageNameOf } from '../../model/pages';
import { extractLineTags } from '../../model/tags';
import type { TagService } from '../../tags/tagService';
import { h } from '../dom';

export interface OpenActionsOptions {
  readonly tags: TagService;
  onToggle(ref: ActionRef, done: boolean): Promise<boolean>;
  onGoTo(ref: ActionRef): void;
}

/** Renders action text with its tags as colored pills. */
export function renderTaggedText(text: string, tags: TagService): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of extractLineTags(text)) {
    if (match.from > last) nodes.push(document.createTextNode(text.slice(last, match.from)));
    nodes.push(h('span', { class: `tag-pill tag-c-${tags.colorOf(match.tag)}` }, text.slice(match.from, match.to)));
    last = match.to;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

/**
 * Open actions of a topic, oldest first. Done actions are folded behind "+ N done".
 */
export class OpenActions {
  readonly element = h('section', { class: 'topic-actions', 'aria-label': t('topic.actions') });
  private showDone = false;
  private refs: readonly ActionRef[] = [];

  constructor(private readonly options: OpenActionsOptions) {}

  update(refs: readonly ActionRef[]): void {
    this.refs = refs;
    this.render();
  }

  private render(): void {
    const open = this.refs.filter((r) => !r.action.done);
    const done = this.refs.filter((r) => r.action.done);
    const list = h('ul', { class: 'topic-actions__list' });
    for (const ref of open) list.append(this.item(ref));
    if (this.showDone) for (const ref of done) list.append(this.item(ref));

    const children: Node[] = [h('h3', { class: 'topic__label' }, t('topic.actions'))];
    if (open.length === 0) children.push(h('p', { class: 'topic-actions__empty' }, t('topic.noActions')));
    children.push(list);
    if (done.length > 0) {
      children.push(
        h(
          'button',
          {
            class: 'topic-actions__more',
            onclick: () => {
              this.showDone = !this.showDone;
              this.render();
            },
          },
          this.showDone ? t('topic.hideDone') : t('topic.doneCount', { count: done.length }),
        ),
      );
    }
    this.element.replaceChildren(...children);
  }

  private item(ref: ActionRef): HTMLElement {
    const checkbox = h('input', { type: 'checkbox', checked: ref.action.done, 'aria-label': ref.action.text });
    checkbox.addEventListener('change', () => {
      checkbox.disabled = true;
      void this.options.onToggle(ref, checkbox.checked).then((ok) => {
        if (!ok) checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
      });
    });
    const when = pageNameOf(ref.path) ?? ref.path;
    return h(
      'li',
      { class: `topic-actions__item${ref.action.done ? ' topic-actions__item--done' : ''}` },
      h('label', { class: 'topic-actions__label' }, checkbox, h('span', {}, ...renderTaggedText(ref.action.text, this.options.tags))),
      h(
        'button',
        { class: 'topic-actions__link', title: t('topic.goToNote'), onclick: () => this.options.onGoTo(ref) },
        `↗ ${when}`,
      ),
    );
  }
}
