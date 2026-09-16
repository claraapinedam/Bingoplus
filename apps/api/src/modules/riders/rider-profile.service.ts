import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RiderAccountStatus, RiderAvailabilityStatus, RiderDocumentType, RoleName, VehicleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderLocationService } from '../delivery/rider-location.service';

const PROFILE_INCLUDE = { user: true, vehicles: true, documents: true } as const;

/**
 * §6/9/10: self-service surface a Rider uses on themselves — onboarding basics, availability,
 * vehicles, documents. Distinct from RidersService (admin approval/suspension of *other*
 * riders' accounts) even though both sit on the same Rider table.
 */
@Injectable()
export class RiderProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly location: RiderLocationService,
  ) {}

  /** A User only becomes a Rider by applying — no separate signup flow, no second User (§6). */
  async getOrCreateForUser(userId: string) {
    const existing = await this.prisma.rider.findUnique({ where: { userId }, include: PROFILE_INCLUDE });
    if (existing) return existing;
    return this.prisma.rider.create({ data: { userId }, include: PROFILE_INCLUDE });
  }

  /**
   * FASE 4B gap fix: the one and only way a plain CUSTOMER-role user becomes a Rider. Attaches
   * the RIDER role (idempotent — calling twice is a no-op) and creates the Rider row at its
   * default PENDING_APPROVAL. This endpoint is deliberately NOT behind `@Roles(RoleName.RIDER)`
   * (see RiderApplicationController) — a user obviously doesn't have that role yet when applying.
   * The caller's *current* access token still won't carry RIDER until they refresh/re-login —
   * the Rider App calls POST /auth/refresh right after a successful apply for exactly this reason.
   */
  async applyAsRider(userId: string) {
    const riderRole = await this.prisma.role.findUniqueOrThrow({ where: { name: RoleName.RIDER } });
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: riderRole.id } },
      create: { userId, roleId: riderRole.id },
      update: {},
    });
    return this.getOrCreateForUser(userId);
  }

  async getProfile(userId: string) {
    return this.getOrCreateForUser(userId);
  }

  async updateProfile(userId: string, data: { city?: string }) {
    const rider = await this.getOrCreateForUser(userId);
    return this.prisma.rider.update({ where: { id: rider.id }, data, include: PROFILE_INCLUDE });
  }

  /** §10: only ACTIVE+AVAILABLE riders can receive new delivery tasks — going online/offline is
   * blocked entirely for a non-ACTIVE account (pending approval, suspended, etc.). */
  async setAvailability(userId: string, availabilityStatus: RiderAvailabilityStatus) {
    const rider = await this.getOrCreateForUser(userId);
    if (rider.accountStatus !== RiderAccountStatus.ACTIVE) {
      throw new ForbiddenException({
        error: {
          code: 'RIDER_ACCOUNT_NOT_ACTIVE',
          message: 'Your account must be approved and active before you can go online.',
        },
      });
    }
    if (availabilityStatus === RiderAvailabilityStatus.AVAILABLE && rider.currentLatitude == null) {
      throw new BadRequestException({
        error: { code: 'RIDER_LOCATION_REQUIRED', message: 'Share your location before going online.' },
      });
    }
    return this.prisma.rider.update({ where: { id: rider.id }, data: { availabilityStatus }, include: PROFILE_INCLUDE });
  }

  /** A rider's ambient "where am I" ping outside of any specific delivery — always allowed, never
   * writes RiderLocation history (§35/36 — that only happens tied to an active delivery). */
  async updateLocation(userId: string, latitude: number, longitude: number) {
    const rider = await this.getOrCreateForUser(userId);
    await this.location.recordUpdate(rider.id, null, { latitude, longitude });
    return { latitude, longitude };
  }

  // ── Vehicles (§9) ────────────────────────────────────────────────────────

  listVehicles(riderId: string) {
    return this.prisma.vehicle.findMany({ where: { riderId } });
  }

  async addVehicle(
    userId: string,
    data: { type: VehicleType; plate?: string; brand?: string; model?: string; color?: string; year?: number },
  ) {
    const rider = await this.getOrCreateForUser(userId);
    return this.prisma.vehicle.create({ data: { riderId: rider.id, ...data } });
  }

  async removeVehicle(userId: string, vehicleId: string) {
    const rider = await this.getOrCreateForUser(userId);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.riderId !== rider.id) throw new NotFoundException('Vehicle not found');
    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
  }

  // ── Documents (§8) ───────────────────────────────────────────────────────

  listDocuments(riderId: string) {
    return this.prisma.riderDocument.findMany({ where: { riderId } });
  }

  async addDocument(
    userId: string,
    data: { type: RiderDocumentType; fileUrl: string; documentNumber?: string; expirationDate?: Date },
  ) {
    const rider = await this.getOrCreateForUser(userId);
    return this.prisma.riderDocument.create({ data: { riderId: rider.id, ...data } });
  }

  // ── Earnings (§48) ───────────────────────────────────────────────────────

  /** RiderEarning rows are written on delivery completion (DeliveryService.complete) but nothing
   * read them back until now — the Rider App's Earnings screen needs the real per-type breakdown
   * (delivery fee / tip / bonus), not just Delivery.deliveryFee re-derived client-side, since a
   * future payout phase will add tips/bonuses/adjustments that only live on RiderEarning. */
  async listEarnings(userId: string) {
    const rider = await this.getOrCreateForUser(userId);
    return this.prisma.riderEarning.findMany({
      where: { riderId: rider.id },
      orderBy: { createdAt: 'desc' },
      include: { delivery: { select: { id: true, orderId: true } } },
    });
  }
}
