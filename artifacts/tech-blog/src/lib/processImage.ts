/**
 * Client-side image processing — resizes oversized images before upload.
 * Skips GIFs (would lose animation) and SVGs.
 * Returns the original file untouched if it's already small enough.
 */
const MAX_DIMENSION = 2000; // Largest side, in CSS pixels
const QUALITY = 0.85;

export async function processImage(file: File): Promise<File> {
  // Don't touch animated formats or vectors
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const bitmap = await loadBitmap(file);
  // For HTMLImageElement fallback, width/height come from naturalWidth/Height
  const width = (bitmap as any).naturalWidth || bitmap.width;
  const height = (bitmap as any).naturalHeight || bitmap.height;

  // Already within limits AND under 2 MB → upload as-is, preserve original quality
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= 2 * 1024 * 1024) {
    bitmap.close?.();
    return file;
  }

  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  // Use original mime when supported by canvas; fall back to JPEG
  const outType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outType, QUALITY));
  if (!blob) return file;

  // If processing made it bigger (rare), keep the original
  if (blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${baseName}.${ext}`, { type: outType, lastModified: Date.now() });
}

type DrawableSource = CanvasImageSource & { width: number; height: number; close?: () => void };

async function loadBitmap(file: File): Promise<DrawableSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return (await createImageBitmap(file)) as DrawableSource;
    } catch {
      // fall through to <img> path
    }
  }
  return new Promise<DrawableSource>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // HTMLImageElement is a valid CanvasImageSource for drawImage
      resolve(img as unknown as DrawableSource);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    img.src = url;
  });
}
