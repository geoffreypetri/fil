import { t } from '../../i18n';
import { openDialog, type DialogHandle } from '../dialog';
import { h } from '../dom';
import './palette.css';

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  /** Extra class for the label (e.g. a tag color). */
  readonly labelClass?: string;
  /** Runs the item. `alternate` is true with Shift+Enter or Shift+click. */
  run(alternate: boolean): void | PaletteMode | Promise<void | PaletteMode>;
}

export interface PaletteMode {
  readonly placeholder: string;
  readonly hint?: string;
  items(query: string): readonly PaletteItem[];
}

/**
 * Ctrl+K command palette: the single entry point for actions. An item can open a sub-mode
 * (choose a tag, enter a date…) by returning it from `run`.
 */
export class CommandPalette {
  private dialog: DialogHandle | null = null;
  private mode: PaletteMode;
  private items: readonly PaletteItem[] = [];
  private selected = 0;
  private readonly input = h('input', {
    class: 'palette__input',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'palette-list',
  });
  private readonly list = h('ul', { class: 'palette__list', id: 'palette-list', role: 'listbox' });
  private readonly hint = h('div', { class: 'palette__hint' });

  constructor(
    private readonly root: () => PaletteMode,
    private readonly onClose: () => void = () => undefined,
  ) {
    this.mode = root();
    this.input.addEventListener('input', () => {
      this.selected = 0;
      this.render();
    });
    this.input.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  isOpen(): boolean {
    return this.dialog !== null;
  }

  open(mode: PaletteMode = this.root(), query = ''): void {
    if (!this.dialog) {
      this.dialog = openDialog(h('div', { class: 'palette__body' }, this.input, this.list, this.hint), {
        className: 'palette',
        label: t('palette.placeholder'),
        onClose: () => {
          this.dialog = null;
          this.onClose();
        },
      });
    }
    this.setMode(mode, query);
  }

  close(): void {
    this.dialog?.close();
  }

  private setMode(mode: PaletteMode, query = ''): void {
    this.mode = mode;
    this.input.placeholder = mode.placeholder;
    this.input.value = query;
    this.hint.textContent = mode.hint ?? '';
    this.hint.hidden = !mode.hint;
    this.selected = 0;
    this.render();
    this.input.focus();
  }

  private render(): void {
    this.items = this.mode.items(this.input.value.trim());
    if (this.selected >= this.items.length) this.selected = Math.max(0, this.items.length - 1);
    if (this.items.length === 0) {
      this.list.replaceChildren(h('li', { class: 'palette__empty' }, t('palette.empty')));
      return;
    }
    this.list.replaceChildren(
      ...this.items.map((item, index) => {
        const element = h(
          'li',
          {
            class: `palette__item${index === this.selected ? ' palette__item--selected' : ''}`,
            role: 'option',
            id: `palette-item-${index}`,
            'aria-selected': index === this.selected ? 'true' : 'false',
          },
          h('span', { class: `palette__label ${item.labelClass ?? ''}` }, item.label),
          item.detail ? h('span', { class: 'palette__detail' }, item.detail) : null,
        );
        element.addEventListener('mousedown', (event) => {
          event.preventDefault();
          this.selected = index;
          void this.runSelected(event.shiftKey);
        });
        return element;
      }),
    );
    this.input.setAttribute('aria-activedescendant', `palette-item-${this.selected}`);
    this.list.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const count = this.items.length;
      if (count > 0) this.selected = (this.selected + delta + count) % count;
      this.render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this.runSelected(event.shiftKey);
    } else if (event.key === 'Backspace' && this.input.value === '' && this.mode !== this.root()) {
      event.preventDefault();
      this.setMode(this.root());
    }
  }

  private async runSelected(alternate: boolean): Promise<void> {
    const item = this.items[this.selected];
    if (!item) return;
    const next = await item.run(alternate);
    if (next) this.setMode(next);
    else this.close();
  }
}
