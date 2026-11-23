import { EditorState } from '@codemirror/state';
import { EditorView, placeholder } from '@codemirror/view';
import { checkboxes } from '../../editor/checkboxes';
import { fromDisk } from '../../editor/segmentField';
import { baseEditing } from '../../editor/journalEditor';
import { tagAutocomplete } from '../../editor/tagAutocomplete';
import { tagContext } from '../../editor/tagContext';
import { tagDecorations } from '../../editor/tagDecorations';
import { t } from '../../i18n';
import { parseSheet, writeBody } from '../../model/frontmatter';
import { tagSheetPath } from '../../model/paths';
import type { Saver } from '../../sync/saver';
import type { TagService } from '../../tags/tagService';

const sheetTheme = EditorView.theme({
  // "&.cm-editor" outranks the shared theme, so the card's background shows through.
  '&.cm-editor': { fontSize: '15px', backgroundColor: 'transparent' },
  '.cm-content': { padding: '0', minHeight: 'calc(15px * 1.65 * 2)' },
  '.cm-placeholder': { color: 'var(--fg-faint)', fontStyle: 'italic' },
});

/**
 * Second editor instance bound to tags/<tag>.md. It shows and edits the body only; the front
 * matter is kept from the latest known version of the file. The file is created on first input.
 */
export function createSheetEditor(parent: HTMLElement, tags: TagService, saver: Saver, name: string): EditorView {
  const path = tagSheetPath(name);
  const text = tags.sheetText(name);
  const body = text === null ? '' : parseSheet(text).body;

  const view: EditorView = new EditorView({
    parent,
    state: EditorState.create({
      doc: body,
      extensions: [
        baseEditing(true),
        sheetTheme,
        placeholder(t('topic.sheetPlaceholder', { tag: name })),
        tagContext.of(tags.editorContext()),
        tagDecorations(),
        tagAutocomplete(),
        checkboxes(),
        EditorView.contentAttributes.of({ 'aria-label': t('topic.sheetPlaceholder', { tag: name }) }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || update.transactions.every((tr) => tr.annotation(fromDisk))) return;
          saver.schedule(path, () => {
            const current = tags.sheetText(name);
            const nextBody = view.state.doc.toString();
            if (current === null && nextBody.trim() === '') return null;
            return writeBody(current ?? '', nextBody);
          });
        }),
      ],
    }),
  });
  return view;
}
