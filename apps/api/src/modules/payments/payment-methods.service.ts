import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreatePaymentMethodDto) {
    const existingCount = await this.prisma.paymentMethod.count({ where: { userId } });
    const isDefault = dto.isDefault ?? existingCount === 0;
    if (isDefault) await this.clearDefault(userId);
    return this.prisma.paymentMethod.create({ data: { ...dto, userId, isDefault } });
  }

  async remove(userId: string, paymentMethodId: string) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method || method.userId !== userId) throw new NotFoundException('Payment method not found');
    await this.prisma.paymentMethod.delete({ where: { id: paymentMethodId } });
  }

  private clearDefault(userId: string) {
    return this.prisma.paymentMethod.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }
}
