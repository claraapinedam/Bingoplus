import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationPayload {
  userId: string;
  /** Domain event name (§56), e.g. "delivery.rider_assigned" — not free text, so a future
   * provider integration can map events to templates instead of parsing prose. */
  event: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  /** Defaults to TRANSACTIONAL — only MARKETING notifications are ever gated by the recipient's
   * NotificationPreference (§10/FASE 8 rule). */
  category?: NotificationCategory;
  /** Explicit key when the caller already has a natural one. Omit it for one-time-per-entity
   * events (order confirmed, booking created, …) — a deterministic `userId:event:entityId` key is
   * derived instead, so the exact same event processed twice (retry, duplicate webhook) collapses
   * into one row. Events that can legitimately repeat for the same entity (e.g. a future reminder
   * schedule) must pass their own key — this default is only safe for genuinely one-shot events. */
  idempotencyKey?: string;
}

/**
 * §55/56/85: the one abstraction every module talks to — never a push/SMS provider directly.
 * Persists every notification (the in-app Notification Center's data source) and then "delivers"
 * it — today that's only a log line, the same "Sandbox when unconfigured" shape as
 * SandboxPaymentProvider/MockMapProvider: no PUSH_NOTIFICATION_KEY/SMS_API_KEY/EMAIL_API_KEY is
 * configured, so a real Push/SMS/Email provider has never been wired. Swapping one in later means
 * implementing `deliver()`, not touching any of the ~20 call sites across Orders/Delivery/Bookings/Admin.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async notify(payload: NotificationPayload): Promise<void> {
    const category = payload.category ?? NotificationCategory.TRANSACTIONAL;

    if (category === NotificationCategory.MARKETING) {
      const pref = await this.prisma.notificationPreference.findUnique({ where: { userId: payload.userId } });
      const allowed = payload.event.startsWith('promotion.') ? (pref?.promotions ?? true) : (pref?.marketing ?? true);
      if (!allowed) return;
    }

    const idempotencyKey = payload.idempotencyKey ?? `${payload.userId}:${payload.event}:${payload.entityId ?? ''}`;

    try {
      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          event: payload.event,
          title: payload.title,
          body: payload.body,
          data: payload.data as Prisma.InputJsonValue | undefined,
          entityType: payload.entityType,
          entityId: payload.entityId,
          category,
          idempotencyKey,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The exact same event for this recipient+entity already has a row — idempotent no-op.
        return;
      }
      throw err;
    }

    this.deliver(payload);
  }

  private deliver(payload: NotificationPayload) {
    // No real provider implemented yet — logging is the whole story even when a key is present,
    // until a Push/SMS/Email provider is actually wired here.
    this.logger.log(`[${payload.event}] -> user ${payload.userId}: ${payload.title} — ${payload.body}`);
  }

  // ── Notification Center (§2.6) — every recipient (Customer/Business/Rider/Admin) reads their
  // own notifications through the same `/me/notifications` surface, scoped by userId. ───────────

  async list(userId: string, params: { unreadOnly?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
    const where = { userId, ...(params.unreadOnly ? { read: false } : {}) };
    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { data: notifications, meta: { page, pageSize, total } };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, notificationId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });
    return { updated: count > 0 };
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: count };
  }

  // ── Preferences (§10) — only ever consulted for MARKETING-category notifications, see notify() ──

  async getPreferences(userId: string) {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return { promotions: pref?.promotions ?? true, marketing: pref?.marketing ?? true };
  }

  updatePreferences(userId: string, data: { promotions?: boolean; marketing?: boolean }) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
