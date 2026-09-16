import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

/** §46: the exact named error codes Business/Customer coupon flows must distinguish. */
export class CouponInvalidException extends BadRequestException {
  constructor(message = 'This QR code is invalid or has expired.') {
    super({ error: { code: 'COUPON_INVALID', message } });
  }
}

export class CouponNotActiveException extends BadRequestException {
  constructor() {
    super({ error: { code: 'COUPON_NOT_ACTIVE', message: 'This coupon is not currently active.' } });
  }
}

export class CouponExpiredException extends BadRequestException {
  constructor() {
    super({ error: { code: 'COUPON_EXPIRED', message: 'This coupon is outside its valid date range.' } });
  }
}

export class CouponUsageLimitReachedException extends BadRequestException {
  constructor() {
    super({ error: { code: 'COUPON_USAGE_LIMIT_REACHED', message: 'This coupon has reached its usage limit.' } });
  }
}

export class CouponCustomerLimitReachedException extends BadRequestException {
  constructor() {
    super({
      error: {
        code: 'COUPON_CUSTOMER_LIMIT_REACHED',
        message: 'You have already used this coupon the maximum number of times.',
      },
    });
  }
}

export class CouponWrongBusinessException extends ForbiddenException {
  constructor() {
    super({ error: { code: 'COUPON_WRONG_BUSINESS', message: 'This coupon belongs to a different business.' } });
  }
}

export class CouponNotFoundException extends NotFoundException {
  constructor() {
    super({ error: { code: 'COUPON_NOT_FOUND', message: 'Coupon not found.' } });
  }
}

export class CouponMinimumPurchaseException extends BadRequestException {
  constructor(minimumPurchase: number) {
    super({
      error: {
        code: 'COUPON_MINIMUM_PURCHASE_NOT_MET',
        message: `This coupon requires a minimum purchase of ${minimumPurchase}.`,
        details: { minimumPurchase },
      },
    });
  }
}
