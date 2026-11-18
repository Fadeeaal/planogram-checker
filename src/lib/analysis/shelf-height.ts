// Shelf heights are not estimated by Claude: Claude counts which shelf an item
// stands on (1 = lowest), and every shelf is assumed to sit SHELF_STEP_CM above
// the one below it. A rack of 4 shelves: 20, 40, 60, 80 cm from the floor.
export const SHELF_STEP_CM = 20;

// Height of a shelf from the floor; null when the shelf is unknown (0 or less).
export function shelfHeightCm(shelfFromBottom: number): number | null {
  return Number.isInteger(shelfFromBottom) && shelfFromBottom >= 1 ? shelfFromBottom * SHELF_STEP_CM : null;
}

// Position label used in the reports. Bands: Bawah up to 40 cm, Tengah up to
// 80 cm, Eye Level up to 140 cm, Atas above that.
export function heightLevel(heightCm: number | null): string {
  if (heightCm === null) return "Tidak Diketahui";
  if (heightCm <= 40) return "Bawah";
  if (heightCm <= 80) return "Tengah";
  if (heightCm <= 140) return "Eye Level";
  return "Atas";
}
