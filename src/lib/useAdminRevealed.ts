"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "lfg-admin-revealed";

// External (localStorage-backed) store for the admin-reveal flag. Using
// useSyncExternalStore is the idiomatic, hydration-safe way to read browser
// state without a setState-in-effect: the server snapshot is always false, the
// client reads localStorage, and a subscription keeps it in sync across tabs.

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab sync: another tab toggling the flag fires a storage event.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Server / first paint: not revealed (avoids hydration mismatch).
function getServerSnapshot(): boolean {
  return false;
}

function setRevealedStorage(next: boolean) {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — emit so in-tab subscribers still update
    // (they will re-read getSnapshot, which falls back to false).
  }
  emit();
}

/**
 * Whether the secret Admin tab is revealed on THIS device, persisted in
 * localStorage so it survives reloads until explicitly hidden (CLAUDE.md admin
 * spec). SSR-safe via useSyncExternalStore.
 */
export function useAdminRevealed(): {
  revealed: boolean;
  reveal: () => void;
  hide: () => void;
  toggle: () => void;
} {
  const revealed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const reveal = useCallback(() => setRevealedStorage(true), []);
  const hide = useCallback(() => setRevealedStorage(false), []);
  const toggle = useCallback(() => setRevealedStorage(!getSnapshot()), []);

  return { revealed, reveal, hide, toggle };
}
