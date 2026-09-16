import { Module } from '@nestjs/common';
import { PetsController, PetSpeciesController } from './pets.controller';
import { PetsService } from './pets.service';

@Module({
  controllers: [PetsController, PetSpeciesController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
