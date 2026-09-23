import { BusinessMembershipStatus, Prisma } from '@prisma/client';

/**
 * Statuses in which a BusinessMembership is "in good standing" — TRIAL/ACTIVE only. The single
 * source of truth shared by MembershipsService.hasBenefit (benefits gate) and every
 * customer-facing read/eligibility site gated below on full visibility, so the definition of
 * "good standing" never drifts between the two.
 */
export const MEMBERSHIP_GOOD_STANDING_STATUSES: BusinessMembershipStatus[] = [
  BusinessMembershipStatus.TRIAL,
  BusinessMembershipStatus.ACTIVE,
];

/**
 * Prisma where-fragment: spread into any `Prisma.BusinessWhereInput` — a top-level
 * `business.findMany`/`findFirst` `where`, or a nested `business: {...}` relation filter on
 * Product/Service/Promotion/etc — to require the business to have an in-good-standing membership
 * before it's customer-visible.
 *
 * NOT fail-closed on a missing membership row. `BusinessesService.approve()`/`updateCapabilities()`
 * only ever call `MembershipsService.startTrialIfMissing` `if (business.capabilities.DIRECTORY_LISTING)`
 * — a pure product-seller (SELLS_PRODUCTS without DIRECTORY_LISTING) is explicitly documented there
 * as never getting a `BusinessMembership` row at all, by design, because it earns BINGO+ its
 * revenue via marketplace commission instead. Excluding "no membership row" would have made every
 * such business invisible/unsellable the moment this filter shipped — a live regression, not a
 * safety margin. So: no membership row at all -> never opted into the membership system -> always
 * visible; a membership row that EXISTS but is lapsed (PAST_DUE/CANCELLED/EXPIRED) -> excluded.
 *
 * Deliberately never touches `Business.status` (BusinessStatus is admin-controlled account
 * standing — a separate axis, same discipline as Business.manualOverride for online/offline) —
 * this is an ADDITIONAL filter layered alongside whatever `status: BusinessStatus.ACTIVE` check a
 * call site already has, not a replacement for it.
 */
export function membershipGoodStandingWhere(): Prisma.BusinessWhereInput {
  return { OR: [{ membership: null }, { membership: { status: { in: MEMBERSHIP_GOOD_STANDING_STATUSES } } }] };
}

/**
 * Same rule for call sites that already loaded a `business.membership` (or just its `status`) in
 * JS rather than filtering at the DB level — checkout/cart/bookings re-check business state on an
 * object already fetched for other reasons, so this avoids either a second round-trip or
 * duplicating the good-standing array locally. No membership at all (`status` null/undefined) IS
 * good standing here — see membershipGoodStandingWhere's comment above for why a missing row must
 * never be treated as lapsed.
 */
export function isMembershipStatusGoodStanding(status?: BusinessMembershipStatus | null): boolean {
  return status == null || MEMBERSHIP_GOOD_STANDING_STATUSES.includes(status);
}
