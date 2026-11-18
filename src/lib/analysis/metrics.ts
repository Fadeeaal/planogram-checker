import { FACING_GAP_CM, buildPlan, defaultPlan, plannedItems, planogramSkus, type ShelfPlan } from "@/lib/planogram";
import type { ShelfCategory } from "@/lib/validation";
import type { AnalysisOutput, Box } from "./prompts";
import { heightLevel, shelfHeightCm } from "./shelf-height";

export type MeasuredShelf = {
  level: string;
  shelfFromBottom: number;
  heightCm: number | null;
  box: Box;
  widthCm: number;
  // ruler: measured from the known width of SKUs visible in the photo.
  // estimate: Claude's own estimate (no usable SKU to measure with).
  // occupied: the brand units already standing side by side on the row need
  // more room than the ruler measured, so their real width is used instead.
  method: "ruler" | "estimate" | "occupied";
  claudeEstimateCm: number;
};

const MIN_SHELF_CM = 5;
const MAX_SHELF_CM = 400;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Claude may return a box with min/max swapped.
function normalizeBox(box: Box): Box {
  return {
    x_min: Math.min(box.x_min, box.x_max),
    x_max: Math.max(box.x_min, box.x_max),
    y_min: Math.min(box.y_min, box.y_max),
    y_max: Math.max(box.y_min, box.y_max),
  };
}

// A ruler sample further than this factor from the median is treated as a
// mis-boxed SKU and ignored.
const OUTLIER_FACTOR = 2;

// Converts the brand's shelf spans from image coordinates to centimeters,
// using the found SKUs as a ruler: (box width / box_facings) is one unit,
// whose real width is known. A row uses SKUs standing on that row when
// possible (perspective changes the scale per row), otherwise all SKUs.
// A row is never measured narrower than the brand units already standing on it.
export function measureShelves(category: ShelfCategory, output: AnalysisOutput): MeasuredShelf[] {
  const raw: { cy: number; unitsPerCm: number; facings: number; unitCm: number }[] = [];
  for (const sku of planogramSkus(category)) {
    const r = output.skus[sku.key];
    if (!r?.found || !r.box || r.box_facings < 1) continue;
    const box = normalizeBox(r.box);
    const width = box.x_max - box.x_min;
    if (width <= 0) continue;
    raw.push({
      cy: (box.y_min + box.y_max) / 2,
      unitsPerCm: width / r.box_facings / sku.widthCm,
      facings: r.box_facings,
      unitCm: sku.widthCm,
    });
  }
  const rawMedian = median(raw.map((s) => s.unitsPerCm));
  const samples = rawMedian
    ? raw.filter((s) => s.unitsPerCm <= rawMedian * OUTLIER_FACTOR && s.unitsPerCm >= rawMedian / OUTLIER_FACTOR)
    : [];
  const globalScale = median(samples.map((s) => s.unitsPerCm));
  const inRange = (cm: number) => cm >= MIN_SHELF_CM && cm <= MAX_SHELF_CM;

  return output.brand_shelves
    .map((shelf) => ({ ...shelf, box: normalizeBox(shelf.box) }))
    .sort((a, b) => a.box.y_min - b.box.y_min)
    .flatMap((shelf): MeasuredShelf[] => {
      const isOnRow = (s: { cy: number }) => s.cy >= shelf.box.y_min && s.cy <= shelf.box.y_max;
      const scale = median(samples.filter(isOnRow).map((s) => s.unitsPerCm)) ?? globalScale;
      const span = shelf.box.x_max - shelf.box.x_min;
      const ruler = scale && span > 0 ? span / scale : null;
      // Real width of the brand units in this row's boxes, with the gaps between them.
      const unitsOnRow = raw.filter(isOnRow);
      const facingsOnRow = unitsOnRow.reduce((n, s) => n + s.facings, 0);
      const occupied =
        unitsOnRow.reduce((cm, s) => cm + s.unitCm * s.facings, 0) + FACING_GAP_CM * Math.max(0, facingsOnRow - 1);

      let widthCm = 0;
      let method: MeasuredShelf["method"] = "ruler";
      if (ruler !== null && inRange(ruler)) {
        widthCm = ruler;
      } else if (inRange(shelf.estimated_width_cm)) {
        widthCm = shelf.estimated_width_cm;
        method = "estimate";
      }
      if (occupied > widthCm && inRange(occupied)) {
        widthCm = occupied;
        method = "occupied";
      }
      if (widthCm === 0) return [];
      const heightCm = shelfHeightCm(shelf.shelf_from_bottom);
      return [
        {
          level: heightLevel(heightCm),
          shelfFromBottom: shelf.shelf_from_bottom,
          heightCm,
          box: shelf.box,
          widthCm: Math.round(widthCm * 10) / 10,
          method,
          claudeEstimateCm: shelf.estimated_width_cm,
        },
      ];
    });
}

// Plan suggested from a Before photo. Falls back to the standard order when the
// measured space holds nothing (e.g. a mis-measured or out-of-stock slot), so
// the SPG never gets an empty plan.
export function planFromShelves(category: ShelfCategory, shelves: MeasuredShelf[]): ShelfPlan {
  const plan = buildPlan(category, shelves.map((s) => s.widthCm));
  return plannedItems(plan).length > 0 ? plan : defaultPlan(category);
}

export type PlanogramMetrics = {
  // On-shelf availability: share of planned SKUs found.
  osaPct: number | null;
  // Planned SKUs found in the correct relative order (longest common
  // subsequence with the plan), so missing and misplaced SKUs both count.
  compliancePct: number | null;
  // Planned SKUs with at least the planned number of facings.
  facingCompliancePct: number | null;
};

function lcsLength(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Scores a photo against a plan. Computed in code rather than by Claude so
// the scoring is deterministic.
export function computeMetrics(plan: ShelfPlan, output: AnalysisOutput): PlanogramMetrics {
  const planned = plannedItems(plan);
  if (planned.length === 0) return { osaPct: null, compliancePct: null, facingCompliancePct: null };

  const expected = planned.map((p) => p.key);
  const found = new Set(expected.filter((key) => output.skus[key]?.found));
  const observed = [...new Set(output.observed_order)].filter((key) => found.has(key));
  const enoughFacings = planned.filter(
    (p) => found.has(p.key) && output.skus[p.key].facing_count >= p.facings,
  ).length;
  const pct = (n: number) => Math.round((n / planned.length) * 100);

  return {
    osaPct: pct(found.size),
    compliancePct: pct(lcsLength(expected, observed)),
    facingCompliancePct: pct(enoughFacings),
  };
}
