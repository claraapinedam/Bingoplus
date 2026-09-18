import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, NotificationAudience, PetFriendlyPlaceStatus } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CreatePetFriendlyPlaceDto } from './dto/create-pet-friendly-place.dto';
import { ListAdminPetFriendlyPlacesQueryDto, ListPetFriendlyPlacesQueryDto } from './dto/list-pet-friendly-places-query.dto';

const PUBLIC_INCLUDE = {
  submittedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PetFriendlyPlaceInclude;

/**
 * A community directory of places that welcome pets (restaurants, parks, cafés...) — deliberately
 * NOT a Business/membership/capability concept. Any logged-in user can submit one; it only
 * becomes visible to everyone once an admin approves it. Mirrors the Business/Rider
 * apply-then-admin-approves shape, but there is no owner account or capability gating here — just
 * a submitter and a moderator.
 */
@Injectable()
export class PetFriendlyPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Public / customer-facing ────────────────────────────────────────────

  async listApproved(query: ListPetFriendlyPlacesQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.PetFriendlyPlaceWhereInput = {
      status: PetFriendlyPlaceStatus.APPROVED,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, places] = await this.prisma.$transaction([
      this.prisma.petFriendlyPlace.count({ where }),
      this.prisma.petFriendlyPlace.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    ]);
    return { data: places, meta: { page, pageSize, total } };
  }

  async getApproved(id: string) {
    const place = await this.prisma.petFriendlyPlace.findUnique({ where: { id } });
    if (!place || place.status !== PetFriendlyPlaceStatus.APPROVED) {
      throw new NotFoundException('Pet-friendly place not found');
    }
    return place;
  }

  async create(userId: string, dto: CreatePetFriendlyPlaceDto) {
    return this.prisma.petFriendlyPlace.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        photoUrl: dto.photoUrl,
        submittedById: userId,
        status: PetFriendlyPlaceStatus.PENDING,
      },
    });
  }

  /** "Mis lugares enviados" — every status, so the submitter can see it's still pending or why it
   * was rejected, not just the ones that made it live. */
  async listMine(userId: string) {
    return this.prisma.petFriendlyPlace.findMany({ where: { submittedById: userId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async listForAdmin(query: ListAdminPetFriendlyPlacesQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.PetFriendlyPlaceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, places] = await this.prisma.$transaction([
      this.prisma.petFriendlyPlace.count({ where }),
      this.prisma.petFriendlyPlace.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: PUBLIC_INCLUDE }),
    ]);
    return { data: places, meta: { page, pageSize, total } };
  }

  async getForAdmin(id: string) {
    const place = await this.prisma.petFriendlyPlace.findUnique({ where: { id }, include: PUBLIC_INCLUDE });
    if (!place) throw new NotFoundException('Pet-friendly place not found');
    return place;
  }

  async approve(adminId: string, id: string) {
    const place = await this.getForAdmin(id);
    if (place.status !== PetFriendlyPlaceStatus.PENDING) {
      throw new BadRequestException('Only pending places can be approved');
    }
    const updated = await this.prisma.petFriendlyPlace.update({
      where: { id },
      data: { status: PetFriendlyPlaceStatus.APPROVED, reviewedById: adminId, reviewedAt: new Date(), rejectionReason: null },
    });
    void this.notifications.notify({
      userId: place.submittedById,
      audience: NotificationAudience.CUSTOMER,
      event: 'pet_friendly_place.approved',
      title: 'Tu lugar fue aprobado',
      body: `"${place.name}" ya es visible en el directorio de lugares Pet Friendly.`,
      entityType: 'PetFriendlyPlace',
      entityId: id,
    });
    return updated;
  }

  async reject(adminId: string, id: string, reason?: string) {
    const place = await this.getForAdmin(id);
    if (place.status !== PetFriendlyPlaceStatus.PENDING) {
      throw new BadRequestException('Only pending places can be rejected');
    }
    const updated = await this.prisma.petFriendlyPlace.update({
      where: { id },
      data: { status: PetFriendlyPlaceStatus.REJECTED, reviewedById: adminId, reviewedAt: new Date(), rejectionReason: reason },
    });
    void this.notifications.notify({
      userId: place.submittedById,
      audience: NotificationAudience.CUSTOMER,
      event: 'pet_friendly_place.rejected',
      title: 'Tu lugar no fue aprobado',
      body: reason ? `"${place.name}" fue rechazado: ${reason}` : `"${place.name}" no fue aprobado para el directorio.`,
      entityType: 'PetFriendlyPlace',
      entityId: id,
    });
    return updated;
  }

  /** Pulls an already-published place out of the public directory (listApproved/getApproved both
   * filter strictly on APPROVED) without discarding it like reject would — an admin call for a
   * place that turned out to be a problem after going live, mirrors Business's approve/suspend tier. */
  async suspend(id: string) {
    const place = await this.getForAdmin(id);
    if (place.status !== PetFriendlyPlaceStatus.APPROVED) {
      throw new BadRequestException('Only approved places can be suspended');
    }
    return this.prisma.petFriendlyPlace.update({ where: { id }, data: { status: PetFriendlyPlaceStatus.SUSPENDED } });
  }

  async reactivate(id: string) {
    const place = await this.getForAdmin(id);
    if (place.status !== PetFriendlyPlaceStatus.SUSPENDED) {
      throw new BadRequestException('Only suspended places can be reactivated');
    }
    return this.prisma.petFriendlyPlace.update({ where: { id }, data: { status: PetFriendlyPlaceStatus.APPROVED } });
  }
}
