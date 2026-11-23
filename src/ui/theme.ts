export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'fil.theme';

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(preference: ThemePreference): void {
  if (preference === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // The preference only lasts for this session.
  }
}

/** Applies the saved preference (the system theme by default). */
export function applyStoredTheme(): void {
  setTheme(read());
}

export function effectiveTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches between light and dark. */
export function toggleTheme(): void {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}
