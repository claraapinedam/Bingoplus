import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

/** Pure filename-generation helper shared by every upload path (multipart or server-generated) —
 * where the bytes actually end up lives in a StorageProvider instead (see providers/). */
@Injectable()
export class UploadsService {
  buildStoredFilename(originalName: string): string {
    const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
    return `${randomUUID()}${ext.toLowerCase()}`;
  }
}
