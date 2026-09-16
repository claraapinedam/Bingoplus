import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

@ApiTags('public/pet-species')
@Controller('public/pet-species')
export class PetSpeciesController {
  constructor(private readonly petsService: PetsService) {}

  @Public()
  @Get()
  list() {
    return this.petsService.listSpecies();
  }
}

@ApiTags('me/pets')
@Controller('me/pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.petsService.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.petsService.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePetDto) {
    return this.petsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePetDto,
  ) {
    return this.petsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.petsService.remove(user.id, id);
  }
}
