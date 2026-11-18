// Response of GET /api/plan/[id]: the planogram suggestion for a Before photo.
// Shared between client and server. Holds no scores (those are for Trade
// Marketing only), just what the SPG needs to arrange the shelf.
import type { ShelfPlan } from "./planogram";

// Normalized 0-1000 image coordinates, origin top-left.
export type ImageBox = { x_min: number; y_min: number; x_max: number; y_max: number };

export type PlanAnnotations = {
  skus: { key: string; facings: number; box: ImageBox }[];
  shelves: { box: ImageBox; widthCm: number; method: "ruler" | "estimate" }[];
};

export type PlanStatus =
  | { status: "waiting" }
  | { status: "failed" }
  | {
      status: "ready";
      plan: ShelfPlan;
      annotations: PlanAnnotations;
      detectedBrand: string | null;
      photoIssue: string | null;
      // Short-lived link to the Before photo for the annotated view.
      photoUrl: string | null;
    };
