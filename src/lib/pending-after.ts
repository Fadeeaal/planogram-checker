// Remembers (per device) a Before photo whose After photo has not been sent,
// so the SPG can get back to the planogram page after closing it.
import type { ShelfCategory } from "./validation";

const KEY = "pendingAfter";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingAfter = {
  beforeId: string;
  storeName: string;
  category: ShelfCategory;
  savedAt: number;
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Storage can throw in private mode or when site data is blocked; the banner is
// a convenience, so failures are ignored.
export function savePendingAfter(pending: Omit<PendingAfter, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pending, savedAt: Date.now() }));
    notify();
  } catch {}
}

export function clearPendingAfter(beforeId?: string) {
  try {
    const current = parsePendingAfter(localStorage.getItem(KEY));
    if (beforeId && current && current.beforeId !== beforeId) return;
    localStorage.removeItem(KEY);
    notify();
  } catch {}
}

// Raw string snapshot for useSyncExternalStore (stable between renders).
export function readPendingAfterRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parsePendingAfter(raw: string | null): PendingAfter | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingAfter;
    if (!value.beforeId || Date.now() - value.savedAt > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function subscribePendingAfter(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
