/**
 * Preserve uploaded source bytes. Cropping and format conversion are optional
 * editorial operations; silently preprocessing originals would permanently
 * discard detail before the server can create responsive derivatives.
 */
export async function processImage(file: File): Promise<File> {
  return file;
}