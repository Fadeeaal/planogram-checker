import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_UPLOAD_BYTES,
  MIME_EXTENSIONS,
  PHOTO_BUCKET,
  isAllowedMimeType,
  isPhotoType,
  isUuid,
} from "@/lib/validation";

function badRequest(error: string, status = 400) {
  return Response.json({ error }, { status });
}

// Issues a one-time signed upload URL so the browser can upload straight to
// the private bucket without ever holding the service_role key.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Permintaan tidak valid.");

  const { storeId, photoType, contentType, size } = body as Record<string, unknown>;

  if (!isUuid(storeId)) return badRequest("Toko belum dipilih atau tidak valid.");
  if (!isPhotoType(photoType)) return badRequest("Jenis foto harus sebelum atau sesudah ditata.");
  if (!isAllowedMimeType(contentType)) {
    return badRequest("File harus berupa gambar (JPG, PNG, atau WEBP).");
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return badRequest("Ukuran file tidak valid.");
  }
  if (size > MAX_UPLOAD_BYTES) return badRequest("Ukuran foto maksimal 5 MB.");

  const supabase = getSupabaseAdmin();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError) {
    console.error("upload-url: store lookup failed", storeError);
    return badRequest("Terjadi kesalahan di server. Coba lagi.", 500);
  }
  if (!store) return badRequest("Toko tidak ditemukan.");

  // Path layout: {store_id}/{yyyy-mm}/{uuid}.{ext}
  const month = new Date().toISOString().slice(0, 7);
  const path = `${storeId}/${month}/${crypto.randomUUID()}.${MIME_EXTENSIONS[contentType]}`;

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("upload-url: createSignedUploadUrl failed", error);
    return badRequest("Gagal menyiapkan upload. Coba lagi.", 500);
  }

  return Response.json({ path: data.path, signedUrl: data.signedUrl });
}
