"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/compress-image";
import { NETWORK_MESSAGE, RequestError, postJson, uploadToSignedUrl } from "@/lib/upload";
import type { PhotoType, ShelfCategory } from "@/lib/validation";
import type { SelectedPhoto } from "./PhotoPicker";

export type SubmitPhase = "idle" | "uploading" | "saving" | "failed";

export type SubmitFields = {
  storeId: string;
  photoType: PhotoType;
  shelfCategory?: ShelfCategory;
  beforeSubmissionId?: string;
  usedDefaultPlan?: boolean;
};

// Remembers a finished upload so "Coba Lagi" after a failed save does not
// re-upload the same photo over a weak connection.
type UploadedPhoto = { blob: Blob; storeId: string; path: string };

// Photo selection (with client-side compression) plus the upload + save flow,
// shared by the Before and After forms.
export function usePhotoSubmission() {
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const uploadedRef = useRef<UploadedPhoto | null>(null);
  const selectionRef = useRef(0);

  const busy = phase === "uploading" || phase === "saving";

  // Editing the form after a failure turns "Coba Lagi" back into "Kirim".
  function clearFailure() {
    if (phase === "failed") {
      setPhase("idle");
      setSubmitError(null);
    }
  }

  function replacePhoto(next: SelectedPhoto | null) {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
  }

  async function selectPhoto(file: File) {
    setPhotoError(undefined);
    clearFailure();
    const selection = ++selectionRef.current;
    replacePhoto(null);
    setProcessing(true);
    try {
      const blob = await compressImage(file);
      if (selection !== selectionRef.current) return;
      replacePhoto({ blob, previewUrl: URL.createObjectURL(blob), originalSize: file.size });
    } catch {
      if (selection !== selectionRef.current) return;
      setPhotoError("Foto tidak bisa dibaca. Coba ambil ulang atau pilih foto lain (JPG/PNG).");
    } finally {
      if (selection === selectionRef.current) setProcessing(false);
    }
  }

  function removePhoto() {
    selectionRef.current++;
    setProcessing(false);
    replacePhoto(null);
    setPhotoError(undefined);
    clearFailure();
  }

  // Returns the new submission id, or null when it failed (error is shown).
  async function submit(fields: SubmitFields): Promise<string | null> {
    if (!photo) return null;
    setSubmitError(null);
    setPhase("uploading");

    try {
      let path: string;
      const uploaded = uploadedRef.current;
      if (uploaded && uploaded.blob === photo.blob && uploaded.storeId === fields.storeId) {
        path = uploaded.path;
      } else {
        uploadedRef.current = null;
        setProgress(0);
        if (!navigator.onLine) throw new RequestError(NETWORK_MESSAGE, true);

        const target = await postJson<{ path: string; signedUrl: string }>("/api/upload-url", {
          storeId: fields.storeId,
          photoType: fields.photoType,
          contentType: photo.blob.type,
          size: photo.blob.size,
        });
        await uploadToSignedUrl(target.signedUrl, photo.blob, setProgress);
        uploadedRef.current = { blob: photo.blob, storeId: fields.storeId, path: target.path };
        path = target.path;
      }

      setPhase("saving");
      const { id } = await postJson<{ id: string }>("/api/submissions", { ...fields, path });
      return id;
    } catch (err) {
      // 409: the server could not find the uploaded file, so upload it again.
      if (err instanceof RequestError && err.status === 409) uploadedRef.current = null;
      setSubmitError(err instanceof RequestError ? err.message : "Terjadi kesalahan. Tekan Coba Lagi.");
      setPhase("failed");
      return null;
    }
  }

  function reset() {
    uploadedRef.current = null;
    replacePhoto(null);
    setProgress(0);
    setPhase("idle");
  }

  return {
    photo,
    processing,
    photoError,
    setPhotoError,
    selectPhoto,
    removePhoto,
    phase,
    progress,
    submitError,
    busy,
    clearFailure,
    submit,
    reset,
  };
}
