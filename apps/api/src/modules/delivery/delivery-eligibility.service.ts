import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, FulfillmentType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';

const ELIGIBILITY_INCLUDE = {
  business: true,
  delivery: true,
} satisfies Prisma.OrderInclude;

export type EligibleOrder = Prisma.OrderGetPayload<{ include: typeof ELIGIBILITY_INCLUDE }>;

/**
 * §13: the single gate an Order must clear before a Delivery is created for it. Every rule here
 * is a defensive re-check — fulfillmentType/business capability were already validated at
 * checkout (FASE 3), but business/order state can change between checkout and READY_FOR_PICKUP
 * (business suspended, capability revoked, etc.), so this re-verifies rather than trusting that
 * nothing changed.
 */
@Injectable()
export class DeliveryEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  async assertEligible(orderId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<EligibleOrder> {
    const order = await client.order.findUnique({ where: { id: orderId }, include: ELIGIBILITY_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');

    if (order.fulfillmentType !== FulfillmentType.DELIVERY) {
      throw new BadRequestException({
        error: { code: 'NOT_A_DELIVERY_ORDER', message: 'Only DELIVERY orders can enter the delivery pipeline.' },
      });
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException({ error: { code: 'ORDER_CANCELLED', message: 'This order is cancelled.' } });
    }
    if (order.status !== OrderStatus.READY_FOR_PICKUP) {
      throw new BadRequestException({
        error: {
          code: 'ORDER_NOT_READY',
          message: 'The order must be READY_FOR_PICKUP before a delivery can be created.',
          details: { status: order.status },
        },
      });
    }
    if (order.delivery) {
      throw new BadRequestException({
        error: { code: 'DELIVERY_ALREADY_EXISTS', message: 'This order already has a delivery.' },
      });
    }
    if (order.business.status !== BusinessStatus.ACTIVE || order.business.deletedAt) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_NOT_ACTIVE', message: 'This business is not currently active.' },
      });
    }

    const capMap = await this.capabilities.getMap(order.businessId);
    if (!capMap[BusinessCapabilityType.SELLS_PRODUCTS]) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_NOT_SELLING', message: 'This business is not currently selling products.' },
      });
    }
    if (!capMap[BusinessCapabilityType.DELIVERY]) {
      throw new BadRequestException({
        error: { code: 'DELIVERY_NOT_AVAILABLE', message: 'This business no longer offers delivery.' },
      });
    }
    if (order.business.latitude === null || order.business.longitude === null) {
      throw new BadRequestException({
        error: {
          code: 'BUSINESS_LOCATION_MISSING',
          message: 'This business has no valid location — delivery cannot be dispatched.',
        },
      });
    }

    return order;
  }
}
