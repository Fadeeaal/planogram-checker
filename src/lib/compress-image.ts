import { MAX_UPLOAD_BYTES } from "./validation";

const MAX_DIMENSION = 1600;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

export class ImageReadError extends Error {}

type Source = { image: CanvasImageSource; width: number; height: number; release: () => void };

// Decodes with EXIF orientation applied by the browser, so portrait phone photos stay upright.
// (browser-image-compression rotated some Android photos twice, squashing them.)
async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older browsers reject "from-image"; fall back to <img>, which also honors EXIF.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))), "image/jpeg", quality),
  );
}

// Resizes to max 1600px on the longest side and re-encodes as JPEG targeting <= 1.5 MB.
export async function compressImage(file: File): Promise<Blob> {
  let source: Source;
  try {
    source = await decode(file);
  } catch (err) {
    throw new ImageReadError(err instanceof Error ? err.message : "Cannot read image");
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageReadError("Canvas not available");
    ctx.drawImage(source.image, 0, 0, canvas.width, canvas.height);

    let output: Blob | null = null;
    for (const quality of QUALITIES) {
      output = await toJpeg(canvas, quality);
      if (output.size <= TARGET_BYTES) break;
    }
    if (!output || output.size > MAX_UPLOAD_BYTES) {
      throw new ImageReadError("Compressed image is still above the upload limit");
    }
    return output;
  } catch (err) {
    if (err instanceof ImageReadError) throw err;
    throw new ImageReadError(err instanceof Error ? err.message : "Cannot compress image");
  } finally {
    source.release();
  }
}
