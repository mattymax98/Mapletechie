/**
 * Backend-agnostic file handle returned by ObjectStorageService.
 *
 * The Cloudflare R2 backend implements this interface, so the rest of the app
 * (routes, objectAcl) remains independent of the S3-compatible client details.
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
