export interface StoredFile {
  /** The publicly-fetchable URL for the just-uploaded file. */
  url: string;
}

/**
 * The only surface anything that saves a file (UploadsController's multipart endpoint,
 * ContractsService/RiderContractsService's generated PDFs) should talk to — same shape as
 * EmailProvider (see modules/email). Swapping where files actually live means implementing this
 * interface, nothing else.
 */
export abstract class StorageProvider {
  abstract readonly name: string;
  /** `apiOrigin` (e.g. "https://bingoplus-api.onrender.com", no trailing slash) is only meaningful
   * for a provider that serves files back through this API itself (LocalDiskStorageProvider) — a
   * provider whose files live on its own public domain (SupabaseStorageProvider) ignores it. */
  abstract upload(buffer: Buffer, filename: string, contentType: string, apiOrigin: string): Promise<StoredFile>;
}

export const STORAGE_PROVIDER_TOKEN = 'STORAGE_PROVIDER_TOKEN';
