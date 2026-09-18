import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RidersService } from '../riders/riders.service';
import { RiderContractsService } from '../contracts/rider-contracts.service';
import { ListRidersQueryDto } from './dto/list-query.dto';
import { SetRiderStatusDto } from './dto/set-rider-status.dto';

@ApiTags('admin/riders')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/riders')
export class AdminRidersController {
  constructor(
    private readonly ridersService: RidersService,
    private readonly riderContracts: RiderContractsService,
  ) {}

  @Get()
  list(@Query() query: ListRidersQueryDto) {
    return this.ridersService.listForAdmin(query);
  }

  // Must be declared before ':id' — otherwise Nest would try to match "pending-documents" as an id.
  @Get('pending-documents')
  listWithPendingDocuments() {
    return this.ridersService.listWithPendingDocuments();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.ridersService.getOne(id);
  }

  @Get(':id/contract')
  getContract(@Param('id') id: string) {
    return this.riderContracts.getLatestForRider(id);
  }

  @Audit('rider.approve', 'Rider')
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.ridersService.approve(id);
  }

  @Audit('rider.suspend', 'Rider')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.ridersService.suspend(id);
  }

  @Audit('rider.reactivate', 'Rider')
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.ridersService.reactivate(id);
  }

  @Audit('rider.set_status', 'Rider')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetRiderStatusDto) {
    return this.ridersService.setStatus(id, dto.status);
  }

  @Audit('rider.document.verify', 'RiderDocument')
  @Patch(':id/documents/:documentId/verify')
  verifyDocument(@Param('id') id: string, @Param('documentId') documentId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.ridersService.verifyDocument(id, documentId, admin.id);
  }

  @Audit('rider.document.reject', 'RiderDocument')
  @Patch(':id/documents/:documentId/reject')
  rejectDocument(@Param('id') id: string, @Param('documentId') documentId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.ridersService.rejectDocument(id, documentId, admin.id);
  }
}
