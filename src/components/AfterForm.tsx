"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearPendingAfter, savePendingAfter } from "@/lib/pending-after";
import type { ShelfCategory } from "@/lib/validation";
import { PhotoPicker } from "./PhotoPicker";
import { SubmitBar } from "./SubmitBar";
import { usePhotoSubmission } from "./usePhotoSubmission";

type Props = {
  beforeId: string;
  storeId: string;
  storeName: string;
  category: ShelfCategory;
  // True when the SPG arranged the shelf by the standard order (no suggestion).
  usedDefaultPlan: boolean;
  // True while the suggestion is still loading.
  locked: boolean;
};

export function AfterForm({ beforeId, storeId, storeName, category, usedDefaultPlan, locked }: Props) {
  const router = useRouter();
  const upload = usePhotoSubmission();

  // Lets the home page offer a way back here if the SPG leaves this page.
  useEffect(() => {
    savePendingAfter({ beforeId, storeName, category });
  }, [beforeId, storeName, category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (upload.busy || upload.processing || locked) return;
    if (!upload.photo) {
      upload.setPhotoError("Foto rak belum ada. Ambil foto setelah rak ditata.");
      return;
    }

    const id = await upload.submit({
      storeId,
      photoType: "after",
      beforeSubmissionId: beforeId,
      usedDefaultPlan,
    });
    if (!id) return;
    clearPendingAfter(beforeId);
    router.push(`/sukses/${id}`);
    upload.reset();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="pb-44">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        2. Foto Rak Sesudah Ditata
      </h2>
      <p className="mb-2 text-sm text-zinc-600">
        {locked
          ? "Tunggu saran muncul (atau tekan Lewati), tata rak, lalu foto di sini."
          : "Foto rak yang sama setelah ditata sesuai saran."}
      </p>
      <PhotoPicker
        photo={upload.photo}
        processing={upload.processing}
        disabled={upload.busy || locked}
        error={upload.photoError}
        onSelect={upload.selectPhoto}
        onRemove={upload.removePhoto}
      />
      <SubmitBar
        label="Kirim Foto Sesudah Ditata"
        phase={upload.phase}
        progress={upload.progress}
        error={upload.submitError}
        disabled={upload.processing || locked}
      />
    </form>
  );
}
