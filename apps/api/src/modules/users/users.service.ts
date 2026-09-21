import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { toUserDto } from './dto/user.dto';
import { CreateStaffUserDto } from '../admin/dto/create-staff-user.dto';
import { resolvePagination } from '@bingoplus/utils';

const STAFF_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return toUserDto(
      user,
      user.roles.map((r) => r.role.name),
    );
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      include: { roles: { include: { role: true } } },
    });
    return toUserDto(
      user,
      user.roles.map((r) => r.role.name),
    );
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...dto, userId } });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.assertOwnsAddress(userId, addressId);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id: addressId }, data: dto });
  }

  async deleteAddress(userId: string, addressId: string) {
    await this.assertOwnsAddress(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  private async assertOwnsAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) throw new ForbiddenException('Not your address');
  }

  // ── Admin-facing ──────────────────────────────────────────────────────────
  //
  // Three distinct admin sections read from the same User table but never overlap:
  //   - "Clientes" (listCustomersForAdmin)  → CUSTOMER role: people who buy on the marketplace.
  //   - "Riders" (RidersService)            → has a Rider record.
  //   - "Usuarios" (listStaffForAdmin)      → ADMIN/SUPER_ADMIN role: accounts that can sign
  //                                            into this admin panel itself.
  // A business owner keeps their CUSTOMER role (see BusinessesService.grantBusinessOwnerRole),
  // so they still appear under Clientes — their business record lives under Negocios.

  /** Customers: CUSTOMER-role accounts, excluding riders (a rider is never listed twice). */
  async listCustomersForAdmin(params: { page?: number; pageSize?: number; search?: string }) {
    const { skip, take, page, pageSize } = resolvePagination(params);
    const where = {
      rider: null,
      roles: { some: { role: { name: RoleName.CUSTOMER } } },
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { firstName: { contains: params.search, mode: 'insensitive' as const } },
              { lastName: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      }),
    ]);

    const purchasesByUser = await this.countPurchasesByUser(users.map((u) => u.id));

    return {
      data: users.map((u) => ({
        ...toUserDto(u, u.roles.map((r) => r.role.name)),
        purchasesCount: purchasesByUser.get(u.id) ?? 0,
      })),
      meta: { page, pageSize, total },
    };
  }

  /** Usuarios: ADMIN/SUPER_ADMIN/USER accounts — the only ones that can sign into this admin panel. */
  async listStaffForAdmin(params: { page?: number; pageSize?: number; search?: string }) {
    const { skip, take, page, pageSize } = resolvePagination(params);
    const where = {
      roles: { some: { role: { name: { in: STAFF_ROLES } } } },
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { firstName: { contains: params.search, mode: 'insensitive' as const } },
              { lastName: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      }),
    ]);

    return {
      data: users.map((u) => toUserDto(u, u.roles.map((r) => r.role.name))),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Real count of completed Orders per user (0 for everyone until Phase 3's checkout module
   * starts creating orders — an honest empty state, never a placeholder number).
   */
  private async countPurchasesByUser(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.userId, g._count._all]));
  }

  /** Single customer's real metrics — same non-cancelled-Order basis as countPurchasesByUser,
   * plus the real spend total, for the per-customer admin hub. */
  async getCustomerForAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const stats = await this.prisma.order.aggregate({
      where: { userId, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { total: true },
    });

    return {
      ...toUserDto(user, user.roles.map((r) => r.role.name)),
      purchasesCount: stats._count._all,
      purchasesTotal: Number(stats._sum.total ?? 0),
    };
  }

  /**
   * The one place a staff account (ADMIN/SUPER_ADMIN/USER) is created directly with a password
   * and a role already attached — unlike every other User in this schema, which always starts as
   * a self-registered CUSTOMER (see AuthService.register) and earns other roles later. Same
   * argon2 hashing as self-registration; the caller (AdminUsersController) is already gated to
   * ADMIN/SUPER_ADMIN via @Roles, so USER accounts can never create more staff accounts.
   */
  async createStaffUser(dto: CreateStaffUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo electrónico.');
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isEmailVerified: true,
        roles: { create: { roleId: role.id } },
      },
      include: { roles: { include: { role: true } } },
    });
    return toUserDto(
      user,
      user.roles.map((r) => r.role.name),
    );
  }

  async setActive(userId: string, isActive: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      include: { roles: { include: { role: true } } },
    });
    return toUserDto(
      user,
      user.roles.map((r) => r.role.name),
    );
  }
}
