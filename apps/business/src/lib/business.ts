import { apiFetch } from './api';

export type CapabilityMap = Record<
  | 'SELLS_PRODUCTS'
  | 'DIRECTORY_LISTING'
  | 'SERVICES'
  | 'BOOKINGS'
  | 'PICKUP'
  | 'DELIVERY'
  | 'COUPONS'
  | 'HOME_SERVICE',
  boolean
>;

/** Capabilities the business itself may toggle (PATCH /business/:id/capabilities) — SELLS_PRODUCTS
 * and DIRECTORY_LISTING are platform-eligibility decisions reserved for Admin, matching exactly
 * what BusinessesService.setOperationalCapability enforces server-side. Mirrored here only to
 * decide what Settings shows as editable vs read-only — the real enforcement is the backend 400.
 * HOME_SERVICE isn't here either — it's derived automatically the first time a service is set to
 * "a domicilio"/"ambas" (see ServiceForm), never a manual switch, so Settings has nothing to show. */
export const OPERATIONAL_CAPABILITIES: (keyof CapabilityMap)[] = ['SERVICES', 'BOOKINGS', 'COUPONS', 'PICKUP', 'DELIVERY'];

/** SERVICES/BOOKINGS/COUPONS only apply to a Directory-listed business — hidden entirely (not
 * just disabled) while DIRECTORY_LISTING is off, mirroring
 * BusinessesService.setOperationalCapability's server-side 400 for the same case. */
export const DIRECTORY_DEPENDENT_CAPABILITIES: (keyof CapabilityMap)[] = ['SERVICES', 'BOOKINGS', 'COUPONS'];

/** PICKUP/DELIVERY are fulfillment options for products — hidden while SELLS_PRODUCTS is off. */
export const PRODUCTS_DEPENDENT_CAPABILITIES: (keyof CapabilityMap)[] = ['PICKUP', 'DELIVERY'];

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
  categories: { id: string; name: string; slug: string }[];
  capabilities: CapabilityMap;
}

export function getBusinessProfile(businessId: string) {
  return apiFetch<BusinessProfile>(`/me/business/${businessId}`);
}

export interface BusinessContract {
  id: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED' | 'SUPERSEDED';
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  contractText: string;
  sellsProducts: boolean;
  directoryListing: boolean;
  pdfUrl: string | null;
  signedAt: string | null;
}

export function getBusinessContract(businessId: string) {
  return apiFetch<BusinessContract | null>(`/me/business/${businessId}/contract`);
}

export function signBusinessContract(businessId: string, signatureDataUrl: string) {
  return apiFetch<BusinessContract>(`/me/business/${businessId}/contract/sign`, {
    method: 'POST',
    body: JSON.stringify({ signatureDataUrl }),
  });
}
