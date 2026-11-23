/**
 * Reference language and fallback for every other locale.
 * Placeholders use the {name} syntax and are filled by `t()`.
 */
export const en = {
  'app.name': 'Fil',
  'app.loading': 'Loading…',

  'browser.unsupported.title': 'This browser is not supported',
  'browser.unsupported.body':
    'Fil needs the File System Access API to read and write your notes folder. Please open it in a recent version of Chrome or Edge on desktop.',

  'setup.title': 'Fil',
  'setup.tagline': 'Chronological notes, structured by #tags. Your notes stay in a folder on your computer.',
  'setup.chooseFolder': 'Choose notes folder',
  'setup.reconnect': 'Reconnect to “{folder}”',
  'setup.reconnectHint': 'The browser needs your permission again to open this folder.',
  'setup.otherFolder': 'Choose another folder',
  'setup.error': 'Could not open the folder: {message}',

  'status.saved': 'saved',
  'status.saving': 'saving…',
  'status.error': 'error',

  'color.gray': 'Gray',
  'color.red': 'Red',
  'color.orange': 'Orange',
  'color.amber': 'Amber',
  'color.green': 'Green',
  'color.teal': 'Teal',
  'color.blue': 'Blue',
  'color.indigo': 'Indigo',
  'color.violet': 'Violet',
  'color.pink': 'Pink',

  'version.label': 'Version {version}',

  'tags.aliasHint': 'alias #{alias}',

  'warning.aliasConflict': '#{alias} is claimed by #{winner} and #{loser}: #{winner} wins until fixed',
  'warning.invalidSheet': 'Ignored tag sheet (invalid name): {path}',
  'warning.conflictFile': 'Conflict copy found: {path}',

  'settings.title': '#{tag} settings',
  'settings.color': 'Color',
  'settings.colorAuto': 'Auto',
  'settings.aliases': 'Aliases',
  'settings.aliasesHint': 'Other names for this tag, separated by commas',
  'settings.label': 'Label',
  'settings.labelHint': 'Long name shown in the topic view and the palette',
  'settings.archived': 'Archived (hidden from completion)',
  'settings.save': 'Save',
  'settings.cancel': 'Cancel',
  'settings.error.invalid': '“{input}” is not a valid tag name',
  'settings.error.taken': '#{input} already belongs to #{owner}',
  'settings.error.used': '#{input} is already used as a tag in notes (rename or merge it instead)',
  'settings.error.save': 'Could not save: {message}',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = { readonly [K in MessageKey]: string };
