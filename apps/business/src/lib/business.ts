import { apiFetch } from './api';

export type CapabilityMap = Record<
  'SELLS_PRODUCTS' | 'DIRECTORY_LISTING' | 'SERVICES' | 'BOOKINGS' | 'PICKUP' | 'DELIVERY' | 'COUPONS',
  boolean
>;

/** Capabilities the business itself may toggle (PATCH /business/:id/capabilities) — SELLS_PRODUCTS
 * and DIRECTORY_LISTING are platform-eligibility decisions reserved for Admin, matching exactly
 * what BusinessesService.setOperationalCapability enforces server-side. Mirrored here only to
 * decide what Settings shows as editable vs read-only — the real enforcement is the backend 400. */
export const OPERATIONAL_CAPABILITIES: (keyof CapabilityMap)[] = ['SERVICES', 'BOOKINGS', 'COUPONS', 'PICKUP', 'DELIVERY'];

export interface BusinessProfile {
  id: string;
  tradeName: string;
  legalName: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  addressLine: string;
  city: string;
  phone: string;
  email: string;
  openingHours: Record<string, { open: string; close: string }> | null;
  status: string;
  ratingAvg: number;
  reviewCount: number;
  deliveryFeeUsd: string | number | null;
  deliveryEstimateMinutes: number | null;
  category: { id: string; name: string; slug: string };
  capabilities: CapabilityMap;
}

export function getBusinessProfile(businessId: string) {
  return apiFetch<BusinessProfile>(`/me/business/${businessId}`);
}
