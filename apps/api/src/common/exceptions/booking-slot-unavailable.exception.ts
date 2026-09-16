import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when a booking can't be created because the requested slot is already at capacity —
 * the capacity check runs inside a transaction that first locks the Service row (`SELECT ... FOR
 * UPDATE`), so this is also what a losing concurrent customer sees: two customers racing for the
 * same slot never both succeed.
 */
export class BookingSlotUnavailableException extends BadRequestException {
  constructor() {
    super({
      error: {
        code: 'BOOKING_SLOT_UNAVAILABLE',
        message: 'This time slot is no longer available. Please choose another time.',
      },
    });
  }
}
