import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RiderAccountStatus, RiderAvailabilityStatus } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RidersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async approve(riderId: string) {
    const rider = await this.getOne(riderId);
    if (rider.accountStatus !== RiderAccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only riders pending approval can be approved');
    }
    return this.prisma.rider.update({ where: { id: riderId }, data: { accountStatus: RiderAccountStatus.ACTIVE } });
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
}
