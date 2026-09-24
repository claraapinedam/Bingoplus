import { existsSync } from 'fs';
import { join, normalize } from 'path';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER_TOKEN, StorageProvider } from './providers/storage-provider.interface';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/**
 * Generic authenticated file upload used by the Rider application form (ID photos) today — any
 * logged-in user can upload (mirrors how POST /rider/apply itself has no role restriction, since
 * a plain CUSTOMER applying as a rider is the exact case this exists for). Returns a URL the
 * caller then passes back as a plain string field (e.g. RegisterRiderApplicationDto.idPhotoUrl),
 * same convention every other `fileUrl` in this schema already uses. Where the bytes actually land
 * is decided by UploadsModule's StorageProvider factory (Supabase Storage in production, local
 * disk only for dev — see that module for why).
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storage: StorageProvider,
    // Injected directly (not via the factory token) — GET :filename only ever makes sense for
    // files LocalDiskStorageProvider itself wrote; a SupabaseStorageProvider upload's URL points
    // at Supabase's own domain and never reaches this route at all.
    private readonly localDisk: LocalDiskStorageProvider,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG or WEBP images are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file was uploaded');
    const apiOrigin = `${req.protocol}://${req.get('host')}`;
    const filename = this.uploads.buildStoredFilename(file.originalname);
    const { url } = await this.storage.upload(file.buffer, filename, file.mimetype, apiOrigin);
    return { url };
  }

  // Deliberately public (no auth) — this only ever serves back what an authenticated user (or an
  // admin reviewing the application) already has the URL to; it's not a directory listing. Only
  // reachable for LocalDiskStorageProvider-written files (dev) — see the constructor comment.
  @Public()
  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    const safeName = normalize(filename).replace(/^(\.\.[/\\])+/, '');
    const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')).toLowerCase() : '';
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    const filePath = join(this.localDisk.directory, safeName);
    if (!contentType || !filePath.startsWith(this.localDisk.directory) || !existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
  }
}
