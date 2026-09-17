import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';

/**
 * Local-disk file store used until STORAGE_* (S3-compatible) is actually provisioned — same
 * "sandbox until configured" shape as PaymentProvider/NotificationProvider elsewhere in this
 * codebase, just without a second implementation to swap in yet, since nothing else needs one.
 * Files land under apps/api/uploads/ (gitignored) and are served back by UploadsController.
 */
@Injectable()
export class UploadsService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

  constructor() {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  get directory() {
    return this.uploadDir;
  }

  buildStoredFilename(originalName: string): string {
    const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
    return `${randomUUID()}${ext.toLowerCase()}`;
  }

  publicPath(filename: string): string {
    return `/uploads/${filename}`;
  }
}
