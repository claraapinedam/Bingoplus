import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const corsOrigin = process.env.CORS_ORIGIN;

/**
 * §37/56/62: realtime delivery tracking. Every event is scoped to a Socket.IO room named
 * `delivery:{id}`, and a client can only join that room if they're the order's own customer, the
 * currently-assigned rider, or an admin (§62/64 — a Customer must never receive events for
 * someone else's order, a Rider never for a delivery assigned to a different rider). Falls back
 * to the equivalent REST GET endpoints (§37 fallback polling) — nothing here is the only way to
 * read this data.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true, credentials: true } })
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('DeliveryGateway');

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) ?? (client.handshake.query?.token as string);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string; roles: string[] }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.roles = payload.roles ?? [];
    } catch {
      client.disconnect(true);
      return;
    }

    // FASE 4B gap fix: a rider needs to learn about a brand-new offer before they know its
    // deliveryId, so `delivery:{id}` rooms alone can't reach them. Auto-joining a personal
    // `rider:{riderId}` room on connect (never on-demand, since the client can't guess its own
    // riderId reliably) gives DispatchService somewhere to push `delivery.offer` into.
    if ((client.data.roles as string[]).includes(RoleName.RIDER)) {
      const rider = await this.prisma.rider.findUnique({ where: { userId: client.data.userId as string } });
      if (rider) client.join(this.riderRoom(rider.id));
    }
  }

  handleDisconnect() {
    // Nothing to clean up — Socket.IO drops room membership automatically on disconnect.
  }

  @SubscribeMessage('subscribe:delivery')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string }) {
    if (!data?.deliveryId) return;
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: data.deliveryId },
      include: { order: { select: { userId: true, businessId: true } }, rider: { select: { userId: true } } },
    });
    if (!delivery) return;

    const userId = client.data.userId as string;
    const roles = (client.data.roles as string[]) ?? [];
    const isOwnerCustomer = delivery.order.userId === userId;
    const isAssignedRider = delivery.rider?.userId === userId;
    const isAdmin = roles.includes(RoleName.ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    // FASE 4C gap fix: a Business (BusinessUser OWNER/MANAGER) can watch their own order's
    // delivery live — same room, same events, previously only Customer/Rider/Admin could join it.
    const isBusinessMember =
      !isOwnerCustomer &&
      !isAssignedRider &&
      !isAdmin &&
      (await this.prisma.businessUser.findUnique({
        where: { businessId_userId: { businessId: delivery.order.businessId, userId } },
      })) !== null;
    if (!isOwnerCustomer && !isAssignedRider && !isAdmin && !isBusinessMember) {
      this.logger.warn(`User ${userId} tried to subscribe to a delivery they don't own`);
      return;
    }
    client.join(this.room(data.deliveryId));
  }

  @SubscribeMessage('unsubscribe:delivery')
  unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string }) {
    if (data?.deliveryId) client.leave(this.room(data.deliveryId));
  }

  emitStatusUpdated(deliveryId: string, status: string) {
    this.server?.to(this.room(deliveryId)).emit('delivery.status.updated', { deliveryId, status });
  }

  emitLocationUpdated(deliveryId: string, latitude: number, longitude: number) {
    this.server?.to(this.room(deliveryId)).emit('delivery.location.updated', { deliveryId, latitude, longitude });
  }

  emitEtaUpdated(deliveryId: string, etaMinutes: number, distanceKm: number) {
    this.server?.to(this.room(deliveryId)).emit('delivery.eta.updated', { deliveryId, etaMinutes, distanceKm });
  }

  emitRiderAssigned(deliveryId: string, riderId: string) {
    this.server?.to(this.room(deliveryId)).emit('delivery.rider.assigned', { deliveryId, riderId });
  }

  emitCompleted(deliveryId: string) {
    this.server?.to(this.room(deliveryId)).emit('delivery.completed', { deliveryId });
  }

  /** Rider<->customer chat (§ "chat bidireccional") — pushed to the same `delivery:{id}` room
   * used for status/location, right after DeliveryChatService persists the message. The room's
   * membership is already exactly this delivery's own customer + assigned rider (+ admin/business
   * staff, who simply never send chat messages), so no separate chat room/auth handshake is needed. */
  emitChatMessage(deliveryId: string, message: unknown) {
    this.server?.to(this.room(deliveryId)).emit('delivery.chat.message', { deliveryId, message });
  }

  /** Pushed to the rider's personal room the moment DispatchService assigns them a delivery —
   * this is how the Rider App learns about a new offer without polling. */
  emitDeliveryOffer(riderId: string, deliveryId: string) {
    this.server?.to(this.riderRoom(riderId)).emit('delivery.offer', { deliveryId });
  }

  private room(deliveryId: string): string {
    return `delivery:${deliveryId}`;
  }

  private riderRoom(riderId: string): string {
    return `rider:${riderId}`;
  }
}
