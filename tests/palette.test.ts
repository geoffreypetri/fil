import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_COLORS, hashColor, paletteCss } from '../src/model/palette';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

const PAGE = { light: '#ffffff', dark: '#15171a' };

describe('palette', () => {
  for (const color of PALETTE_COLORS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${color} has at least 4.5:1 contrast in ${theme} theme`, () => {
        const { fg, bg } = PALETTE[color][theme];
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(fg, PAGE[theme])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('derives a stable color from the tag name', () => {
    expect(hashColor('project-x')).toBe(hashColor('project-x'));
    expect(PALETTE_COLORS).toContain(hashColor('é-tag'));
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(hashColor));
    expect(colors.size).toBeGreaterThan(3);
    expect(colors.has('gray')).toBe(false);
  });

  it('generates CSS for both themes', () => {
    const css = paletteCss();
    expect(css).toContain('.tag-c-red{--tag-fg:#a40e26');
    expect(css).toContain(":root[data-theme='dark'] .tag-c-red{--tag-fg:#ffb4ab");
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme='light']) .tag-c-gray");
  });
});
