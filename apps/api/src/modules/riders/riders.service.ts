import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RiderAccountStatus, RiderAvailabilityStatus, RiderDocumentStatus } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderContractsService } from '../contracts/rider-contracts.service';

@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riderContracts: RiderContractsService,
  ) {}

  async listForAdmin(params: {
    status?: RiderAccountStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = resolvePagination(params);
    const where = {
      ...(params.status ? { accountStatus: params.status } : {}),
      ...(params.search
        ? {
            user: {
              OR: [
                { firstName: { contains: params.search, mode: 'insensitive' as const } },
                { lastName: { contains: params.search, mode: 'insensitive' as const } },
                { email: { contains: params.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [total, riders] = await this.prisma.$transaction([
      this.prisma.rider.count({ where }),
      this.prisma.rider.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          vehicles: true,
        },
      }),
    ]);

    return { data: riders, meta: { page, pageSize, total } };
  }

  async getOne(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        vehicles: true,
        documents: true,
        payoutMethod: true,
      },
    });
    if (!rider) throw new NotFoundException('Rider not found');
    return rider;
  }

  /** Approving no longer activates the rider directly — it generates a contract (RiderContractsService)
   * that has to be signed first, same two-step gate as BusinessesService.approve(). The rider goes
   * ACTIVE on its own once RiderContractsService.sign() runs.
   *
   * Every document (ID front/back, selfie, and anything else on file) must be individually
   * VERIFIED by an admin first — a PENDING document hasn't actually been reviewed, and a
   * REJECTED/EXPIRED one means the rider needs to re-submit, so neither should let approval
   * through. Mirrors listWithPendingDocuments' "any non-reviewed document" signal, just enforced
   * here instead of only surfaced as a dashboard hint. */
  async approve(riderId: string) {
    const rider = await this.getOne(riderId);
    if (rider.accountStatus !== RiderAccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only riders pending approval can be approved');
    }
    const notVerified = rider.documents.filter((d) => d.status !== RiderDocumentStatus.VERIFIED);
    if (rider.documents.length === 0 || notVerified.length > 0) {
      throw new BadRequestException('All documents must be verified before approving this rider');
    }
    const updated = await this.prisma.rider.update({ where: { id: riderId }, data: { accountStatus: RiderAccountStatus.APPROVED } });
    await this.riderContracts.createForApprovedRider(riderId);
    return updated;
  }

  /** A suspended rider is also forced OFFLINE (§7) — SUSPENDED+AVAILABLE must never be a reachable state. */
  async suspend(riderId: string) {
    await this.getOne(riderId);
    return this.prisma.rider.update({
      where: { id: riderId },
      data: { accountStatus: RiderAccountStatus.SUSPENDED, availabilityStatus: RiderAvailabilityStatus.OFFLINE },
    });
  }

  async reactivate(riderId: string) {
    const rider = await this.getOne(riderId);
    if (rider.accountStatus !== RiderAccountStatus.SUSPENDED) {
      throw new BadRequestException('Only suspended riders can be reactivated');
    }
    return this.prisma.rider.update({ where: { id: riderId }, data: { accountStatus: RiderAccountStatus.ACTIVE } });
  }

  /** §60: generic admin status set, for REJECTED/INACTIVE — approve/suspend/reactivate above cover
   * the common semantic actions with their own guard rails; this is the escape hatch for the rest. */
  async setStatus(riderId: string, status: RiderAccountStatus) {
    await this.getOne(riderId);
    const data: { accountStatus: RiderAccountStatus; availabilityStatus?: RiderAvailabilityStatus } = {
      accountStatus: status,
    };
    if (status !== RiderAccountStatus.ACTIVE) {
      data.availabilityStatus = RiderAvailabilityStatus.OFFLINE;
    }
    return this.prisma.rider.update({ where: { id: riderId }, data });
  }

  private async setDocumentStatus(riderId: string, documentId: string, adminId: string, status: RiderDocumentStatus) {
    const document = await this.prisma.riderDocument.findUnique({ where: { id: documentId } });
    if (!document || document.riderId !== riderId) {
      throw new NotFoundException('Document not found for this rider');
    }
    return this.prisma.riderDocument.update({
      where: { id: documentId },
      data: { status, reviewedBy: adminId, reviewedAt: new Date() },
    });
  }

  verifyDocument(riderId: string, documentId: string, adminId: string) {
    return this.setDocumentStatus(riderId, documentId, adminId, RiderDocumentStatus.VERIFIED);
  }

  rejectDocument(riderId: string, documentId: string, adminId: string) {
    return this.setDocumentStatus(riderId, documentId, adminId, RiderDocumentStatus.REJECTED);
  }

  /** Home-dashboard action item — riders who still have at least one unreviewed document,
   * regardless of their own accountStatus. approve() blocks a PENDING_APPROVAL rider outright
   * until every document is VERIFIED, but this still matters for an already-ACTIVE rider who added
   * a new document afterward (e.g. a replacement upload) that the admin hasn't reviewed yet. */
  async listWithPendingDocuments(limit = 10) {
    const [total, riders] = await this.prisma.$transaction([
      this.prisma.rider.count({ where: { documents: { some: { status: RiderDocumentStatus.PENDING } } } }),
      this.prisma.rider.findMany({
        where: { documents: { some: { status: RiderDocumentStatus.PENDING } } },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
          documents: { where: { status: RiderDocumentStatus.PENDING }, select: { id: true } },
        },
      }),
    ]);
    return { total, riders };
  }
}
