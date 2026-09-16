import { ConflictException } from '@nestjs/common';

/**
 * Thrown when a customer tries to add a product from a different business to a cart that
 * already holds items from another one — the marketplace enforces a single-business cart
 * (RULE 9). The exact error code is part of the contract clients rely on to offer the
 * replaceCart flow, not just its 409 status.
 */
export class CartBelongsToDifferentBusinessException extends ConflictException {
  constructor() {
    super({
      error: {
        code: 'CART_BELONGS_TO_DIFFERENT_BUSINESS',
        message:
          'Your cart has items from a different business. Retry with replaceCart: true to start a new cart, or clear it first.',
      },
    });
  }
}
