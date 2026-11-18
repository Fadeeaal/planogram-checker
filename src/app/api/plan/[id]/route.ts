import { getPlanStatus } from "@/lib/data";

// Polled by the planogram page until the Before photo's suggestion is ready.
export async function GET(_request: Request, ctx: RouteContext<"/api/plan/[id]">) {
  const { id } = await ctx.params;
  const status = await getPlanStatus(id);
  if (!status) return Response.json({ error: "Foto sebelum ditata tidak ditemukan." }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
