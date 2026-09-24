import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryChatSenderType, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DeliveryGateway } from './delivery.gateway';

/**
 * Rider<->customer chat for an active delivery (app owner's "chat bidireccional" ask, verbatim:
 * "Cuando se asigna un rider a un pedido debe haber un chat bidireccional... El chat debe cerrarse
 * al completar el pedido"). Transport is DeliveryGateway's existing `delivery:{id}` room — unlike
 * SupportChatsService (see its own header comment for why THAT feature stayed short-polling), this
 * room's membership already IS exactly "this delivery's own customer + its assigned rider", which
 * is precisely this feature's audience, so persisting here and pushing `delivery.chat.message` into
 * the same room is reuse, not a second realtime subsystem. REST remains the source of truth and the
 * only way to read history/catch up after a reconnect — the socket event is purely a live nudge.
 *
 * "Open" is never a stored flag: a message is accepted only while `delivery.riderId` is set (per
 * the request's own trigger — "cuando se asigna un rider") AND the delivery hasn't reached a
 * terminal status yet (DeliveryStateMachine.isTerminal — DELIVERED, but also CANCELLED/FAILED: a
 * delivery that ended without completing has just as little reason to keep accepting messages, and
 * treating only DELIVERED as closing would leave a cancelled delivery's chat open forever with
 * nothing left to discuss).
 */
@Injectable()
export class DeliveryChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DeliveryStateMachine,
    private readonly gateway: DeliveryGateway,
  ) {}

  private async loadDelivery(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { userId: true } } },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private assertOpen(delivery: { riderId: string | null; status: DeliveryStatus }) {
    if (!delivery.riderId) {
      throw new BadRequestException('This delivery has no rider assigned yet — chat opens once one is.');
    }
    if (this.stateMachine.isTerminal(delivery.status)) {
      throw new BadRequestException('This chat is closed — the delivery is no longer active.');
    }
  }

  // ── Rider side ────────────────────────────────────────────────────────

  async listForRider(riderId: string, deliveryId: string, after?: string) {
    const delivery = await this.loadDelivery(deliveryId);
    if (delivery.riderId !== riderId) throw new ForbiddenException('This delivery is not assigned to you');
    return this.listMessages(deliveryId, after);
  }

  async sendForRider(riderId: string, userId: string, deliveryId: string, text: string) {
    const delivery = await this.loadDelivery(deliveryId);
    if (delivery.riderId !== riderId) throw new ForbiddenException('This delivery is not assigned to you');
    this.assertOpen(delivery);
    return this.persistAndEmit(deliveryId, DeliveryChatSenderType.RIDER, userId, text);
  }

  // ── Customer side ─────────────────────────────────────────────────────

  async listForCustomer(userId: string, deliveryId: string, after?: string) {
    const delivery = await this.loadDelivery(deliveryId);
    if (delivery.order.userId !== userId) throw new ForbiddenException('Not your order');
    return this.listMessages(deliveryId, after);
  }

  async sendForCustomer(userId: string, deliveryId: string, text: string) {
    const delivery = await this.loadDelivery(deliveryId);
    if (delivery.order.userId !== userId) throw new ForbiddenException('Not your order');
    this.assertOpen(delivery);
    return this.persistAndEmit(deliveryId, DeliveryChatSenderType.CUSTOMER, userId, text);
  }

  // ── Shared ────────────────────────────────────────────────────────────

  private listMessages(deliveryId: string, after?: string) {
    return this.prisma.deliveryChatMessage.findMany({
      where: { deliveryId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async persistAndEmit(deliveryId: string, senderType: DeliveryChatSenderType, senderUserId: string, text: string) {
    const message = await this.prisma.deliveryChatMessage.create({
      data: { deliveryId, senderType, senderUserId, text },
    });
    this.gateway.emitChatMessage(deliveryId, message);
    return message;
  }
}
