import { Workbox } from 'workbox-window';

/**
 * Registers the service worker for offline use.
 *
 * Updates are silent: a new worker is downloaded and installed in the background, then waits.
 * It never calls skipWaiting(), so it only takes control once every Fil tab has been closed,
 * i.e. on the next launch. The page is never reloaded while the user is writing.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const workbox = new Workbox(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  workbox.register().catch((error: unknown) => {
    console.warn('Service worker registration failed', error);
  });
}
