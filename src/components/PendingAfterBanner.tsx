"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  clearPendingAfter,
  parsePendingAfter,
  readPendingAfterRaw,
  subscribePendingAfter,
} from "@/lib/pending-after";
import { SHELF_CATEGORY_LABELS } from "@/lib/validation";

// Drops the reminder once the server says the After photo already exists
// (e.g. it was sent from another device).
export function ForgetPendingAfter({ beforeId }: { beforeId: string }) {
  useEffect(() => clearPendingAfter(beforeId), [beforeId]);
  return null;
}

// Reminds the SPG of a Before photo whose After photo was not sent yet.
export function PendingAfterBanner() {
  const raw = useSyncExternalStore(subscribePendingAfter, readPendingAfterRaw, () => null);
  const pending = parsePendingAfter(raw);
  if (!pending) return null;

  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">
        Foto <b>sesudah ditata</b> belum dikirim untuk <b>{pending.storeName}</b> (rak{" "}
        {SHELF_CATEGORY_LABELS[pending.category]}).
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={`/planogram/${pending.beforeId}`}
          className="flex h-12 items-center justify-center rounded-lg bg-amber-500 text-sm font-semibold text-white active:bg-amber-600"
        >
          Lanjutkan
        </Link>
        <button
          type="button"
          onClick={() => clearPendingAfter()}
          className="h-12 rounded-lg border border-amber-300 text-sm font-medium text-amber-900 active:bg-amber-100"
        >
          Abaikan
        </button>
      </div>
    </div>
  );
}
