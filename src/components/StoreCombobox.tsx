"use client";

import { useId, useMemo, useState } from "react";
import type { Store } from "@/lib/validation";

type Props = {
  stores: Store[];
  value: Store | null;
  onChange: (store: Store | null) => void;
  error?: string;
  disabled?: boolean;
};

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function storeSubtitle(store: Store) {
  return [store.chain, store.area].filter(Boolean).join(" · ");
}

// Inline (non-popover) searchable list: plays nicer with the mobile keyboard
// than a floating dropdown that gets covered or clipped.
export function StoreCombobox({ stores, value, onChange, error, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const errorId = useId();

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return stores;
    const terms = q.split(/\s+/);
    return stores.filter((s) => {
      const haystack = normalize([s.name, s.chain, s.area, s.channel].filter(Boolean).join(" "));
      return terms.every((t) => haystack.includes(t));
    });
  }, [stores, query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-300 bg-white p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-zinc-900">{value.name}</p>
          {storeSubtitle(value) && (
            <p className="truncate text-sm text-zinc-500">{storeSubtitle(value)}</p>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
          className="h-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 disabled:opacity-50"
        >
          Ganti
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Cari nama toko, chain, atau area"
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className={`h-14 w-full rounded-xl border bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 ${
          error ? "border-red-500" : "border-zinc-300"
        }`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white"
        >
          {filtered.length === 0 ? (
            <li className="p-4 text-sm text-zinc-500">Toko tidak ditemukan.</li>
          ) : (
            filtered.map((store) => (
              <li key={store.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(store);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="block w-full border-b border-zinc-100 px-4 py-3 text-left last:border-b-0 active:bg-zinc-100"
                >
                  <span className="block text-base text-zinc-900">{store.name}</span>
                  {storeSubtitle(store) && (
                    <span className="block text-sm text-zinc-500">{storeSubtitle(store)}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error && (
        <p id={errorId} className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
