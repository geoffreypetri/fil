import { t } from '../../i18n';
import { splitAliasInput, validateAliases, type AliasError } from '../../model/aliasRules';
import { PALETTE_COLORS, hashColor, type PaletteColor } from '../../model/palette';
import type { TagService } from '../../tags/tagService';
import { openDialog } from '../dialog';
import { h } from '../dom';

const ERROR_KEYS: Record<AliasError, 'settings.error.invalid' | 'settings.error.taken' | 'settings.error.used'> = {
  invalid: 'settings.error.invalid',
  taken: 'settings.error.taken',
  used: 'settings.error.used',
};

/**
 * Small panel to edit a tag's parameters: color from the palette, aliases, label, archiving.
 * Saving rewrites only the sheet's front matter.
 */
export function openSettingsPanel(tags: TagService, name: string, onClose?: () => void): void {
  const info = tags.table.info(name);
  const { settings } = info;

  const swatch = (value: PaletteColor | 'auto', label: string): HTMLElement => {
    const color = value === 'auto' ? hashColor(name) : value;
    const input = h('input', {
      type: 'radio',
      name: 'color',
      value,
      checked: (settings.color ?? 'auto') === value,
      'aria-label': label,
    });
    return h('label', { class: 'swatch', title: label }, input, h('span', { class: `tag-c-${color}` }, label));
  };

  const aliasInput = h('input', {
    class: 'dialog__input',
    value: settings.aliases.join(', '),
    placeholder: 'px, projetx',
    spellcheck: 'false',
  });
  const labelInput = h('input', { class: 'dialog__input', value: settings.label ?? '' });
  const archivedInput = h('input', { type: 'checkbox', checked: settings.archived });
  const errors = h('ul', { class: 'dialog__errors', role: 'alert' });
  const form = h(
    'form',
    { class: 'dialog__body', method: 'dialog' },
    h('h2', { class: 'dialog__title' }, t('settings.title', { tag: name })),
    h(
      'div',
      { class: 'dialog__field' },
      h('span', { class: 'dialog__label' }, t('settings.color')),
      h(
        'div',
        { class: 'swatches', role: 'radiogroup' },
        swatch('auto', t('settings.colorAuto')),
        ...PALETTE_COLORS.map((color) => swatch(color, t(`color.${color}`))),
      ),
    ),
    h(
      'label',
      { class: 'dialog__field' },
      h('span', { class: 'dialog__label' }, t('settings.aliases')),
      aliasInput,
      h('span', { class: 'dialog__hint' }, t('settings.aliasesHint')),
    ),
    h(
      'label',
      { class: 'dialog__field' },
      h('span', { class: 'dialog__label' }, t('settings.label')),
      labelInput,
      h('span', { class: 'dialog__hint' }, t('settings.labelHint')),
    ),
    h('label', { class: 'dialog__check' }, archivedInput, t('settings.archived')),
    errors,
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { type: 'button', class: 'dialog__button', onclick: () => dialog.close() }, t('settings.cancel')),
      h('button', { type: 'submit', class: 'dialog__button dialog__button--primary' }, t('settings.save')),
    ),
  );

  const showErrors = (messages: string[]): void => {
    errors.replaceChildren(...messages.map((message) => h('li', {}, message)));
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const validation = validateAliases(name, splitAliasInput(aliasInput.value), tags.table, tags.index.rawTags());
    if (validation.errors.length > 0) {
      showErrors(
        validation.errors.map((error) =>
          t(ERROR_KEYS[error.reason], { input: error.input.replace(/^#/, ''), owner: error.owner ?? '' }),
        ),
      );
      return;
    }
    const color = (form.querySelector<HTMLInputElement>('input[name="color"]:checked')?.value ?? 'auto') as
      | PaletteColor
      | 'auto';
    tags
      .saveSettings(name, {
        color: color === 'auto' ? undefined : color,
        aliases: validation.aliases,
        label: labelInput.value.trim() || undefined,
        archived: archivedInput.checked,
      })
      .then(() => dialog.close())
      .catch((error: unknown) =>
        showErrors([t('settings.error.save', { message: error instanceof Error ? error.message : String(error) })]),
      );
  });

  const dialog = openDialog(form, { className: 'settings', label: t('settings.title', { tag: name }), onClose });
  aliasInput.focus();
}
