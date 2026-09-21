import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER_TOKEN } from './providers/storage-provider.interface';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';
import { SupabaseStorageProvider } from './providers/supabase-storage.provider';

const logger = new Logger('UploadsModule');

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalDiskStorageProvider,
    SupabaseStorageProvider,
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, local: LocalDiskStorageProvider, supabase: SupabaseStorageProvider) => {
        if (!config.get<string>('SUPABASE_URL') || !config.get<string>('SUPABASE_SERVICE_ROLE_KEY')) {
          logger.warn(
            'Using LocalDiskStorageProvider — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set. ' +
              'Uploaded files will NOT survive a redeploy/restart on a host without a persistent disk.',
          );
          return local;
        }
        return supabase;
      },
      inject: [ConfigService, LocalDiskStorageProvider, SupabaseStorageProvider],
    },
  ],
  exports: [UploadsService, LocalDiskStorageProvider, STORAGE_PROVIDER_TOKEN],
})
export class UploadsModule {}
