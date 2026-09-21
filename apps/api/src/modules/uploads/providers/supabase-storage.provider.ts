import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, StoredFile } from './storage-provider.interface';

/**
 * Uploads to a Supabase Storage bucket over its REST API — files live on Supabase's own domain,
 * so they survive every Render redeploy/restart (unlike LocalDiskStorageProvider's ephemeral
 * filesystem, the actual bug this fixes: uploaded images/PDFs were being silently wiped on every
 * deploy). The bucket must already exist and be public (created once via the Storage Management
 * API — see the CommissionCoupon-style "sandbox until configured" comment on UploadsModule).
 */
@Injectable()
export class SupabaseStorageProvider extends StorageProvider {
  readonly name = 'supabase-storage';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async upload(buffer: Buffer, filename: string, contentType: string): Promise<StoredFile> {
    const baseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = this.config.get<string>('STORAGE_BUCKET') || 'uploads';

    const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${filename}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': contentType,
      },
      // Buffer structurally satisfies BodyInit at runtime (Node's fetch/undici accepts it
      // directly) but TS's lib types don't agree — Uint8Array.from() is a real, typed copy.
      body: Uint8Array.from(buffer),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Supabase Storage upload failed (${res.status}): ${detail}`);
    }

    return { url: `${baseUrl}/storage/v1/object/public/${bucket}/${filename}` };
  }
}
