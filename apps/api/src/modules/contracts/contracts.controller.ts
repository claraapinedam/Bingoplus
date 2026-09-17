import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { ContractsService } from './contracts.service';
import { SignContractDto } from './dto/sign-contract.dto';

/** Mirrors UploadsController's own protocol/host-from-request convention (no hardcoded API_URL
 * env var) — works unmodified across local dev, Render, and any future domain. */
function apiOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

@ApiTags('me/business/contract')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId/contract')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  get(@Param('businessId') businessId: string) {
    return this.contracts.getLatestForBusiness(businessId);
  }

  @Post('sign')
  sign(@Param('businessId') businessId: string, @Body() dto: SignContractDto, @Req() req: Request) {
    return this.contracts.sign(businessId, dto.signatureDataUrl, req.ip ?? 'unknown', apiOrigin(req));
  }
}
