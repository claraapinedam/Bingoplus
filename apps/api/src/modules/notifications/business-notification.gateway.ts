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
import { PrismaService } from '../../prisma/prisma.service';

const corsOrigin = process.env.CORS_ORIGIN;

/**
 * Realtime "new order" push for the Business App — mirrors DeliveryGateway's JWT-handshake auth
 * and per-room pattern exactly (see that file), but stays single-purpose (order-arrival
 * notifications only) per this codebase's one-gateway-per-domain convention: delivery tracking
 * events keep living exclusively in DeliveryGateway, this gateway never touches them.
 *
 * A client can only join a `business:{id}` room if it's an authenticated member (OWNER/MANAGER,
 * via BusinessUser) of that business — so a business only ever receives events for its own orders,
 * never another business's, the same guarantee DeliveryGateway gives per-delivery.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true, credentials: true } })
export class BusinessNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('BusinessNotificationGateway');

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
  }

  handleDisconnect() {
    // Nothing to clean up — Socket.IO drops room membership automatically on disconnect.
  }

  @SubscribeMessage('subscribe:business')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { businessId: string }) {
    if (!data?.businessId) return;
    const userId = client.data.userId as string;
    const membership = await this.prisma.businessUser.findUnique({
      where: { businessId_userId: { businessId: data.businessId, userId } },
    });
    if (!membership) {
      this.logger.warn(`User ${userId} tried to subscribe to business ${data.businessId} they don't belong to`);
      return;
    }
    client.join(this.room(data.businessId));
  }

  @SubscribeMessage('unsubscribe:business')
  unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { businessId: string }) {
    if (data?.businessId) client.leave(this.room(data.businessId));
  }

  /** Pushed right after CheckoutService creates the NotificationAudience.BUSINESS DB notification
   * for a brand-new PAID order — this is how the Business App learns about it without polling,
   * regardless of which page the business user currently has open (DashboardShell subscribes once,
   * globally). */
  emitNewOrder(businessId: string, order: { id: string; orderNumber: string }) {
    this.server?.to(this.room(businessId)).emit('order.new', { orderId: order.id, orderNumber: order.orderNumber });
  }

  private room(businessId: string): string {
    return `business:${businessId}`;
  }
}
