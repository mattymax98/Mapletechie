const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TOKEN_KEY = "mapletechie_admin_token";

export interface UploadResult {
  url: string;
  objectPath: string;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large. Max size is 10 MB.");
  }

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // 1. Ask the server for a presigned upload URL.
  const requestRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });

  if (!requestRes.ok) {
    const text = await requestRes.text();
    throw new Error(`Could not start upload: ${text}`);
  }

  const { uploadURL, objectPath } = (await requestRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  // 2. PUT the file directly to the presigned URL (goes to GCS, not our server).
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error("Upload failed. Please try again.");
  }

  // The serving URL is /api/storage + objectPath (e.g. /api/storage/objects/uploads/uuid)
  return {
    url: `/api/storage${objectPath}`,
    objectPath,
  };
}
