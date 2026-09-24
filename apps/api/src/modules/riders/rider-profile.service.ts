import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RiderAccountStatus,
  RiderAvailabilityStatus,
  RiderDocumentType,
  RiderIdType,
  RiderPayoutMethodType,
  RoleName,
  VehicleType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderLocationService } from '../delivery/rider-location.service';
import { RegisterRiderApplicationDto } from './dto/rider-application.dto';

const PROFILE_INCLUDE = { user: true, vehicles: true, documents: true, payoutMethod: true } as const;

// A motorized vehicle needs a plate, full vehicle details, a driver's license, and the vehicle's
// own registration ("matrícula") — a bicycle needs none of that, just its color (see
// applyAsRider's validation block and the RiderApplyForm UI this mirrors).
const MOTORIZED_VEHICLE_TYPES: VehicleType[] = [VehicleType.MOTORCYCLE, VehicleType.CAR];
const MINIMUM_RIDER_AGE = 18;

function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

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
   * The one and only way a plain CUSTOMER-role user becomes a Rider — a single atomic submission
   * carrying everything the admin approval flow needs to review (basic info, contact, ID photo,
   * vehicle, payout destination, consent), not the empty-body role-flip this used to
   * be. Attaches the RIDER role (idempotent) and leaves the Rider row PENDING_APPROVAL either way
   * — approval itself stays exclusively RidersService's job (admin-riders.controller.ts), never
   * decided here. The caller's *current* access token still won't carry RIDER until they
   * refresh/re-login — the Rider App calls POST /auth/refresh right after a successful apply.
   *
   * Resubmission (PENDING_APPROVAL retrying with corrected data, or REJECTED trying again) is
   * allowed and replaces the previous vehicle/ID-document/payout rows outright — there is exactly
   * one "current application" per rider, never a history of drafts. An ACTIVE or SUSPENDED rider
   * calling this again is rejected outright: this is an application flow, not a profile editor.
   */
  async applyAsRider(userId: string, dto: RegisterRiderApplicationDto) {
    if (!dto.vehicleColor?.trim()) {
      throw new BadRequestException('vehicleColor is required');
    }
    if (MOTORIZED_VEHICLE_TYPES.includes(dto.vehicleType)) {
      if (!dto.plate?.trim() || !dto.vehicleBrand?.trim() || !dto.vehicleModel?.trim() || !dto.vehicleYear) {
        throw new BadRequestException('plate, vehicleBrand, vehicleModel and vehicleYear are required for motorcycles and cars');
      }
      if (!dto.licenseNumber?.trim() || !dto.licensePhotoUrl || !dto.vehicleRegistrationPhotoUrl) {
        throw new BadRequestException('licenseNumber, licensePhotoUrl and vehicleRegistrationPhotoUrl are required for motorcycles and cars');
      }
    }
    if (!dto.bankName || !dto.accountType || !dto.accountNumber) {
      throw new BadRequestException('bankName, accountType and accountNumber are required');
    }
    if (dto.idType === RiderIdType.RUC && !dto.legalName?.trim()) {
      throw new BadRequestException('legalName (razón social) is required when idType is RUC');
    }
    if (calculateAge(new Date(dto.birthDate), new Date()) < MINIMUM_RIDER_AGE) {
      throw new BadRequestException('You must be at least 18 years old to apply as a rider');
    }

    const existing = await this.prisma.rider.findUnique({ where: { userId } });
    if (existing && (existing.accountStatus === RiderAccountStatus.ACTIVE || existing.accountStatus === RiderAccountStatus.SUSPENDED)) {
      throw new ConflictException('You already have a rider account — this form is only for new applications.');
    }

    const riderRole = await this.prisma.role.findUniqueOrThrow({ where: { name: RoleName.RIDER } });
    const birthDate = new Date(dto.birthDate);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId, roleId: riderRole.id } },
          create: { userId, roleId: riderRole.id },
          update: {},
        });
        if (dto.phone) {
          await tx.user.update({ where: { id: userId }, data: { phone: dto.phone } });
        }

        const riderData = {
          city: dto.city,
          idType: dto.idType,
          legalName: dto.idType === RiderIdType.RUC ? dto.legalName : null,
          birthDate,
          nationalIdNumber: dto.nationalIdNumber,
          address: dto.address,
          termsAcceptedAt: now,
          dataConsentAcceptedAt: now,
          accountStatus: RiderAccountStatus.PENDING_APPROVAL,
        };
        const rider = existing
          ? await tx.rider.update({ where: { id: existing.id }, data: riderData })
          : await tx.rider.create({ data: { userId, ...riderData } });

        // Exactly one "current" vehicle/ID-document set per application — resubmitting replaces
        // rather than accumulates.
        await tx.vehicle.deleteMany({ where: { riderId: rider.id } });
        await tx.vehicle.create({
          data: {
            riderId: rider.id,
            type: dto.vehicleType,
            plate: dto.plate,
            brand: dto.vehicleBrand,
            model: dto.vehicleModel,
            color: dto.vehicleColor,
            year: dto.vehicleYear,
          },
        });

        // Exactly one ID photo now (no front/back split), plus LICENSE/VEHICLE_REGISTRATION when
        // the vehicle is motorized — deleteMany covers all four document types so switching from
        // a motorized vehicle to a bike on resubmission correctly drops the now-irrelevant
        // license/registration rows instead of leaving stale ones behind.
        await tx.riderDocument.deleteMany({
          where: {
            riderId: rider.id,
            type: { in: [RiderDocumentType.ID, RiderDocumentType.SELFIE, RiderDocumentType.LICENSE, RiderDocumentType.VEHICLE_REGISTRATION] },
          },
        });
        await tx.riderDocument.createMany({
          data: [
            {
              riderId: rider.id,
              type: RiderDocumentType.ID,
              documentNumber: dto.nationalIdNumber,
              fileUrl: dto.idPhotoUrl,
            },
            {
              riderId: rider.id,
              type: RiderDocumentType.SELFIE,
              fileUrl: dto.selfiePhotoUrl,
            },
            ...(MOTORIZED_VEHICLE_TYPES.includes(dto.vehicleType)
              ? [
                  {
                    riderId: rider.id,
                    type: RiderDocumentType.LICENSE,
                    documentNumber: dto.licenseNumber,
                    fileUrl: dto.licensePhotoUrl!,
                  },
                  {
                    riderId: rider.id,
                    type: RiderDocumentType.VEHICLE_REGISTRATION,
                    fileUrl: dto.vehicleRegistrationPhotoUrl!,
                  },
                ]
              : []),
          ],
        });

        await tx.riderPayoutMethod.upsert({
          where: { riderId: rider.id },
          create: {
            riderId: rider.id,
            method: RiderPayoutMethodType.BANK_ACCOUNT,
            bankName: dto.bankName,
            accountType: dto.accountType,
            accountNumber: dto.accountNumber,
            accountHolderName: dto.accountHolderName,
            holderDocumentNumber: dto.holderDocumentNumber,
          },
          update: {
            method: RiderPayoutMethodType.BANK_ACCOUNT,
            bankName: dto.bankName,
            accountType: dto.accountType,
            accountNumber: dto.accountNumber,
            accountHolderName: dto.accountHolderName,
            holderDocumentNumber: dto.holderDocumentNumber,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('That phone number is already in use by another account.');
      }
      throw err;
    }

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
