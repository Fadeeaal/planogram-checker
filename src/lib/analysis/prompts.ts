import * as z from "zod/v4";
import { PLANOGRAMS, planogramSkus } from "@/lib/planogram";
import type { ShelfCategory } from "@/lib/validation";
import { heightLevel, shelfHeightCm } from "./shelf-height";

// Bump whenever the prompt or schema changes; stored with every result so
// scores from different versions can be told apart.
export const PROMPT_VERSION = "v7-sku-widths";

// Label fields are plain strings, not z.enum: the SDK's output format only puts
// enums in the description (the API does not enforce them), and a single
// off-list value would make the whole parse fail. Allowed values are in the
// prompt; code that reads these fields ignores unknown values.
export const DETECTED_BRANDS = ["Expert Care", "Expert Boost", "Keduanya", "Tidak Ada"] as const;

// Normalized 0-1000 image coordinates, origin top-left. A fresh schema per use:
// a shared instance would be emitted as a $ref, which we avoid in the output schema.
const box = () =>
  z.object({
    x_min: z.number(),
    y_min: z.number(),
    x_max: z.number(),
    y_max: z.number(),
  });
export type Box = z.infer<ReturnType<typeof box>>;

// One schema shared by every SKU (skus is a list keyed by `key`). Repeating it
// per SKU made the skincare schema (10 SKUs) too large for structured outputs
// ("compiled grammar is too large").
const SkuEntry = z.object({
  key: z.string(),
  found: z.boolean(),
  // Total facings of this SKU in the photo (all rows); used for scoring.
  facing_count: z.number().int(),
  // Shelf the box is on, counted from the floor (1 = lowest); 0 if not found.
  shelf_from_bottom: z.number().int(),
  // One contiguous run of side-by-side units on one row, used as the ruler.
  box: box().nullable(),
  box_facings: z.number().int(),
  notes: z.string(),
});
type SkuEntry = z.infer<typeof SkuEntry>;

// A SKU as stored: Claude's entry plus its height, computed in code (see shelf-height.ts).
export type SkuResult = Omit<SkuEntry, "key"> & { height_cm: number | null; shelf_level: string };

const NOT_FOUND: SkuResult = {
  found: false,
  facing_count: 0,
  shelf_from_bottom: 0,
  height_cm: null,
  shelf_level: "Tidak Ditemukan",
  box: null,
  box_facings: 0,
  notes: "",
};

const BrandShelf = z.object({
  shelf_from_bottom: z.number().int(),
  box: box(),
  estimated_width_cm: z.number(),
});
export type BrandShelf = z.infer<typeof BrandShelf>;

// What Claude returns. The same schema serves both categories; the SKU keys
// are listed in the prompt.
export const ANALYSIS_SCHEMA = z.object({
  photo_issue: z.string().nullable(),
  detected_brand: z.string(),
  skus: z.array(SkuEntry),
  observed_order: z.array(z.string()),
  brand_shelves: z.array(BrandShelf),
  brand_share_of_shelf_pct: z.number().nullable(),
  deviations: z.array(z.string()),
  top_competitors: z.array(z.string()),
  shelf_summary: z.string(),
  recommendations: z.array(z.string()),
});
export type ClaudeOutput = z.infer<typeof ANALYSIS_SCHEMA>;

// Claude's output with skus keyed by SKU key: every planogram SKU present
// (missing ones as not found), unknown keys dropped, plus heights computed in
// code. Stored as raw_output.
export type AnalysisOutput = Omit<ClaudeOutput, "skus"> & {
  skus: Record<string, SkuResult>;
  // Main brand block: the widest brand_shelves entry, else the shelf holding
  // the most found facings.
  brand_shelf_from_bottom: number | null;
  brand_shelf_level: string;
  brand_eye_level_m: number | null;
};

// Shelf (from the floor) of the main brand block: the widest measured brand
// span, else the shelf holding the most facings of found SKUs.
function mainBrandShelf(shelves: BrandShelf[], skus: Record<string, SkuResult>): number | null {
  const spanOf = (b: Box) => Math.abs(b.x_max - b.x_min);
  const widest = shelves
    .filter((sh) => shelfHeightCm(sh.shelf_from_bottom) !== null)
    .sort((a, b) => spanOf(b.box) - spanOf(a.box))[0];
  if (widest) return widest.shelf_from_bottom;

  const facingsPerShelf = new Map<number, number>();
  for (const sku of Object.values(skus)) {
    if (sku.height_cm === null) continue;
    facingsPerShelf.set(sku.shelf_from_bottom, (facingsPerShelf.get(sku.shelf_from_bottom) ?? 0) + sku.facing_count);
  }
  return [...facingsPerShelf].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function normalizeOutput(category: ShelfCategory, raw: ClaudeOutput): AnalysisOutput {
  const skus: Record<string, SkuResult> = {};
  for (const { key } of planogramSkus(category)) {
    // A key listed twice: prefer the entry that was found.
    const entries = raw.skus.filter((e) => e.key === key);
    const entry = entries.find((e) => e.found) ?? entries[0];
    if (!entry) {
      skus[key] = NOT_FOUND;
      continue;
    }
    const { found, facing_count, shelf_from_bottom, box, box_facings, notes } = entry;
    const height = found ? shelfHeightCm(shelf_from_bottom) : null;
    skus[key] = {
      found,
      facing_count,
      shelf_from_bottom,
      height_cm: height,
      shelf_level: found ? heightLevel(height) : "Tidak Ditemukan",
      box,
      box_facings,
      notes,
    };
  }

  const brandShelf = mainBrandShelf(raw.brand_shelves, skus);
  const brandHeight = brandShelf === null ? null : shelfHeightCm(brandShelf);

  return {
    ...raw,
    skus,
    brand_shelf_from_bottom: brandShelf,
    brand_shelf_level: brandHeight === null ? "Tidak Ditemukan" : heightLevel(brandHeight),
    brand_eye_level_m: brandHeight === null ? null : brandHeight / 100,
  };
}

const COMPETITOR_EXAMPLES: Record<ShelfCategory, string> = {
  skincare: "Gently, Moell, Cetaphil, Dove, Vaseline, Nivea, Wardah",
  vitamin: "Youvit, Blackmores, Centrum, Enervon, Vitacimin, Hemaviton",
};

const CATEGORY_NAMES: Record<ShelfCategory, string> = {
  skincare: "SKINCARE",
  vitamin: "VITAMIN / SUPPLEMENT",
};

export function buildPrompt(category: ShelfCategory): string {
  const { brand, skus } = PLANOGRAMS[category];
  const skuLines = skus
    .map((s, i) => `${i + 1}. ${s.key}: ${s.fullName} (one unit is ~${s.widthCm} cm wide)`)
    .join("\n");

  return (
    `You are a retail shelf auditor for the Tentang Anak brands Expert Care (skincare) and Expert Boost (vitamins). ` +
    `This photo was submitted as a ${CATEGORY_NAMES[category]} shelf, which should hold "${brand}".\n\n` +
    `${brand} SKUs, in planogram order (left to right):\n${skuLines}\n\n` +
    "Work in three steps.\n\n" +
    "STEP 1 — Brand check. Decide which Tentang Anak brand is on this shelf: detected_brand = " +
    '"Expert Care", "Expert Boost", "Keduanya" (both) or "Tidak Ada" (neither).\n\n' +
    `STEP 2 — Locate. Return skus with exactly one entry per SKU above, in list order, found or not ` +
    `(key = its key, e.g. "${skus[0].key}"). Find every ${brand} SKU. For each one:\n` +
    "- facing_count: ALL its front-facing units in the photo, on every row (0 if not found).\n" +
    "- box: a tight box around ONE contiguous run of its units standing side by side on a single row " +
    "(its largest run); no other product may be inside the box. box_facings = the number of units in that box. " +
    "box = null and box_facings = 0 if not found.\n" +
    "- shelf_from_bottom: the shelf the box stands on, counted from the floor (lowest shelf = 1, the next one up = 2, ...); " +
    "0 if not found.\n" +
    "Mark a SKU found only when you can read or clearly recognize it; if unsure, set found=false and explain in notes. " +
    `Every other brand (e.g. ${COMPETITOR_EXAMPLES[category]}) is a competitor, never one of these SKUs.\n\n` +
    `STEP 3 — Measure. For each shelf row where ${brand} currently has space, give brand_shelves one entry ` +
    "(top row first): box = the full horizontal span of the brand's space on that row, i.e. its products plus " +
    "empty slots, price tags or shelf strips clearly belonging to it, excluding competitor products; " +
    "estimated_width_cm = that span in real centimeters, using the known unit widths above as a ruler; " +
    "shelf_from_bottom = that row counted from the floor, as in STEP 2. " +
    "Return an empty array if the brand has no space on this shelf.\n\n" +
    "Counting shelves from the floor: count every shelf of this rack, including the base shelf at the floor. " +
    "If the bottom of the rack is cut off, estimate how many shelves are below the photo edge and include them.\n\n" +
    "Coordinates are normalized to 0-1000: x from the left edge (0) to the right edge (1000) of the image, " +
    "y from the top (0) to the bottom (1000).\n\n" +
    "Also return:\n" +
    "- photo_issue: null if the photo is usable; otherwise what is wrong (blurry, rotated, shelf cut off, too far).\n" +
    "- observed_order: the keys (e.g. " +
    `"${skus[0].key}") of the SKUs you found, in the order they appear from left to right ` +
    "(each SKU once, by its leftmost facing; top row first).\n" +
    `- brand_share_of_shelf_pct: ${brand}'s share of the total horizontal shelf space of this category visible in the photo (0-100); null if not found.\n` +
    "- deviations: each concrete difference from the planogram order (missing SKU, wrong position, blocked or hidden).\n" +
    "- top_competitors: up to 3 competitor brands on this shelf.\n" +
    "- shelf_summary: 1 sentence.\n" +
    "- recommendations: up to 3 concrete actions for the shelf staff.\n\n" +
    "Write all free text in Bahasa Indonesia."
  );
}
