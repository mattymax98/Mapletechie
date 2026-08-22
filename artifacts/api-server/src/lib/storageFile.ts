/**
 * Backend-agnostic file handle returned by ObjectStorageService.
 *
 * Both the development GCS backend and the Cloudflare-R2 backend
 * (production / Railway) implement this interface, so the rest of the app
 * (routes, objectAcl) never needs to know which one is active.
 */
export interface StorageFileMetadata {
  contentType?: string;
  size?: string | number;
  /** Custom metadata bag — always exposes "custom:aclPolicy" when set. */
  metadata?: Record<string, string>;
}

export interface StorageFile {
  readonly name: string;
  readonly bucket: { readonly name: string };
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[StorageFileMetadata]>;
  setMetadata(options: { metadata: Record<string, string> }): Promise<void>;
  createReadStream(): NodeJS.ReadableStream;
}
