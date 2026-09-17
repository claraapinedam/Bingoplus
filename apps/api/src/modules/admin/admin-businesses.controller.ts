import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessesService } from '../businesses/businesses.service';
import { ContractsService } from '../contracts/contracts.service';
import { ListBusinessesQueryDto } from './dto/list-query.dto';
import {
  ApproveBusinessDto,
  RejectBusinessDto,
  SuspendBusinessDto,
} from '../businesses/dto/moderate-business.dto';
import { SetCapabilityDto } from '../business-capabilities/dto/set-capability.dto';

@ApiTags('admin/businesses')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/businesses')
export class AdminBusinessesController {
  constructor(
    private readonly businessesService: BusinessesService,
    private readonly contractsService: ContractsService,
  ) {}

  @Get()
  list(@Query() query: ListBusinessesQueryDto) {
    return this.businessesService.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.businessesService.getOne(id);
  }

  @Audit('business.approve', 'Business')
  @Patch(':id/approve')
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBusinessDto,
  ) {
    return this.businessesService.approve(id, admin.id, dto.commissionRate);
  }

  @Audit('business.activate', 'Business')
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.businessesService.activate(id);
  }

  @Audit('business.reject', 'Business')
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() _dto: RejectBusinessDto) {
    return this.businessesService.reject(id);
  }

  @Audit('business.suspend', 'Business')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @Body() _dto: SuspendBusinessDto) {
    return this.businessesService.suspend(id);
  }

  @Get(':id/capabilities')
  getCapabilities(@Param('id') id: string) {
    return this.businessesService.getCapabilities(id);
  }

  @Audit('business.capability.update', 'BusinessCapability')
  @Patch(':id/capabilities')
  setCapability(@Param('id') id: string, @Body() dto: SetCapabilityDto) {
    return this.businessesService.setCapabilityAsAdmin(id, dto.capability, dto.enabled);
  }

  @Get(':id/contracts')
  getContracts(@Param('id') id: string) {
    return this.contractsService.listForBusiness(id);
  }

  @Get(':id/commissions')
  getCommissionHistory(@Param('id') id: string) {
    return this.businessesService.listCommissionHistory(id);
  }

  @Get(':id/commissions/summary')
  getCommissionSummary(@Param('id') id: string) {
    return this.businessesService.getCommissionSummary(id);
  }
}
