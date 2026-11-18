import "server-only";
import { connection } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ImageBox, PlanStatus } from "./plan-status";
import type { ShelfPlan } from "./planogram";
import {
  PHOTO_BUCKET,
  isShelfCategory,
  isUuid,
  type PhotoType,
  type ShelfCategory,
  type Store,
} from "./validation";

export async function getStores(): Promise<Store[]> {
  // Always read at request time so newly added stores show up immediately.
  await connection();
  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, chain, area, channel")
    .order("name");
  if (error) throw new Error(`Failed to load stores: ${error.message}`);
  return data;
}

export type SubmissionDetail = {
  id: string;
  storeId: string;
  shelfCategory: ShelfCategory | null;
  photoType: PhotoType;
  submittedAt: string;
  store: Pick<Store, "name" | "chain" | "area">;
  // For a Before photo: the After photo of the same visit, once sent.
  afterSubmissionId: string | null;
  photoPath: string;
};

export async function getSubmission(id: string): Promise<SubmissionDetail | null> {
  await connection();
  if (!isUuid(id)) return null;

  const supabase = getSupabaseAdmin();
  const [{ data, error }, { data: after }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, store_id, shelf_category, photo_type, photo_path, submitted_at, stores(name, chain, area)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("submissions").select("id").eq("before_submission_id", id).maybeSingle(),
  ]);
  if (error) throw new Error(`Failed to load submission: ${error.message}`);
  if (!data) return null;

  // Many-to-one join; supabase-js types it loosely without generated DB types.
  const store = (Array.isArray(data.stores) ? data.stores[0] : data.stores) as
    | SubmissionDetail["store"]
    | undefined;

  return {
    id: data.id,
    storeId: data.store_id,
    afterSubmissionId: after?.id ?? null,
    photoPath: data.photo_path,
    shelfCategory: isShelfCategory(data.shelf_category) ? data.shelf_category : null,
    photoType: data.photo_type as PhotoType,
    submittedAt: data.submitted_at,
    store: store ?? { name: "-", chain: null, area: null },
  };
}

// Short-lived link to a photo in the private bucket.
export async function getPhotoUrl(path: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

type StoredShelf = { box: ImageBox; widthCm: number; method: "ruler" | "estimate" };
type StoredSku = { found: boolean; facing_count: number; box: ImageBox | null };

export async function getPlanStatus(beforeId: string): Promise<PlanStatus | null> {
  await connection();
  if (!isUuid(beforeId)) return null;

  const supabase = getSupabaseAdmin();
  const [{ data: submission }, { data: analysis }] = await Promise.all([
    supabase.from("submissions").select("photo_type, photo_path").eq("id", beforeId).maybeSingle(),
    supabase
      .from("submission_analyses")
      .select("status, plan, products, shelves, detected_brand, photo_issue")
      .eq("submission_id", beforeId)
      .maybeSingle(),
  ]);
  if (submission?.photo_type !== "before") return null;
  // The analysis row is queued before the Before submit returns, so a missing
  // row means queueing failed and nothing will run.
  if (!analysis) return { status: "failed" };
  if (analysis.status === "pending" || analysis.status === "analyzing") return { status: "waiting" };
  // Rows analyzed by an older prompt version have no plan.
  if (analysis.status !== "done" || !analysis.plan) return { status: "failed" };

  const products = (analysis.products ?? {}) as Record<string, StoredSku>;
  return {
    status: "ready",
    plan: analysis.plan as ShelfPlan,
    annotations: {
      skus: Object.entries(products).flatMap(([key, sku]) =>
        sku.found && sku.box ? [{ key, facings: sku.facing_count, box: sku.box }] : [],
      ),
      shelves: ((analysis.shelves ?? []) as StoredShelf[]).map(({ box, widthCm, method }) => ({
        box,
        widthCm,
        method,
      })),
    },
    detectedBrand: analysis.detected_brand,
    photoIssue: analysis.photo_issue,
    // Signed here rather than at page render, so it is fresh when first shown.
    photoUrl: await getPhotoUrl(submission.photo_path),
  };
}
