import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RiderProfileService } from './rider-profile.service';
import {
  AddDocumentDto,
  AddVehicleDto,
  SetAvailabilityDto,
  UpdateLocationDto,
  UpdateRiderProfileDto,
} from './dto/rider-profile.dto';

/** §57: a Rider only ever acts on their own Rider row — there is no riderId route param anywhere
 * here, it's always resolved from the authenticated user (§63 — Customer A -> Delivery de
 * Customer B applies just as much to Rider A -> Rider B's profile). */
@ApiTags('rider/profile')
@Roles(RoleName.RIDER)
@UseGuards(RolesGuard)
@Controller('rider')
export class RiderProfileController {
  constructor(private readonly profile: RiderProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRiderProfileDto) {
    return this.profile.updateProfile(user.id, dto);
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.getProfile(user.id);
  }

  @Post('availability')
  setAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAvailabilityDto) {
    return this.profile.setAvailability(user.id, dto.availabilityStatus);
  }

  @Post('location')
  updateLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateLocationDto) {
    return this.profile.updateLocation(user.id, dto.latitude, dto.longitude);
  }

  @Get('vehicles')
  async listVehicles(@CurrentUser() user: AuthenticatedUser) {
    const rider = await this.profile.getOrCreateForUser(user.id);
    return this.profile.listVehicles(rider.id);
  }

  @Post('vehicles')
  addVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddVehicleDto) {
    return this.profile.addVehicle(user.id, dto);
  }

  @Delete('vehicles/:id')
  removeVehicle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.profile.removeVehicle(user.id, id);
  }

  @Get('documents')
  async listDocuments(@CurrentUser() user: AuthenticatedUser) {
    const rider = await this.profile.getOrCreateForUser(user.id);
    return this.profile.listDocuments(rider.id);
  }

  @Post('documents')
  addDocument(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddDocumentDto) {
    return this.profile.addDocument(user.id, {
      ...dto,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
    });
  }

  @Get('earnings')
  listEarnings(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.listEarnings(user.id);
  }
}
