import { Workbox } from 'workbox-window';

/** How often the online version is checked. */
export const CHECK_INTERVAL_MS = 30 * 60_000;
/** Inactivity after which a visible window may reload to apply an update. */
export const IDLE_RELOAD_MS = 10 * 60_000;
/** At launch, an update found before any input is applied right away. */
const LAUNCH_WINDOW_MS = 15_000;

/** Called before reloading: save pending edits and remember where the user was. */
export type BeforeReload = () => Promise<void>;

let beforeReload: BeforeReload = async () => undefined;

export function setBeforeReload(hook: BeforeReload): void {
  beforeReload = hook;
}

/** Pure reload policy, kept separate for tests. */
export function mayReload(input: {
  readonly updateReady: boolean;
  readonly hidden: boolean;
  readonly now: number;
  readonly lastActivity: number | null;
  readonly startedAt: number;
}): boolean {
  if (!input.updateReady) return false;
  if (input.hidden) return true;
  if (input.lastActivity === null) return input.now - input.startedAt < LAUNCH_WINDOW_MS;
  return input.now - input.lastActivity >= IDLE_RELOAD_MS;
}

/**
 * Keeps the installed app up to date without user action: the service worker is checked
 * regularly; a new version is downloaded in the background, then activated and the page
 * reloaded when it cannot disturb the user — the window is in the background, the app has
 * been idle for 10 minutes, or it has just been launched. Pending edits are saved first.
 */
export function startUpdater(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  const workbox = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  const startedAt = Date.now();
  let lastActivity: number | null = null;
  let updateReady = false;
  let reloading = false;

  const tryReload = async (): Promise<void> => {
    if (reloading) return;
    const allowed = mayReload({
      updateReady,
      hidden: document.visibilityState === 'hidden',
      now: Date.now(),
      lastActivity,
      startedAt,
    });
    if (!allowed) return;
    reloading = true;
    try {
      await beforeReload();
    } catch (error) {
      // Never lose edits: if saving fails, keep the current version running.
      console.warn('Update postponed, saving failed', error);
      reloading = false;
      return;
    }
    // The new worker takes control, then the page reloads on the new version.
    workbox.addEventListener('controlling', () => window.location.reload());
    workbox.messageSkipWaiting();
  };

  workbox.addEventListener('waiting', () => {
    updateReady = true;
    void tryReload();
  });

  const markActivity = (): void => {
    lastActivity = Date.now();
  };
  for (const type of ['keydown', 'pointerdown', 'input']) {
    window.addEventListener(type, markActivity, { capture: true, passive: true });
  }

  const check = (): void => {
    void workbox.update().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void tryReload();
    else check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(check, CHECK_INTERVAL_MS);
  setInterval(() => void tryReload(), 60_000);

  workbox
    .register()
    .then((registration) => {
      // A version downloaded during an earlier session is waiting already.
      if (registration?.waiting && navigator.serviceWorker.controller) {
        updateReady = true;
        void tryReload();
      }
    })
    .catch((error: unknown) => console.warn('Service worker registration failed', error));
}
