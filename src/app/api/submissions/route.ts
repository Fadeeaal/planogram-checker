import { after } from "next/server";
import { enqueueAnalysis, runAnalysis, shouldAnalyze } from "@/lib/analysis/run";
import { defaultPlan, type ShelfPlan } from "@/lib/planogram";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_UPLOAD_BYTES,
  PHOTO_BUCKET,
  isAllowedMimeType,
  isPhotoType,
  isShelfCategory,
  isUuid,
  type ShelfCategory,
} from "@/lib/validation";

// Covers the background analysis started with after().
export const maxDuration = 300;

function badRequest(error: string, status = 400) {
  return Response.json({ error }, { status });
}

const PATH_RE = /^([0-9a-f-]{36})\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

// The Before submission an After photo refers to, if it is valid for this store.
async function findBefore(id: unknown, storeId: string) {
  if (!isUuid(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from("submissions")
    .select("id, store_id, photo_type, shelf_category")
    .eq("id", id)
    .maybeSingle();
  return data?.photo_type === "before" && data.store_id === storeId ? data : null;
}

// The plan the SPG arranged the shelf by: the Before photo's suggestion, or the
// standard order when the SPG did not get one (analysis failed or skipped).
// Throws on a database error so the client retries instead of the After being
// scored against a plan the SPG never saw.
async function targetPlan(beforeId: string, category: ShelfCategory, usedDefault: boolean) {
  if (usedDefault) return defaultPlan(category);
  const { data, error } = await getSupabaseAdmin()
    .from("submission_analyses")
    .select("status, plan")
    .eq("submission_id", beforeId)
    .maybeSingle();
  if (error) throw new Error(`Loading the Before plan failed: ${error.message}`);
  return data?.status === "done" && data.plan ? (data.plan as ShelfPlan) : defaultPlan(category);
}

// Records a submission after the photo has been uploaded to Storage.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Permintaan tidak valid.");

  const { storeId, shelfCategory, photoType, path, beforeSubmissionId, usedDefaultPlan } =
    body as Record<string, unknown>;

  if (!isUuid(storeId)) return badRequest("Toko belum dipilih atau tidak valid.");
  if (!isPhotoType(photoType)) return badRequest("Jenis foto harus sebelum atau sesudah ditata.");
  // The path must be one we issued for this store (see /api/upload-url).
  const match = typeof path === "string" ? PATH_RE.exec(path) : null;
  if (!match || match[1].toLowerCase() !== storeId.toLowerCase()) {
    return badRequest("Lokasi foto tidak valid.");
  }
  const photoPath = path as string;

  const supabase = getSupabaseAdmin();
  const bucket = supabase.storage.from(PHOTO_BUCKET);

  // After photos belong to a Before photo and inherit its shelf category.
  let category: unknown = shelfCategory;
  let beforeId: string | null = null;
  if (photoType === "after") {
    const before = await findBefore(beforeSubmissionId, storeId);
    if (!before) return badRequest("Foto sebelum ditata untuk rak ini tidak ditemukan.");
    category = before.shelf_category;
    beforeId = before.id;
  }
  if (!isShelfCategory(category)) return badRequest("Kategori rak harus Skincare atau Vitamin.");
  let plan: ShelfPlan | null = null;
  if (beforeId) {
    try {
      plan = await targetPlan(beforeId, category, usedDefaultPlan === true);
    } catch (err) {
      console.error("submissions:", err);
      return badRequest("Gagal menyimpan data. Coba lagi.", 500);
    }
  }

  // Verify the uploaded object really exists and is within limits; the client
  // uploaded it directly, so we never saw the bytes ourselves.
  const { data: info, error: infoError } = await bucket.info(photoPath);
  if (infoError || !info) {
    return badRequest("Foto belum terunggah. Tekan Coba Lagi untuk mengunggah ulang.", 409);
  }
  if (!isAllowedMimeType(info.contentType) || (info.size ?? 0) > MAX_UPLOAD_BYTES) {
    await bucket.remove([photoPath]);
    return badRequest("File harus berupa gambar dengan ukuran maksimal 5 MB.");
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      store_id: storeId,
      shelf_category: category,
      photo_type: photoType,
      photo_path: photoPath,
      before_submission_id: beforeId,
      target_plan: plan,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique violation on photo_path: an earlier attempt already saved this
      // submission but the response was lost. Return the existing row.
      const { data: existing } = await supabase
        .from("submissions")
        .select("id")
        .eq("photo_path", photoPath)
        .maybeSingle();
      if (existing) return Response.json({ id: existing.id });
      // Otherwise it is the one-After-per-Before index.
      // (Not 409: the client treats 409 as "upload the photo again".)
      if (beforeId) return badRequest("Foto sesudah ditata untuk rak ini sudah pernah dikirim.");
    }
    if (error.code === "23503") return badRequest("Toko tidak ditemukan.");
    console.error("submissions: insert failed", error);
    return badRequest("Gagal menyimpan data. Coba lagi.", 500);
  }

  if (shouldAnalyze(photoType)) {
    // Queue first so a crash in the background run still leaves a 'pending'
    // row for /api/analyses/run to pick up later.
    const queued = await enqueueAnalysis(data.id);
    if (queued) after(() => runAnalysis(data.id));
  }

  return Response.json({ id: data.id }, { status: 201 });
}
