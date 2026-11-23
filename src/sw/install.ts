/** Chrome/Edge event fired when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Captures the install prompt so the app can offer "Install Fil" itself. Call once at startup. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

/** Whether Fil runs as an installed app (its own window). */
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Shows the browser's install dialog. Must run in a user gesture. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === 'accepted';
}

export function onInstallAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
