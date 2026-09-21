import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, StoredFile } from './storage-provider.interface';

/**
 * Writes to the container's own local disk — only safe for local development. On Render (and any
 * other PaaS without a persistent disk attached) the filesystem is wiped on every redeploy/restart,
 * silently deleting every file saved here; see SupabaseStorageProvider for what production actually
 * uses. Selected automatically by UploadsModule's factory whenever SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY aren't set, so local dev keeps working without any real credentials.
 */
@Injectable()
export class LocalDiskStorageProvider extends StorageProvider {
  readonly name = 'local-disk';
  private readonly uploadDir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    super();
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  get directory() {
    return this.uploadDir;
  }

  async upload(buffer: Buffer, filename: string, _contentType: string, apiOrigin: string): Promise<StoredFile> {
    writeFileSync(join(this.uploadDir, filename), buffer);
    const apiPrefix = this.config.get<string>('API_PREFIX', 'api/v1');
    return { url: `${apiOrigin}/${apiPrefix}/uploads/${filename}` };
  }
}
