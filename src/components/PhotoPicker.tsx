"use client";

import { useRef } from "react";
import { formatBytes } from "@/lib/validation";

export type SelectedPhoto = {
  blob: Blob;
  previewUrl: string;
  originalSize: number;
};

type Props = {
  photo: SelectedPhoto | null;
  processing: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
  error?: string;
  disabled?: boolean;
};

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}

export function PhotoPicker({ photo, processing, onSelect, onRemove, error, disabled }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (file) onSelect(file);
  }

  const busy = disabled || processing;

  return (
    <div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />

      {photo ? (
        <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={photo.previewUrl} alt="Pratinjau foto rak" className="max-h-[50vh] w-full bg-zinc-100 object-contain" />
          <p className="px-3 pt-2 text-xs text-zinc-500">
            {formatBytes(photo.blob.size)} (asli {formatBytes(photo.originalSize)})
          </p>
          <div className="grid grid-cols-2 gap-2 p-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="h-12 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 active:bg-zinc-100 disabled:opacity-50"
            >
              Ambil Ulang
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="h-12 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-800 active:bg-zinc-100 disabled:opacity-50"
            >
              Pilih Lain
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="col-span-2 h-12 rounded-lg text-sm font-medium text-red-600 active:bg-red-50 disabled:opacity-50"
            >
              Hapus Foto
            </button>
          </div>
        </div>
      ) : processing ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-sm text-zinc-600">
          Memproses foto…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className={`flex h-28 flex-col items-center justify-center gap-2 rounded-xl border bg-white text-base font-semibold text-zinc-900 active:bg-zinc-100 disabled:opacity-50 ${
              error ? "border-red-500" : "border-zinc-300"
            }`}
          >
            <CameraIcon />
            Ambil Foto
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className={`flex h-28 flex-col items-center justify-center gap-2 rounded-xl border bg-white text-base font-semibold text-zinc-900 active:bg-zinc-100 disabled:opacity-50 ${
              error ? "border-red-500" : "border-zinc-300"
            }`}
          >
            <GalleryIcon />
            Pilih dari Galeri
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
