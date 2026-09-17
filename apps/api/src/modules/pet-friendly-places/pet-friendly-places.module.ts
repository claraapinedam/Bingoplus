import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicPetFriendlyPlacesController, MyPetFriendlyPlacesController } from './pet-friendly-places.controller';
import { PetFriendlyPlacesService } from './pet-friendly-places.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicPetFriendlyPlacesController, MyPetFriendlyPlacesController],
  providers: [PetFriendlyPlacesService],
  exports: [PetFriendlyPlacesService],
})
export class PetFriendlyPlacesModule {}
