import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PetFriendlyPlacesService } from './pet-friendly-places.service';
import { CreatePetFriendlyPlaceDto } from './dto/create-pet-friendly-place.dto';
import { ListPetFriendlyPlacesQueryDto } from './dto/list-pet-friendly-places-query.dto';

@ApiTags('public/pet-friendly-places')
@Controller('public/pet-friendly-places')
export class PublicPetFriendlyPlacesController {
  constructor(private readonly places: PetFriendlyPlacesService) {}

  @Public()
  @Get()
  list(@Query() query: ListPetFriendlyPlacesQueryDto) {
    return this.places.listApproved(query);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.places.getApproved(id);
  }
}

/** Any authenticated user (not just business owners) may submit a place — this is a community
 * directory, not a business/membership feature. No role restriction beyond being logged in. */
@ApiTags('me/pet-friendly-places')
@Controller('me/pet-friendly-places')
export class MyPetFriendlyPlacesController {
  constructor(private readonly places: PetFriendlyPlacesService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.places.listMine(user.id);
  }

  @Audit('pet_friendly_place.create', 'PetFriendlyPlace')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePetFriendlyPlaceDto) {
    return this.places.create(user.id, dto);
  }
}
