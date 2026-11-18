"use client";

import { PLANOGRAMS, defaultPlan } from "@/lib/planogram";
import type { ShelfCategory } from "@/lib/validation";
import { AfterForm } from "./AfterForm";
import { AnnotatedPhoto } from "./AnnotatedPhoto";
import { PlanView } from "./PlanView";
import { usePlanStatus } from "./usePlanStatus";

type Props = {
  beforeId: string;
  storeId: string;
  storeName: string;
  category: ShelfCategory;
};

// Planogram page body: waits for the Before photo's suggestion, shows it, then
// takes the After photo.
export function PlanogramVisit({ beforeId, storeId, storeName, category }: Props) {
  const { state, skip } = usePlanStatus(beforeId);
  const brand = PLANOGRAMS[category].brand;

  let notice: string | null = null;
  if (state.phase === "fallback") {
    notice = "Saran otomatis tidak tersedia. Pakai urutan standar di bawah sesuai ruang yang ada.";
  } else if (state.phase === "ready") {
    const { plan, detectedBrand, photoIssue } = state.data;
    if (plan.source === "default") {
      notice = `Jatah rak ${brand} tidak terdeteksi di foto, jadi dipakai urutan standar.`;
    } else if (detectedBrand && detectedBrand !== brand && detectedBrand !== "Keduanya") {
      notice = `Produk ${brand} tidak terlihat jelas di foto. Pastikan foto rak yang benar.`;
    }
    if (photoIssue) notice = `${notice ? `${notice} ` : ""}Catatan foto: ${photoIssue}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600">
        <b className="text-zinc-900">{storeName}</b> · Rak {brand}
      </p>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          1. Tata Rak Sesuai Saran
        </h2>

        {state.phase === "waiting" ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" aria-hidden />
            <p className="text-sm font-medium text-zinc-900">Menganalisis rak dan menghitung kapasitas…</p>
            <p className="text-xs text-zinc-500">Biasanya 1–2 menit. Jangan tutup halaman ini.</p>
            <button
              type="button"
              onClick={skip}
              className="mt-1 h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100"
            >
              Lewati, pakai urutan standar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notice && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
            )}
            {state.phase === "ready" &&
              state.data.photoUrl &&
              state.data.annotations.skus.length + state.data.annotations.shelves.length > 0 && (
                <AnnotatedPhoto
                  category={category}
                  photoUrl={state.data.photoUrl}
                  annotations={state.data.annotations}
                />
              )}
            <PlanView
              category={category}
              plan={state.phase === "ready" ? state.data.plan : defaultPlan(category)}
            />
          </div>
        )}
      </section>

      <AfterForm
        beforeId={beforeId}
        storeId={storeId}
        storeName={storeName}
        category={category}
        usedDefaultPlan={state.phase !== "ready"}
        // The SPG arranges the shelf by a plan, so the After waits until one is shown.
        locked={state.phase === "waiting"}
      />
    </div>
  );
}
