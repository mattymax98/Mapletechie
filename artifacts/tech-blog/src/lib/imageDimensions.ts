/**
 * Measure an image's natural pixel dimensions in the browser.
 *
 * Used by the editor to stamp width/height attributes onto inserted <img>
 * tags so article pages can reserve the right space before the file loads
 * (no layout shift as readers scroll). Best-effort: returns null on error or
 * timeout — callers insert the image without dimensions in that case.
 */
export function probeImageDimensions(
  src: string,
  timeoutMs = 8000,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      resolve(null);
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      const { naturalWidth: width, naturalHeight: height } = img;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Measure a local File's dimensions via an object URL (no network round-trip).
 */
export async function probeFileDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    return await probeImageDimensions(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
