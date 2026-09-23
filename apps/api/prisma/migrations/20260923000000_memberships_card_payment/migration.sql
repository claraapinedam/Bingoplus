-- Real card-payment path for MembershipPayment (owner request: memberships get the same
-- Sandbox card-payment flow Booking already has — see BookingsService.createBookingPayment for
-- the precedent). A Payment row can now target a MembershipPayment as its third, mutually
-- exclusive kind of target alongside Order/Booking.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "membershipPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_membershipPaymentId_key" ON "Payment"("membershipPaymentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_membershipPaymentId_fkey" FOREIGN KEY ("membershipPaymentId") REFERENCES "MembershipPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Widen the FASE 9 §1 "exactly one target" guard from two targets (order/booking) to three
-- (order/booking/membershipPayment) — replace, don't just add to, the old two-target check.
ALTER TABLE "Payment" DROP CONSTRAINT "payment_exactly_one_target";

ALTER TABLE "Payment" ADD CONSTRAINT "payment_exactly_one_target" CHECK (
  ( ("orderId" IS NOT NULL)::int + ("bookingId" IS NOT NULL)::int + ("membershipPaymentId" IS NOT NULL)::int ) = 1
);
