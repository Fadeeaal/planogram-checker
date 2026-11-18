// Shared between client and server. Must not contain secrets.

export const PHOTO_BUCKET = "shelf-photos";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MIME_EXTENSIONS: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PHOTO_TYPES = ["before", "after"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  before: "Sebelum ditata",
  after: "Sesudah ditata",
};

export const SHELF_CATEGORIES = ["skincare", "vitamin"] as const;
export type ShelfCategory = (typeof SHELF_CATEGORIES)[number];

export const SHELF_CATEGORY_LABELS: Record<ShelfCategory, string> = {
  skincare: "Skincare",
  vitamin: "Vitamin",
};

export type Store = {
  id: string;
  name: string;
  chain: string | null;
  area: string | null;
  channel: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isPhotoType(value: unknown): value is PhotoType {
  return typeof value === "string" && (PHOTO_TYPES as readonly string[]).includes(value);
}

export function isShelfCategory(value: unknown): value is ShelfCategory {
  return typeof value === "string" && (SHELF_CATEGORIES as readonly string[]).includes(value);
}

export function isAllowedMimeType(value: unknown): value is AllowedMimeType {
  return typeof value === "string" && (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}
