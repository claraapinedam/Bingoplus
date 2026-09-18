import { Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderContractsService } from './rider-contracts.service';
import { SignContractDto } from './dto/sign-contract.dto';

function apiOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

/** Always "my own" rider row — unlike ContractsController (which takes a :businessId a staff
 * member could own several of), a rider only ever has the one Rider row tied to their account. */
@ApiTags('me/rider/contract')
@Roles(RoleName.RIDER)
@UseGuards(RolesGuard)
@Controller('me/rider/contract')
export class RiderContractsController {
  constructor(
    private readonly contracts: RiderContractsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getOwnRiderId(userId: string): Promise<string> {
    const rider = await this.prisma.rider.findUnique({ where: { userId }, select: { id: true } });
    if (!rider) throw new NotFoundException('Rider profile not found');
    return rider.id;
  }

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    const riderId = await this.getOwnRiderId(user.id);
    return this.contracts.getLatestForRider(riderId);
  }

  @Post('sign')
  async sign(@CurrentUser() user: AuthenticatedUser, @Body() dto: SignContractDto, @Req() req: Request) {
    const riderId = await this.getOwnRiderId(user.id);
    return this.contracts.sign(riderId, dto.signatureDataUrl, req.ip ?? 'unknown', apiOrigin(req));
  }
}
