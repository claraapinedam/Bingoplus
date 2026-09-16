import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessStatus, FulfillmentType, OrderStatus } from '@prisma/client';
import { DeliveryEligibilityService } from './delivery-eligibility.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';

describe('DeliveryEligibilityService', () => {
  let service: DeliveryEligibilityService;
  let prisma: any;
  let capabilities: any;

  const baseOrder = {
    id: 'o1',
    businessId: 'b1',
    fulfillmentType: FulfillmentType.DELIVERY,
    status: OrderStatus.READY_FOR_PICKUP,
    delivery: null,
    business: {
      id: 'b1',
      status: BusinessStatus.ACTIVE,
      deletedAt: null,
      latitude: -0.2,
      longitude: -78.5,
    },
  };

  beforeEach(() => {
    prisma = { order: { findUnique: jest.fn().mockResolvedValue(baseOrder) } };
    capabilities = { getMap: jest.fn().mockResolvedValue({ SELLS_PRODUCTS: true, DELIVERY: true }) };
    service = new DeliveryEligibilityService(
      prisma as unknown as PrismaService,
      capabilities as unknown as BusinessCapabilitiesService,
    );
  });

  it('passes for a valid READY_FOR_PICKUP DELIVERY order at an active, deliverable business', async () => {
    await expect(service.assertEligible('o1')).resolves.toEqual(baseOrder);
  });

  it('throws NotFoundException when the order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.assertEligible('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a PICKUP order — PICKUP never enters the delivery pipeline (§1)', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, fulfillmentType: FulfillmentType.PICKUP });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a cancelled order', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.CANCELLED });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an order that is not yet READY_FOR_PICKUP', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.PREPARING });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an order that already has a delivery — no duplicate delivery per order', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, delivery: { id: 'd1' } });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the business is not ACTIVE', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      business: { ...baseOrder.business, status: BusinessStatus.SUSPENDED },
    });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the business no longer has the DELIVERY capability', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: true, DELIVERY: false });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the business has no valid coordinates (§42)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      business: { ...baseOrder.business, latitude: null },
    });
    await expect(service.assertEligible('o1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
