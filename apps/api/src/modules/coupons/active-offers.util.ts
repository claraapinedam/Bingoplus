import { BusinessCouponStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActiveOfferSummary {
  offer: { title: string };
  moreOffersCount: number;
}

/**
 * Real active BusinessCoupon summary per business — the earliest-created active coupon plus a
 * count of any others — used by every business-card-shaped listing (Marketplace, Directory,
 * Favorites) so a store's "current offer" badge is the same wherever it's shown. A business with
 * no active coupon simply has no entry in the returned map (never a fabricated placeholder).
 */
export async function getActiveOffersMap(
  prisma: PrismaService,
  businessIds: string[],
): Promise<Map<string, ActiveOfferSummary>> {
  const result = new Map<string, ActiveOfferSummary>();
  if (businessIds.length === 0) return result;
  const now = new Date();
  const coupons = await prisma.businessCoupon.findMany({
    where: {
      businessId: { in: businessIds },
      status: BusinessCouponStatus.ACTIVE,
      startDate: { lte: now },
      expirationDate: { gte: now },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const c of coupons) {
    const entry = result.get(c.businessId);
    if (entry) entry.moreOffersCount += 1;
    else result.set(c.businessId, { offer: { title: c.title }, moreOffersCount: 0 });
  }
  return result;
}
