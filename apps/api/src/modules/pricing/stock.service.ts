import { Injectable } from '@nestjs/common';
import { InventoryReason, Prisma } from '@prisma/client';
import { ProductOutOfStockException } from '../../common/exceptions/product-out-of-stock.exception';

export interface StockLine {
  productId: string;
  productName: string;
  variantId?: string | null;
  quantity: number;
}

/**
 * Atomic, race-condition-safe stock reservation (§28/29/66) — must always be called from inside
 * the caller's `$transaction`. The decrement itself is the concurrency guard: a conditional
 * `UPDATE ... WHERE stock >= quantity` either affects exactly one row (reservation succeeded) or
 * zero rows (someone else's request already consumed the last unit), never a negative value —
 * no separate read-then-write race window to protect against.
 */
@Injectable()
export class StockService {
  async reserveStock(tx: Prisma.TransactionClient, lines: StockLine[]): Promise<void> {
    for (const line of lines) {
      if (line.variantId) {
        const result = await tx.productVariant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (result.count === 0) throw new ProductOutOfStockException(line.productId, line.productName);
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            variantId: line.variantId,
            quantityChange: -line.quantity,
            reason: InventoryReason.SALE,
          },
        });
      } else {
        const result = await tx.product.updateMany({
          where: { id: line.productId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (result.count === 0) throw new ProductOutOfStockException(line.productId, line.productName);
        await tx.inventoryMovement.create({
          data: { productId: line.productId, quantityChange: -line.quantity, reason: InventoryReason.SALE },
        });
      }
    }
  }

  /** Restores stock on cancellation (§35) — reverses exactly what reserveStock decremented. */
  async releaseStock(tx: Prisma.TransactionClient, lines: StockLine[]): Promise<void> {
    for (const line of lines) {
      if (line.variantId) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            variantId: line.variantId,
            quantityChange: line.quantity,
            reason: InventoryReason.RETURN,
          },
        });
      } else {
        await tx.product.update({ where: { id: line.productId }, data: { stock: { increment: line.quantity } } });
        await tx.inventoryMovement.create({
          data: { productId: line.productId, quantityChange: line.quantity, reason: InventoryReason.RETURN },
        });
      }
    }
  }
}
