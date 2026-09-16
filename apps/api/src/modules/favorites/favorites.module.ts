import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';

@Module({
  imports: [BusinessCapabilitiesModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
