// Standard planograms per shelf category and the capacity-based plan builder.
// Shared between client (plan shown to SPG) and server (Claude prompt, scoring).
// Must not contain secrets.
import type { ShelfCategory } from "./validation";

export type PlanogramSku = {
  key: string;
  // Short name for the SPG screen.
  label: string;
  // Full product name, given to Claude to recognize the SKU.
  fullName: string;
  // Front-facing width of one unit on the shelf, in cm. Used as the
  // "ruler" to measure the shelf in the photo and to compute how many facings fit.
  widthCm: number;
};

export type Planogram = {
  brand: string;
  // Left-to-right order on the shelf, which is also the priority order: when
  // the space runs out, SKUs at the end of the list are left out.
  skus: PlanogramSku[];
};

// widthCm = "M width (cm)" of the single unit (PCS) in the Lark sheet "SKU Registration and
// Inbound Shipper x TA-2.0" (tab SKU Registration), SKU ID per line. "M length" is the
// longest side, i.e. the height of a unit standing on the shelf, so width is what faces out.
export const PLANOGRAMS: Record<ShelfCategory, Planogram> = {
  skincare: {
    brand: "Expert Care",
    skus: [
      { key: "cream_50", label: "prOATect Cream 50 gr", fullName: "Expert Care - Daily prOATect Soothing & Calming Cream 50 gr", widthCm: 5 }, // SKU 0307-002577
      { key: "cream_150", label: "prOATect Cream 150 gr", fullName: "Expert Care - Daily prOATect Soothing & Calming Cream 150 gr", widthCm: 5.5 }, // SKU 0307-002193; sheet says 8, measured from shelf photos against the 4 cm Calming Rub tubes
      { key: "sunscreen", label: "Light Physical Sunscreen 30 g", fullName: "Expert Care - Light Physical Sunscreen (30 gram)", widthCm: 4 }, // SKU 0307-002855; sheet says 3, measured from shelf photos against the 4 cm Calming Rub tubes
      { key: "toothpaste", label: "Nutrishine Toothpaste", fullName: "Expert Care - Nutrishine Toothpaste Strawberry", widthCm: 3 }, // SKU 0307-002918
      { key: "htt_pump", label: "Shampoo & Body Wash Pump 250 mL", fullName: "Expert Care Gentle prOATect Shampoo and Body Wash - Pump Packaging 250 mL", widthCm: 5 }, // SKU 0307-002891
      { key: "htt_pouch", label: "Shampoo & Body Wash Pouch 380 mL", fullName: "Expert Care Gentle prOATect Shampoo and Body Wash - Pouch Packaging 380 mL", widthCm: 11.5 }, // SKU 0307-002893
      { key: "lavender", label: "Lavender Rub Cream 50 g", fullName: "Expert Care Lavender Calming Rub Cream 50 g", widthCm: 4 }, // SKU 0307-002670
      { key: "telon", label: "Telon Rub Cream 50 g", fullName: "Expert Care Telon Calming Rub Cream 50 g", widthCm: 4 }, // SKU 0307-002671
      { key: "hair", label: "Hair Nutrilotion 100 ml", fullName: "Expert Care Hair Nutrilotion Peachy Fresh 100 ml", widthCm: 4 }, // SKU 0307-002776
      { key: "diaper", label: "Daily Diaper Cream 40 g", fullName: "Expert Care Daily Diaper Cream 40 gram", widthCm: 5 }, // SKU 0307-002889
    ],
  },
  vitamin: {
    brand: "Expert Boost",
    skus: [
      { key: "vitkids", label: "Vitkids Multi Gummy 30 hari", fullName: "Expert Boost - Vitkids Multi Gummy 30 hari (isi 30 gummy)", widthCm: 12 }, // SKU 0315-002906
      { key: "vit_d_30", label: "Vitamin D 30 hari", fullName: "Expert Boost Vitamin D Paket 30 hari (isi 30 gummy)", widthCm: 12 }, // SKU 0315-002593
      { key: "vit_d_7", label: "Vitamin D 7 hari", fullName: "Expert Boost Vitamin D Paket 7 hari (isi 7 gummy)", widthCm: 10 }, // SKU 0315-002790
    ],
  },
};

// Leftover space goes to the top SKUs, at most this many facings each.
export const MAX_FACINGS_PER_SKU = 3;
// Space between two facings on the shelf.
export const FACING_GAP_CM = 0.5;
// A row may be filled up to this much beyond its measured width (the width is
// an estimate and shelves are usually packed a bit tighter). It is a total per
// row, so a row never overflows by more than this.
export const SHELF_TOLERANCE_CM = 5;

export type PlanItem = { key: string; facings: number };

export type PlanRow = {
  // null for the default plan (shelf not measured).
  widthCm: number | null;
  usedCm: number;
  items: PlanItem[];
};

export type ShelfPlan = {
  // measured: built from the shelf width in the Before photo.
  // default: standard order, 1 facing each (analysis failed or no space found).
  source: "measured" | "default";
  rows: PlanRow[];
  // SKUs that did not fit, in priority order.
  excluded: string[];
};

export function planogramSkus(category: ShelfCategory): PlanogramSku[] {
  return PLANOGRAMS[category].skus;
}

export function skuNumber(category: ShelfCategory, key: string): number {
  return planogramSkus(category).findIndex((s) => s.key === key) + 1;
}

export function defaultPlan(category: ShelfCategory): ShelfPlan {
  const items = planogramSkus(category).map((s) => ({ key: s.key, facings: 1 }));
  return { source: "default", rows: [{ widthCm: null, usedCm: 0, items }], excluded: [] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Fills the brand's shelf space (one width per shelf row, top first, each
// allowed SHELF_TOLERANCE_CM of overflow):
// 1. One facing per SKU in priority order; a SKU that does not fit the current
//    row moves to the next row. When no row has room, stop: the rest is excluded.
// 2. Leftover space in each row goes to its top SKUs first, up to MAX_FACINGS_PER_SKU.
export function buildPlan(category: ShelfCategory, shelfWidthsCm: number[]): ShelfPlan {
  if (shelfWidthsCm.length === 0) return defaultPlan(category);

  const skus = planogramSkus(category);
  const widthOf = new Map(skus.map((s) => [s.key, s.widthCm]));
  const rows: PlanRow[] = shelfWidthsCm.map((w) => ({ widthCm: round1(w), usedCm: 0, items: [] }));
  // A gap only sits between two facings, not before the first one in a row.
  const cost = (row: PlanRow, key: string) => widthOf.get(key)! + (row.items.length > 0 ? FACING_GAP_CM : 0);
  // The extra 0.01 keeps rounding from rejecting a facing that fits exactly.
  const fits = (row: PlanRow, key: string) =>
    row.usedCm + cost(row, key) <= row.widthCm! + SHELF_TOLERANCE_CM + 0.01;

  let r = 0;
  let i = 0;
  for (; i < skus.length; i++) {
    while (r < rows.length && !fits(rows[r], skus[i].key)) r++;
    if (r === rows.length) break;
    rows[r].usedCm += cost(rows[r], skus[i].key);
    rows[r].items.push({ key: skus[i].key, facings: 1 });
  }

  for (const row of rows) {
    for (const item of row.items) {
      while (item.facings < MAX_FACINGS_PER_SKU && fits(row, item.key)) {
        row.usedCm += cost(row, item.key);
        item.facings++;
      }
    }
    row.usedCm = round1(row.usedCm);
  }

  return { source: "measured", rows, excluded: skus.slice(i).map((s) => s.key) };
}

// Planned SKUs in left-to-right order (rows top first).
export function plannedItems(plan: ShelfPlan): PlanItem[] {
  return plan.rows.flatMap((row) => row.items);
}
