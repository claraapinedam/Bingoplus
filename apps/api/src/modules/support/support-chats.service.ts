import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupportChatRelatedType, SupportChatSenderType, SupportChatStatus, SupportSubmitterType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * "Soporte con un pedido" — a short-poll chat tied to one of the submitter's own Order/Delivery/
 * Booking, with an admin agent joining in. See DeliveryGateway for this codebase's one existing
 * realtime transport (Socket.IO, scoped to live delivery tracking) — deliberately NOT reused or
 * mirrored here. It's a one-directional server-push channel for location/status events with its
 * own room/auth handshake; wiring a second, bidirectional, multi-app (Customer/Business/Rider/
 * Admin) chat protocol on top of it would be a second real-time subsystem in all but name. Given
 * the size of this feature, short polling (GET .../messages?after=<cursor> every few seconds,
 * exactly the fallback pattern DeliveryTrackingPage already uses) is the pragmatic scope choice —
 * see ListMessagesQueryDto.
 */
@Injectable()
export class SupportChatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Re-verifies relatedId really belongs to this submitter (and, for BUSINESS, this business) —
   * never trusts the client's claim alone. Keeps CUSTOMER/BUSINESS allowed on ORDER/DELIVERY/
   * BOOKING (a customer or business may want to talk about the delivery side of their own order
   * too) while RIDER is restricted to DELIVERY, the only "pedido" concept a rider actually owns. */
  private async assertRelatedOwnership(
    userId: string,
    submitterType: SupportSubmitterType,
    businessId: string | undefined,
    relatedType: SupportChatRelatedType,
    relatedId: string,
  ) {
    if (submitterType === SupportSubmitterType.BUSINESS) {
      if (!businessId) throw new BadRequestException('businessId is required when submitterType is BUSINESS');
      const membership = await this.prisma.businessUser.findUnique({
        where: { businessId_userId: { businessId, userId } },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this business');
    }
    if (submitterType === SupportSubmitterType.RIDER) {
      const rider = await this.prisma.rider.findUnique({ where: { userId } });
      if (!rider) throw new ForbiddenException('You are not a registered rider');
      if (relatedType !== SupportChatRelatedType.DELIVERY) {
        throw new BadRequestException('A rider can only open support chats about a delivery');
      }
      const delivery = await this.prisma.delivery.findUnique({ where: { id: relatedId } });
      if (!delivery || delivery.riderId !== rider.id) throw new NotFoundException('Delivery not found');
      return;
    }

    if (relatedType === SupportChatRelatedType.ORDER) {
      const order = await this.prisma.order.findUnique({ where: { id: relatedId } });
      const owns = submitterType === SupportSubmitterType.BUSINESS ? order?.businessId === businessId : order?.userId === userId;
      if (!order || !owns) throw new NotFoundException('Order not found');
    } else if (relatedType === SupportChatRelatedType.BOOKING) {
      const booking = await this.prisma.booking.findUnique({ where: { id: relatedId } });
      const owns = submitterType === SupportSubmitterType.BUSINESS ? booking?.businessId === businessId : booking?.userId === userId;
      if (!booking || !owns) throw new NotFoundException('Booking not found');
    } else if (relatedType === SupportChatRelatedType.DELIVERY) {
      const delivery = await this.prisma.delivery.findUnique({ where: { id: relatedId }, include: { order: true } });
      const owns =
        submitterType === SupportSubmitterType.BUSINESS ? delivery?.order.businessId === businessId : delivery?.order.userId === userId;
      if (!delivery || !owns) throw new NotFoundException('Delivery not found');
    }
  }

  async create(
    userId: string,
    data: { submitterType: SupportSubmitterType; businessId?: string; relatedType: SupportChatRelatedType; relatedId: string },
  ) {
    await this.assertRelatedOwnership(userId, data.submitterType, data.businessId, data.relatedType, data.relatedId);
    return this.prisma.supportChat.create({
      data: {
        submitterType: data.submitterType,
        submitterUserId: userId,
        businessId: data.submitterType === SupportSubmitterType.BUSINESS ? data.businessId : undefined,
        relatedType: data.relatedType,
        relatedId: data.relatedId,
      },
    });
  }

  listMine(userId: string) {
    return this.prisma.supportChat.findMany({ where: { submitterUserId: userId }, orderBy: { createdAt: 'desc' } });
  }

  private async findMineOrThrow(userId: string, id: string) {
    const chat = await this.prisma.supportChat.findUnique({ where: { id } });
    if (!chat || chat.submitterUserId !== userId) throw new NotFoundException('Support chat not found');
    return chat;
  }

  async getMine(userId: string, id: string) {
    return this.findMineOrThrow(userId, id);
  }

  listMessages(chatId: string, after?: string) {
    return this.prisma.supportChatMessage.findMany({
      where: { chatId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMine(userId: string, chatId: string, text: string | undefined, imageUrl: string | undefined) {
    if (!text && !imageUrl) throw new BadRequestException('A message needs text, an image, or both.');
    const chat = await this.findMineOrThrow(userId, chatId);
    if (chat.status === SupportChatStatus.CLOSED) throw new BadRequestException('This chat is closed');
    // SupportSubmitterType/SupportChatSenderType share the CUSTOMER/BUSINESS/RIDER string values
    // by design (ADMIN is the one sender type with no submitter equivalent) — the submitter's own
    // messages are always sent as whichever type they opened the chat as.
    return this.prisma.supportChatMessage.create({
      data: { chatId, senderType: chat.submitterType as unknown as SupportChatSenderType, senderUserId: userId, text, imageUrl },
    });
  }

  /** Submitter ends the chat and rates the support received — the one point this feature captures
   * a 1-5 rating, per spec. */
  async closeAndRate(userId: string, chatId: string, score: number, comment?: string) {
    const chat = await this.findMineOrThrow(userId, chatId);
    if (chat.status === SupportChatStatus.CLOSED) throw new BadRequestException('This chat is already closed');
    return this.prisma.supportChat.update({
      where: { id: chatId },
      data: { status: SupportChatStatus.CLOSED, closedAt: new Date(), ratingScore: score, ratingComment: comment },
    });
  }

  // ── Admin (§ "Soporte en pedidos") ───────────────────────────────────────────────────────────

  /** Grouped by submitter type so Admin can show separate Clientes/Negocios/Riders tabs, per spec. */
  listForAdmin(submitterType?: SupportSubmitterType, status?: SupportChatStatus) {
    return this.prisma.supportChat.findMany({
      where: { ...(submitterType ? { submitterType } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
        business: { select: { id: true, tradeName: true } },
        assignedAdmin: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getOneAdmin(id: string) {
    const chat = await this.prisma.supportChat.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
        business: { select: { id: true, tradeName: true } },
        assignedAdmin: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!chat) throw new NotFoundException('Support chat not found');
    return chat;
  }

  /** First admin to open an unassigned chat picks it up — simplest reasonable "agent available"
   * story given there's no separate queueing/presence system in scope here. Re-opening an
   * already-assigned chat (e.g. a page refresh) is a harmless no-op. */
  async openAdmin(adminUserId: string, chatId: string) {
    const chat = await this.prisma.supportChat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Support chat not found');
    if (!chat.assignedAdminId) {
      return this.prisma.supportChat.update({ where: { id: chatId }, data: { assignedAdminId: adminUserId } });
    }
    return chat;
  }

  async sendAdmin(adminUserId: string, chatId: string, text: string | undefined, imageUrl: string | undefined) {
    if (!text && !imageUrl) throw new BadRequestException('A message needs text, an image, or both.');
    const chat = await this.prisma.supportChat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Support chat not found');
    if (chat.status === SupportChatStatus.CLOSED) throw new BadRequestException('This chat is closed');
    return this.prisma.supportChatMessage.create({
      data: { chatId, senderType: SupportChatSenderType.ADMIN, senderUserId: adminUserId, text, imageUrl },
    });
  }

  /** Admin-side close never sets a rating — only the submitter rates their own support (see
   * closeAndRate). Used when the agent resolves the issue but the submitter doesn't come back. */
  async closeAdmin(chatId: string) {
    const chat = await this.prisma.supportChat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Support chat not found');
    if (chat.status === SupportChatStatus.CLOSED) return chat;
    return this.prisma.supportChat.update({ where: { id: chatId }, data: { status: SupportChatStatus.CLOSED, closedAt: new Date() } });
  }
}
