import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { BusinessActiveGuard } from '../../common/guards/business-active.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ListBusinessServicesQueryDto, ListPublicServicesQueryDto } from './dto/list-services-query.dto';

@ApiTags('public/services')
@Controller('public/services')
export class PublicServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get()
  list(@Query() query: ListPublicServicesQueryDto) {
    return this.servicesService.listPublic(query);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.servicesService.getPublic(id);
  }
}

@ApiTags('business/services')
@UseGuards(BusinessOwnershipGuard, BusinessActiveGuard, BusinessCapabilityGuard)
@RequireCapability(BusinessCapabilityType.SERVICES)
@Controller('business/:businessId/services')
export class BusinessServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListBusinessServicesQueryDto) {
    return this.servicesService.listForBusiness(businessId, query);
  }

  @Get(':id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.servicesService.getForBusiness(businessId, id);
  }

  @Audit('service.create', 'Service')
  @Post()
  create(@Param('businessId') businessId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(businessId, dto);
  }

  @Audit('service.update', 'Service')
  @Patch(':id')
  update(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(businessId, id, dto);
  }

  @Audit('service.activate', 'Service')
  @Patch(':id/activate')
  activate(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.servicesService.activate(businessId, id);
  }

  @Audit('service.deactivate', 'Service')
  @Patch(':id/deactivate')
  deactivate(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.servicesService.deactivate(businessId, id);
  }
}
