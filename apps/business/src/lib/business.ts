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

/** Mirrors @bingoplus/utils' BusinessOnlineStatus — see getBusinessOnlineStatus's own doc comment
 * for what `source`/`isOpenNow` mean; this is the same shape BusinessesService.getOne() computes
 * server-side and hands back as-is. */
export interface BusinessOnlineStatus {
  online: boolean;
  source: 'MANUAL' | 'SCHEDULE';
  isOpenNow: boolean | null;
  closesAt: string | null;
}

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
  manualOverride: 'ONLINE' | 'OFFLINE' | null;
  onlineStatus: BusinessOnlineStatus;
}

export function getBusinessProfile(businessId: string) {
  return apiFetch<BusinessProfile>(`/me/business/${businessId}`);
}

/** The connect/disconnect toggle — `override: null` clears back to "automático" (follow
 * `openingHours`); 'ONLINE'/'OFFLINE' forces that state until changed again (no auto-expiry, see
 * the persistence comment on Business.manualOverride in the API's schema.prisma). */
export function setBusinessOnlineOverride(businessId: string, override: 'ONLINE' | 'OFFLINE' | null) {
  return apiFetch<{ manualOverride: 'ONLINE' | 'OFFLINE' | null; manualOverrideAt: string | null } & BusinessOnlineStatus>(
    `/me/business/${businessId}/online-status`,
    { method: 'PATCH', body: JSON.stringify({ override }) },
  );
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
  bingoPlusRepresentativeName: string | null;
  bingoPlusSignatureImageUrl: string | null;
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
