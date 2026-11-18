import { skuNumber } from "@/lib/planogram";
import type { ImageBox, PlanAnnotations } from "@/lib/plan-status";
import type { ShelfCategory } from "@/lib/validation";
import { BRAND_COLORS } from "./PlanView";

// Converts a normalized 0-1000 box to CSS percentages over the image.
function boxStyle(box: ImageBox): React.CSSProperties {
  const clamp = (n: number) => Math.min(1000, Math.max(0, n));
  const x0 = clamp(Math.min(box.x_min, box.x_max));
  const x1 = clamp(Math.max(box.x_min, box.x_max));
  const y0 = clamp(Math.min(box.y_min, box.y_max));
  const y1 = clamp(Math.max(box.y_min, box.y_max));
  return {
    left: `${x0 / 10}%`,
    top: `${y0 / 10}%`,
    width: `${(x1 - x0) / 10}%`,
    height: `${(y1 - y0) / 10}%`,
  };
}

const formatCm = (cm: number) => cm.toLocaleString("id-ID", { maximumFractionDigits: 0 });

// The Before photo with the brand's products and shelf space marked by Claude.
export function AnnotatedPhoto({
  category,
  photoUrl,
  annotations,
}: {
  category: ShelfCategory;
  photoUrl: string;
  annotations: PlanAnnotations;
}) {
  const colors = BRAND_COLORS[category];

  return (
    <figure className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket */}
        <img src={photoUrl} alt="Foto rak sebelum ditata, dengan penanda produk" className="block h-auto w-full" />
        {annotations.shelves.map((shelf, i) => (
          <div
            key={`shelf-${i}`}
            style={boxStyle(shelf.box)}
            className="absolute rounded-sm border-2 border-dashed border-amber-400"
          >
            {/* Above the box, or inside it when the box touches the top of the photo. */}
            <span
              className={`absolute left-0 rounded-sm bg-amber-400 px-1 text-[10px] font-bold text-amber-950 ${
                Math.min(shelf.box.y_min, shelf.box.y_max) < 40 ? "top-0" : "-top-0.5 -translate-y-full"
              }`}
            >
              ± {formatCm(shelf.widthCm)} cm
            </span>
          </div>
        ))}
        {annotations.skus.map((sku) => (
          <div key={sku.key} style={boxStyle(sku.box)} className={`absolute rounded-sm border-2 ${colors.border}`}>
            <span
              className={`absolute left-0 top-0 rounded-br-sm px-1 text-[10px] font-bold ${colors.block} ${colors.text}`}
            >
              {skuNumber(category, sku.key)}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
