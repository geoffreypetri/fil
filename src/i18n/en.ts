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

  'version.label': 'Version {version}',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = { readonly [K in MessageKey]: string };
