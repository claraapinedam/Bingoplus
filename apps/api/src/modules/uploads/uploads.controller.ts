import { existsSync, mkdirSync } from 'fs';
import { join, normalize } from 'path';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UploadsService } from './uploads.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Generic authenticated file upload used by the Rider application form (ID photos) today — any
 * logged-in user can upload (mirrors how POST /rider/apply itself has no role restriction, since
 * a plain CUSTOMER applying as a rider is the exact case this exists for). Returns a URL the
 * caller then passes back as a plain string field (e.g. RegisterRiderApplicationDto.idPhotoFrontUrl),
 * same convention every other `fileUrl` in this schema already uses.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase() : '';
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
      }),
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
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file was uploaded');
    // Absolute, not relative — DTOs that accept an uploaded file's URL (e.g.
    // RegisterRiderApplicationDto.idPhotoFrontUrl) validate it with @IsUrl, same as every other
    // externally-hosted `fileUrl` in this schema.
    const apiPrefix = this.config.get<string>('API_PREFIX', 'api/v1');
    const url = `${req.protocol}://${req.get('host')}/${apiPrefix}${this.uploads.publicPath(file.filename)}`;
    return { url };
  }

  // Deliberately public (no auth) — this only ever serves back what an authenticated user (or an
  // admin reviewing the application) already has the URL to; it's not a directory listing.
  @Public()
  @Get(':filename')
  serve(@Param('filename') filename: string, @Res() res: Response) {
    const safeName = normalize(filename).replace(/^(\.\.[/\\])+/, '');
    const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')).toLowerCase() : '';
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    const filePath = join(UPLOAD_DIR, safeName);
    if (!contentType || !filePath.startsWith(UPLOAD_DIR) || !existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
  }
}
