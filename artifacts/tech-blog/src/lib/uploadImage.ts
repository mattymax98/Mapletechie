import { processImage } from "./processImage";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 25 * 1024 * 1024; // Keep in sync with the API raw-upload limit.
const TOKEN_KEY = "mapletechie_admin_token";

export interface UploadResult {
  url: string;
  objectPath: string;
}

export async function uploadImage(rawFile: File): Promise<UploadResult> {
  if (!ACCEPTED_TYPES.includes(rawFile.type)) {
    throw new Error("Please choose a JPG, PNG, WEBP, or GIF image.");
  }
  if (rawFile.size > MAX_BYTES) {
    throw new Error("Image is too large. Max size is 25 MB.");
  }

  // Keep the uploaded master intact; variants are derived on demand from it.
  const file = await processImage(rawFile);

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // POST the raw file bytes to the API server, which writes them directly to
  // R2/GCS. This avoids a cross-origin presigned PUT (which would require CORS
  // to be configured on the R2 bucket).
  const uploadRes = await fetch("/api/storage/uploads", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      ...authHeaders,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload failed: ${text}`);
  }

  const { url, objectPath } = (await uploadRes.json()) as {
    url: string;
    objectPath: string;
  };

  return { url, objectPath };
}
