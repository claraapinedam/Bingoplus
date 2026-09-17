import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PetFriendlyPlacesService } from '../pet-friendly-places/pet-friendly-places.service';
import { ListAdminPetFriendlyPlacesQueryDto } from '../pet-friendly-places/dto/list-pet-friendly-places-query.dto';
import { RejectPetFriendlyPlaceDto } from '../pet-friendly-places/dto/reject-pet-friendly-place.dto';

@ApiTags('admin/pet-friendly-places')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/pet-friendly-places')
export class AdminPetFriendlyPlacesController {
  constructor(private readonly places: PetFriendlyPlacesService) {}

  @Get()
  list(@Query() query: ListAdminPetFriendlyPlacesQueryDto) {
    return this.places.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.places.getForAdmin(id);
  }

  @Audit('pet_friendly_place.approve', 'PetFriendlyPlace')
  @Patch(':id/approve')
  approve(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.places.approve(admin.id, id);
  }

  @Audit('pet_friendly_place.reject', 'PetFriendlyPlace')
  @Patch(':id/reject')
  reject(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectPetFriendlyPlaceDto) {
    return this.places.reject(admin.id, id, dto.reason);
  }
}
