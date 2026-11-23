/**
 * Recovery from a stale build. When a new version is deployed, a tab that is still
 * running the old version asks for code files that no longer exist. The fix is to
 * load the new version, so we reload the page — at most once per 30 seconds, so a
 * real outage can't cause a reload loop.
 */
const KEY = 'meetos:stale-build-reload';
const WINDOW_MS = 30_000;

export function isStaleBuildError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Outdated Optimize Dep/i.test(
    msg,
  );
}

/** Reloads the page unless we already did so in the last 30 seconds. Returns whether it reloaded. */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last < WINDOW_MS) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // without the guard a loop would be possible
  }
  window.location.reload();
  return true;
}

/** Vite fires this event when a lazily loaded file fails to load. */
export function installStaleBuildRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
