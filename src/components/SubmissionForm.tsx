"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHELF_CATEGORY_LABELS, type ShelfCategory, type Store } from "@/lib/validation";
import { ChoiceToggle, type Choice } from "./ChoiceToggle";
import { PhotoPicker } from "./PhotoPicker";
import { StoreCombobox } from "./StoreCombobox";
import { SubmitBar } from "./SubmitBar";
import { usePhotoSubmission } from "./usePhotoSubmission";

type FieldErrors = { store?: string; category?: string };

const CATEGORY_OPTIONS: Choice<ShelfCategory>[] = [
  { value: "skincare", label: SHELF_CATEGORY_LABELS.skincare, hint: "Expert Care" },
  { value: "vitamin", label: SHELF_CATEGORY_LABELS.vitamin, hint: "Expert Boost" },
];

// Step 1 of a shelf visit: the Before photo. The After photo is taken on the
// planogram page this form leads to.
export function SubmissionForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const upload = usePhotoSubmission();

  const [store, setStore] = useState<Store | null>(null);
  const [category, setCategory] = useState<ShelfCategory | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  function clearFieldError(field: keyof FieldErrors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    upload.clearFailure();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (upload.busy || upload.processing) return;

    const nextErrors: FieldErrors = {};
    if (!store) nextErrors.store = "Pilih toko terlebih dahulu.";
    if (!category) nextErrors.category = "Pilih kategori rak: Skincare atau Vitamin.";
    if (!upload.photo) upload.setPhotoError("Foto rak belum ada. Ambil foto atau pilih dari galeri.");
    setErrors(nextErrors);
    if (!store || !category || !upload.photo) return;

    const id = await upload.submit({ storeId: store.id, shelfCategory: category, photoType: "before" });
    if (!id) return;
    router.push(`/planogram/${id}`);
    // Store and category stay selected for the next shelf in the same store.
    upload.reset();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 pb-44">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">1. Toko</h2>
        <StoreCombobox
          stores={stores}
          value={store}
          disabled={upload.busy}
          error={errors.store}
          onChange={(next) => {
            setStore(next);
            clearFieldError("store");
          }}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">2. Kategori Rak</h2>
        <ChoiceToggle
          label="Kategori rak"
          options={CATEGORY_OPTIONS}
          value={category}
          disabled={upload.busy}
          error={errors.category}
          onChange={(next) => {
            setCategory(next);
            clearFieldError("category");
          }}
        />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          3. Foto Rak Sebelum Ditata
        </h2>
        <p className="mb-2 text-sm text-zinc-600">
          Foto rak apa adanya, <b>sebelum</b> ditata. Setelah dikirim, planogram akan muncul.
        </p>
        <PhotoPicker
          photo={upload.photo}
          processing={upload.processing}
          disabled={upload.busy}
          error={upload.photoError}
          onSelect={upload.selectPhoto}
          onRemove={upload.removePhoto}
        />
      </section>

      <SubmitBar
        label="Kirim Foto Sebelum Ditata"
        phase={upload.phase}
        progress={upload.progress}
        error={upload.submitError}
        disabled={upload.processing}
      />
    </form>
  );
}
