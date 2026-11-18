import { PLANOGRAMS, skuNumber, type ShelfPlan } from "@/lib/planogram";
import type { ShelfCategory } from "@/lib/validation";

export const BRAND_COLORS: Record<ShelfCategory, { block: string; text: string; border: string }> = {
  skincare: { block: "bg-violet-200", text: "text-violet-950", border: "border-violet-500" },
  vitamin: { block: "bg-orange-200", text: "text-orange-950", border: "border-orange-500" },
};

const formatCm = (cm: number) => cm.toLocaleString("id-ID", { maximumFractionDigits: 0 });

// The shelf the SPG should build: per shelf row, the SKUs left to right with
// their facings. Numbers match the planogram order and the photo labels.
export function PlanView({ category, plan }: { category: ShelfCategory; plan: ShelfPlan }) {
  const { brand, skus } = PLANOGRAMS[category];
  const skuByKey = new Map(skus.map((s) => [s.key, s]));
  const colors = BRAND_COLORS[category];
  const multiRow = plan.rows.length > 1;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-900">Planogram {brand}</h3>
      <p className="mb-3 text-xs text-zinc-500">Urutan dari kiri ke kanan →</p>

      <div className="flex flex-col gap-4">
        {plan.rows.map((row, r) => (
          <div key={r}>
            {(multiRow || row.widthCm !== null) && (
              <p className="mb-1.5 text-xs font-medium text-zinc-600">
                {multiRow ? `Baris ${r + 1}${r === 0 ? " (atas)" : ""}` : "Jatah rak"}
                {row.widthCm !== null && ` · ± ${formatCm(row.widthCm)} cm`}
              </p>
            )}
            {row.items.length === 0 ? (
              <p className="text-sm text-zinc-500">Ruang terlalu sempit untuk produk berikutnya.</p>
            ) : (
              <>
                {/* Shelf strip, block widths proportional to the space each SKU takes. */}
                <div className="mb-2 flex h-9 gap-0.5 overflow-hidden rounded-md" aria-hidden>
                  {row.items.map((item) => (
                    <div
                      key={item.key}
                      style={{ flexGrow: item.facings * (skuByKey.get(item.key)?.widthCm ?? 1) }}
                      className={`flex min-w-0 basis-0 items-center justify-center text-xs font-bold ${colors.block} ${colors.text}`}
                    >
                      {skuNumber(category, item.key)}
                    </div>
                  ))}
                </div>
                <ol className="flex flex-col gap-1">
                  {row.items.map((item) => (
                    <li key={item.key} className="flex items-center gap-2 text-sm">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors.block} ${colors.text}`}
                      >
                        {skuNumber(category, item.key)}
                      </span>
                      <span className="flex-1 text-zinc-900">{skuByKey.get(item.key)?.label ?? item.key}</span>
                      <span className="shrink-0 font-semibold text-zinc-900">
                        {item.facings} facing
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
