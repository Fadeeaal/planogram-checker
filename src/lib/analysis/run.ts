import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PHOTO_BUCKET, isShelfCategory, type PhotoType } from "@/lib/validation";
import { defaultPlan, type ShelfPlan } from "@/lib/planogram";
import { analyzeShelfPhoto } from "./claude";
import { computeMetrics, measureShelves, planFromShelves } from "./metrics";
import { PROMPT_VERSION, type AnalysisOutput } from "./prompts";

// Only these photo types get an AI score. Before is the baseline, After shows
// whether the shelf now follows the planogram.
export const ANALYZED_PHOTO_TYPES: readonly PhotoType[] = ["before", "after"];

export const MAX_ATTEMPTS = 3;

// An 'analyzing' row older than this is treated as a crashed run.
const STALE_MS = 10 * 60 * 1000;

const MEDIA_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export function shouldAnalyze(photoType: PhotoType): boolean {
  return ANALYZED_PHOTO_TYPES.includes(photoType);
}

// Returns false when the submission was already queued (e.g. a retried request).
export async function enqueueAnalysis(submissionId: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("submission_analyses")
    .insert({ submission_id: submissionId, status: "pending" });
  if (!error) return true;
  if (error.code !== "23505") console.error("analysis: enqueue failed", submissionId, error);
  return false;
}

type AnalysisRow = { id: string; status: string; attempts: number; started_at: string | null };

function isRunnable(row: AnalysisRow): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  if (row.status === "pending" || row.status === "failed") return true;
  if (row.status === "analyzing" && row.started_at) {
    return Date.now() - new Date(row.started_at).getTime() > STALE_MS;
  }
  return false;
}

// The plan stored on the After photo of this Before's visit, if one was sent.
async function afterTargetPlan(beforeId: string): Promise<ShelfPlan | null> {
  const { data } = await getSupabaseAdmin()
    .from("submissions")
    .select("target_plan")
    .eq("before_submission_id", beforeId)
    .maybeSingle();
  return (data?.target_plan as ShelfPlan | null) ?? null;
}

// Re-scores an already analyzed Before photo against the plan the SPG
// followed (it was first scored against its own suggestion). Uses the stored
// Claude output, so no new API call. Best effort: failures are only logged.
async function rescoreBefore(beforeId: string, plan: ShelfPlan) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("submission_analyses")
    .select("id, status, prompt_version, raw_output")
    .eq("submission_id", beforeId)
    .maybeSingle();
  if (data?.status !== "done" || data.prompt_version !== PROMPT_VERSION || !data.raw_output) return;

  const metrics = computeMetrics(plan, data.raw_output as AnalysisOutput);
  const { error } = await supabase
    .from("submission_analyses")
    .update({
      osa_pct: metrics.osaPct,
      planogram_compliance_pct: metrics.compliancePct,
      facing_compliance_pct: metrics.facingCompliancePct,
    })
    .eq("id", data.id);
  if (error) console.error("analysis: rescoring Before failed", beforeId, error);
}

// Analyzes one submission. Never throws: failures are recorded on the row.
export async function runAnalysis(submissionId: string): Promise<"done" | "failed" | "skipped"> {
  const supabase = getSupabaseAdmin();
  const table = supabase.from("submission_analyses");

  const { data: row } = await table
    .select("id, status, attempts, started_at")
    .eq("submission_id", submissionId)
    .maybeSingle<AnalysisRow>();
  if (!row || !isRunnable(row)) return "skipped";

  // Claim the row; matching on attempts keeps two runners from both taking it.
  const { data: claimed } = await supabase
    .from("submission_analyses")
    .update({
      status: "analyzing",
      attempts: row.attempts + 1,
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .select("id")
    .maybeSingle();
  if (!claimed) return "skipped";

  try {
    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("photo_path, shelf_category, photo_type, target_plan, before_submission_id")
      .eq("id", submissionId)
      .single();
    if (subError) throw new Error(`Submission lookup failed: ${subError.message}`);
    if (!isShelfCategory(submission.shelf_category)) {
      throw new Error("Submission has no shelf_category");
    }

    const { data: file, error: dlError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(submission.photo_path);
    if (dlError || !file) throw new Error(`Photo download failed: ${dlError?.message ?? "empty"}`);

    const ext = submission.photo_path.split(".").pop()?.toLowerCase() as keyof typeof MEDIA_TYPES;
    const mediaType = MEDIA_TYPES[ext] ?? "image/jpeg";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const result = await analyzeShelfPhoto(submission.shelf_category, { base64, mediaType });
    const out = result.output;
    const category = submission.shelf_category;
    const shelves = measureShelves(category, out);
    const isAfter = submission.photo_type === "after";
    // Before: suggest a plan from the measured shelf space. After: the plan the
    // SPG was shown (copied onto the After row on submit).
    const plan = isAfter
      ? ((submission.target_plan as ShelfPlan | null) ?? defaultPlan(category))
      : planFromShelves(category, shelves);
    // Both photos of a visit are scored against the plan the SPG followed, so
    // the Before-vs-After report compares like with like.
    const scoringPlan = isAfter ? plan : ((await afterTargetPlan(submissionId)) ?? plan);
    const metrics = computeMetrics(scoringPlan, out);

    const { error: saveError } = await supabase
      .from("submission_analyses")
      .update({
        status: "done",
        model: result.model,
        prompt_version: PROMPT_VERSION,
        summary: out.shelf_summary,
        photo_issue: out.photo_issue,
        detected_brand: out.detected_brand,
        products: out.skus,
        observed_order: out.observed_order,
        shelves,
        plan,
        osa_pct: metrics.osaPct,
        planogram_compliance_pct: metrics.compliancePct,
        facing_compliance_pct: metrics.facingCompliancePct,
        sos_pct: out.brand_share_of_shelf_pct,
        eye_level: out.brand_shelf_level,
        eye_level_m: out.brand_eye_level_m,
        deviations: out.deviations,
        competitors: out.top_competitors,
        recommendations: out.recommendations,
        raw_output: out,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (saveError) throw new Error(`Saving result failed: ${saveError.message}`);
    if (isAfter && submission.before_submission_id) {
      await rescoreBefore(submission.before_submission_id, plan);
    }
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("analysis: failed", submissionId, message);
    await supabase
      .from("submission_analyses")
      .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
      .eq("id", row.id);
    return "failed";
  }
}

// Catch-up runner (the web version of ShelfChecker's startBackfill): processes
// pending, failed (under MAX_ATTEMPTS) and stuck rows until the time budget runs out.
export async function runPendingAnalyses(budgetMs: number) {
  const startedAt = Date.now();
  const { data: rows, error } = await getSupabaseAdmin()
    .from("submission_analyses")
    .select("submission_id, status, attempts, started_at, id")
    .in("status", ["pending", "failed", "analyzing"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(50);
  if (error) throw new Error(`Failed to list analyses: ${error.message}`);

  const candidates = (rows ?? []).filter(isRunnable);
  const summary = { candidates: candidates.length, done: 0, failed: 0, skipped: 0, remaining: 0 };

  for (const row of candidates) {
    if (Date.now() - startedAt > budgetMs) {
      summary.remaining++;
      continue;
    }
    summary[await runAnalysis(row.submission_id)]++;
  }
  return summary;
}
