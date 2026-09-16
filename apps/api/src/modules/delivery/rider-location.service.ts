import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryGateway } from './delivery.gateway';

export interface LocationUpdateInput {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

/** Delivery statuses during which a rider's live location is meaningfully "in progress" for
 * tracking purposes — before RIDER_ACCEPTED there's nothing to track yet, after DELIVERED it's over. */
const ACTIVE_TRACKING_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.RIDER_ACCEPTED,
  DeliveryStatus.GOING_TO_PICKUP,
  DeliveryStatus.ARRIVED_AT_PICKUP,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.ARRIVED_AT_CUSTOMER,
];

/**
 * §36/§61/§77: writes both Rider.currentLatitude/Longitude (the single "where is this rider
 * right now" value, always kept fresh) and, only while a Delivery is actively being tracked, a
 * RiderLocation history row (§35 retention policy — no history outside an active delivery).
 * Prisma can't write the `Unsupported("geography")` column through `data:`, so both writes use
 * raw SQL for the geography column specifically.
 */
@Injectable()
export class RiderLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DeliveryGateway,
  ) {}

  /** Rider's own "where am I" ping — always updates Rider.currentLocation; only appends to
   * RiderLocation history when tied to a delivery that's actively being tracked. */
  async recordUpdate(riderId: string, deliveryId: string | null, input: LocationUpdateInput): Promise<void> {
    if (deliveryId) {
      const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (!delivery) throw new NotFoundException('Delivery not found');
      if (delivery.riderId !== riderId) {
        throw new ForbiddenException('This delivery is not assigned to you');
      }
      if (!ACTIVE_TRACKING_STATUSES.includes(delivery.status)) {
        throw new ForbiddenException('This delivery is not currently active');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rider.update({
        where: { id: riderId },
        data: {
          currentLatitude: input.latitude,
          currentLongitude: input.longitude,
          lastLocationAt: new Date(),
        },
      });
      await tx.$executeRaw`
        UPDATE "Rider" SET "currentLocation" = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
        WHERE id = ${riderId}
      `;
      if (deliveryId) {
        await tx.riderLocation.create({
          data: {
            riderId,
            deliveryId,
            latitude: input.latitude,
            longitude: input.longitude,
            heading: input.heading,
            speed: input.speed,
            accuracy: input.accuracy,
          },
        });
      }
    });

    if (deliveryId) {
      this.gateway.emitLocationUpdated(deliveryId, input.latitude, input.longitude);
    }
  }

  /** §33: the latest known point for a delivery's assigned rider — never the full history. */
  async getLatestForDelivery(deliveryId: string) {
    return this.prisma.riderLocation.findFirst({
      where: { deliveryId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
