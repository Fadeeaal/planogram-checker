import { runPendingAnalyses } from "@/lib/analysis/run";

export const maxDuration = 300;

// Stop starting new analyses after this, so the last one can finish within maxDuration.
const BUDGET_MS = 150_000;

// Retries pending/failed/stuck analyses. Called by Vercel Cron (GET) or
// manually (POST), both with `Authorization: Bearer <CRON_SECRET>`.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runPendingAnalyses(BUDGET_MS));
  } catch (err) {
    console.error("analyses/run failed", err);
    return Response.json({ error: "Failed to run analyses" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
