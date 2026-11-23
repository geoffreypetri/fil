import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command, isPreview }) => {
  // GitHub Pages serves the app from /<repo>/. BASE_PATH overrides it (e.g. "/" for a custom domain).
  const base = process.env.BASE_PATH ?? (command === 'build' || isPreview ? '/fil/' : '/');

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(commitHash()),
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      // One ~240 kB (gzip) bundle, mostly CodeMirror; cached by the service worker after the
      // first visit, so splitting it would not speed anything up.
      chunkSizeWarningLimit: 800,
    },
    plugins: [
      VitePWA({
        // "prompt" means the new worker never calls skipWaiting(): it is downloaded in the
        // background and only takes control on the next launch, so a session is never reloaded.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: './',
          name: 'Fil',
          short_name: 'Fil',
          description: 'Chronological notes structured by #tags, stored as Markdown in a folder you choose.',
          lang: 'en',
          dir: 'ltr',
          display: 'standalone',
          start_url: './',
          scope: './',
          background_color: '#ffffff',
          theme_color: '#ffffff',
          categories: ['productivity'],
          // A second launch focuses the open window: two windows would edit the same files.
          launch_handler: { client_mode: 'focus-existing' },
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
