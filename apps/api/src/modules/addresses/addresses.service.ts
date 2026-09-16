import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getOwned(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('Address not found');
    return address;
  }

  async create(userId: string, dto: CreateAddressDto) {
    // A brand-new user has no default yet — their first address becomes it automatically so
    // Checkout always has something to preselect.
    const existingCount = await this.prisma.address.count({ where: { userId } });
    const isDefault = dto.isDefault ?? existingCount === 0;
    if (isDefault) await this.clearDefault(userId);

    return this.prisma.address.create({
      data: { ...dto, userId, isDefault },
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.getOwned(userId, addressId);
    if (dto.isDefault) await this.clearDefault(userId);
    return this.prisma.address.update({ where: { id: addressId }, data: dto });
  }

  async remove(userId: string, addressId: string) {
    const address = await this.getOwned(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
    // Promote the most recent remaining address to default so Checkout never ends up with none.
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  private clearDefault(userId: string) {
    return this.prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }
}
