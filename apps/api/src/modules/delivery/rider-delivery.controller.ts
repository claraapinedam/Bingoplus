import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import { DeliveryChatService } from './delivery-chat.service';
import {
  CompleteDeliveryDto,
  RejectDeliveryDto,
  ReportIncidentDto,
  RiderLocationUpdateDto,
} from './dto/delivery-action.dto';
import { ListDeliveryChatMessagesQueryDto, SendDeliveryChatMessageDto } from './dto/delivery-chat.dto';

/** §57/61/63: every route resolves the caller's own Rider row from the JWT — never a riderId
 * route param — so a Rider can only ever act on their own assigned deliveries. */
@ApiTags('rider/deliveries')
@Roles(RoleName.RIDER)
@UseGuards(RolesGuard)
@Controller('rider/deliveries')
export class RiderDeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly location: RiderLocationService,
    private readonly chat: DeliveryChatService,
    private readonly prisma: PrismaService,
  ) {}

  private async riderIdFor(userId: string): Promise<string> {
    const rider = await this.prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new NotFoundException('You do not have a rider profile yet');
    return rider.id;
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.delivery.listForRider(await this.riderIdFor(user.id));
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.getForRiderDetail(await this.riderIdFor(user.id), id);
  }

  @Audit('delivery.accept', 'Delivery')
  @Post(':id/accept')
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.accept(await this.riderIdFor(user.id), id);
  }

  @Audit('delivery.reject', 'Delivery')
  @Post(':id/reject')
  async reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectDeliveryDto) {
    return this.delivery.reject(await this.riderIdFor(user.id), id, dto.reason);
  }

  @Post(':id/arrived-pickup')
  async arrivedPickup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.arrivedAtPickup(await this.riderIdFor(user.id), id);
  }

  @Audit('delivery.picked_up', 'Delivery')
  @Post(':id/picked-up')
  async pickedUp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.pickedUp(await this.riderIdFor(user.id), id);
  }

  @Post(':id/start')
  async start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.start(await this.riderIdFor(user.id), id);
  }

  @Post(':id/arrived-customer')
  async arrivedCustomer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delivery.arrivedAtCustomer(await this.riderIdFor(user.id), id);
  }

  @Audit('delivery.complete', 'Delivery')
  @Post(':id/complete')
  async complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CompleteDeliveryDto) {
    return this.delivery.complete(await this.riderIdFor(user.id), id, dto.otpCode);
  }

  @Audit('delivery.incident.report', 'Delivery')
  @Post(':id/report-incident')
  async reportIncident(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReportIncidentDto) {
    return this.delivery.reportIncident(await this.riderIdFor(user.id), id, dto.type, dto.description);
  }

  /** §61/77: rejects location updates unless the caller is the rider assigned to an active
   * delivery (enforced inside RiderLocationService.recordUpdate). */
  @Post(':id/location')
  async updateLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RiderLocationUpdateDto) {
    const riderId = await this.riderIdFor(user.id);
    await this.location.recordUpdate(riderId, id, dto);
    return { ok: true };
  }

  /** Rider<->customer chat — REST is the history/catch-up path; live delivery is the
   * `delivery.chat.message` socket event on the `delivery:{id}` room (see DeliveryGateway). */
  @Get(':id/chat/messages')
  async listChatMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: ListDeliveryChatMessagesQueryDto) {
    return this.chat.listForRider(await this.riderIdFor(user.id), id, query.after);
  }

  @Post(':id/chat/messages')
  async sendChatMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendDeliveryChatMessageDto) {
    return this.chat.sendForRider(await this.riderIdFor(user.id), user.id, id, dto.text);
  }
}
