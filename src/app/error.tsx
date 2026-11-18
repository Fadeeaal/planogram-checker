"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 text-center">
      <p className="text-base font-semibold">Gagal memuat halaman</p>
      <p className="mt-1 text-sm text-zinc-500">Periksa sinyal internet, lalu coba lagi.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 h-12 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white active:bg-zinc-700"
      >
        Coba Lagi
      </button>
    </div>
  );
}
