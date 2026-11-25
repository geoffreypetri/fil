import { plural, t } from '../i18n';
import { isRenameProblem, type RenameMode, type RenamePreview } from '../model/rename';
import type { RenameService } from '../tags/renameService';
import { openDialog } from './dialog';
import { h } from './dom';

/**
 * "Rename #tag…": choose the new name, see what will be touched, pick the mode
 * (keep the old name as alias — the default — or rename everywhere). An existing name merges.
 */
export function openRenameDialog(
  service: RenameService,
  from: string,
  onDone: (to: string) => void,
  onClose?: () => void,
): void {
  const nameInput = h('input', { class: 'dialog__input', value: from, spellcheck: 'false', autocomplete: 'off' });
  const preview = h('p', { class: 'dialog__hint rename__preview' });
  const aliasRadio = h('input', { type: 'radio', name: 'mode', value: 'alias', checked: true });
  const everywhereRadio = h('input', { type: 'radio', name: 'mode', value: 'everywhere' });
  const aliasText = h('span', {});
  const aliasHint = h('span', { class: 'dialog__hint' });
  const everywhereText = h('span', {});
  const everywhereHint = h('span', { class: 'dialog__hint' });
  const errors = h('ul', { class: 'dialog__errors', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'dialog__button dialog__button--primary' }, t('rename.submit'));
  let current: RenamePreview | null = null;

  const update = (): void => {
    const result = service.preview(from, nameInput.value);
    errors.replaceChildren();
    if (isRenameProblem(result)) {
      current = null;
      submit.disabled = true;
      preview.textContent = '';
      if (result.kind !== 'same' || nameInput.value.trim() !== from) {
        const message =
          result.kind === 'aliasOfOther'
            ? t('rename.error.aliasOfOther', { to: nameInput.value.replace(/^#/, ''), owner: result.owner })
            : t(result.kind === 'same' ? 'rename.error.same' : 'rename.error.invalid');
        errors.append(h('li', {}, message));
      }
      return;
    }
    current = result;
    submit.disabled = false;
    submit.textContent = result.merge ? t('rename.submitMerge') : t('rename.submit');
    preview.textContent = [
      t('rename.preview', {
        tag: from,
        notes: plural('count.notes', result.notes),
        pages: plural('count.pages', result.paths.length),
      }),
      result.hasSheet ? t('rename.previewSheet') : t('rename.previewNoSheet'),
      result.merge ? t('rename.merge', { from, to: result.to }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    aliasText.textContent = t('rename.modeAlias', { from });
    aliasHint.textContent = t('rename.modeAliasHint');
    everywhereText.textContent = t('rename.modeEverywhere');
    everywhereHint.textContent = t('rename.modeEverywhereHint', {
      from,
      to: result.to,
      pages: plural('count.pages', result.paths.length),
    });
  };

  const form = h(
    'form',
    { class: 'dialog__body', method: 'dialog' },
    h('h2', { class: 'dialog__title' }, t('rename.title', { tag: from })),
    h('label', { class: 'dialog__field' }, h('span', { class: 'dialog__label' }, t('rename.newName')), nameInput),
    preview,
    h(
      'div',
      { class: 'dialog__field', role: 'radiogroup' },
      h('label', { class: 'dialog__check rename__mode' }, aliasRadio, h('span', {}, aliasText, h('br', {}), aliasHint)),
      h(
        'label',
        { class: 'dialog__check rename__mode' },
        everywhereRadio,
        h('span', {}, everywhereText, h('br', {}), everywhereHint),
      ),
    ),
    errors,
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { type: 'button', class: 'dialog__button', onclick: () => dialog.close() }, t('settings.cancel')),
      submit,
    ),
  );

  nameInput.addEventListener('input', update);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!current) return;
    const mode: RenameMode = everywhereRadio.checked ? 'everywhere' : 'alias';
    submit.disabled = true;
    const target = current;
    service
      .rename(target, mode)
      .then(() => {
        dialog.close();
        onDone(target.to);
      })
      .catch((error: unknown) => {
        submit.disabled = false;
        errors.replaceChildren(
          h('li', {}, t('rename.error.failed', { message: error instanceof Error ? error.message : String(error) })),
        );
      });
  });

  const dialog = openDialog(form, { className: 'rename', label: t('rename.title', { tag: from }), onClose });
  update();
  nameInput.select();
}
