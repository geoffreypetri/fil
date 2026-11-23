/**
 * Fixed tag palette. Each color has a text/background pair per theme, tested for a contrast
 * ratio of at least 4.5:1 (see tests/palette.test.ts). Free hex colors are not allowed in V1.
 */
export const PALETTE_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
] as const;

export type PaletteColor = (typeof PALETTE_COLORS)[number];

export interface ColorPair {
  readonly fg: string;
  readonly bg: string;
}

export const PALETTE: Record<PaletteColor, { light: ColorPair; dark: ColorPair }> = {
  gray: { light: { fg: '#424a53', bg: '#eaeef2' }, dark: { fg: '#d0d7de', bg: '#2d333b' } },
  red: { light: { fg: '#a40e26', bg: '#ffebe9' }, dark: { fg: '#ffb4ab', bg: '#4a1d1f' } },
  orange: { light: { fg: '#953800', bg: '#fff1e5' }, dark: { fg: '#ffb77c', bg: '#46280f' } },
  amber: { light: { fg: '#7a4b00', bg: '#fff5c2' }, dark: { fg: '#f2cc60', bg: '#3b2f0e' } },
  green: { light: { fg: '#116329', bg: '#dafbe1' }, dark: { fg: '#7ee2a0', bg: '#16331d' } },
  teal: { light: { fg: '#0b5f5f', bg: '#d5f5f2' }, dark: { fg: '#6fdcd2', bg: '#103331' } },
  blue: { light: { fg: '#0a4fa8', bg: '#ddf4ff' }, dark: { fg: '#9ccbff', bg: '#132d4d' } },
  indigo: { light: { fg: '#3d3ab0', bg: '#e8e8ff' }, dark: { fg: '#b8b8ff', bg: '#25244d' } },
  violet: { light: { fg: '#6b2fb3', bg: '#f3e8ff' }, dark: { fg: '#d2b3ff', bg: '#321f4b' } },
  pink: { light: { fg: '#9c1a5a', bg: '#ffe5f1' }, dark: { fg: '#ffadd2', bg: '#481a31' } },
};

export function isPaletteColor(value: unknown): value is PaletteColor {
  return typeof value === 'string' && (PALETTE_COLORS as readonly string[]).includes(value);
}

/** Colors used for tags without an explicit color (gray is reserved for explicit choice). */
const HASH_COLORS = PALETTE_COLORS.filter((color) => color !== 'gray');

/** Stable color derived from the tag name (FNV-1a hash). */
export function hashColor(name: string): PaletteColor {
  let hash = 0x811c9dc5;
  for (const char of name) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return HASH_COLORS[(hash >>> 0) % HASH_COLORS.length]!;
}

/** CSS classes `.tag-c-<color>` defining --tag-fg / --tag-bg for both themes. */
export function paletteCss(): string {
  const rules = (theme: 'light' | 'dark'): string =>
    PALETTE_COLORS.map((color) => {
      const { fg, bg } = PALETTE[color][theme];
      return `.tag-c-${color}{--tag-fg:${fg};--tag-bg:${bg}}`;
    }).join('');
  return [
    rules('light'),
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']) ${rules('dark').replaceAll('}.', '} :root:not([data-theme=\'light\']) .')}}`,
    rules('dark').replace(/(^|\})\./g, "$1:root[data-theme='dark'] ."),
  ].join('\n');
}
