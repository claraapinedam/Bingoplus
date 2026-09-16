import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when Checkout/Order creation can't reserve the requested quantity — the stock decrement
 * itself is a conditional `UPDATE ... WHERE stock >= quantity` inside the order transaction
 * (StockService.reserveStock), so this is also what a losing concurrent buyer sees (§28/66):
 * never a negative stock value, never a charge for an item that wasn't actually reserved.
 */
export class ProductOutOfStockException extends BadRequestException {
  constructor(productId: string, productName?: string) {
    super({
      error: {
        code: 'PRODUCT_OUT_OF_STOCK',
        message: productName
          ? `"${productName}" no longer has enough stock for this order.`
          : 'One of the items in this order no longer has enough stock.',
        details: { productId },
      },
    });
  }
}
