import { StockService } from './stock.service';
import { ProductOutOfStockException } from '../../common/exceptions/product-out-of-stock.exception';

describe('StockService', () => {
  let service: StockService;
  let tx: any;

  beforeEach(() => {
    tx = {
      product: { updateMany: jest.fn(), update: jest.fn() },
      productVariant: { updateMany: jest.fn(), update: jest.fn() },
      inventoryMovement: { create: jest.fn() },
    };
    service = new StockService();
  });

  describe('reserveStock', () => {
    it('decrements a plain product atomically via a conditional UPDATE, never a read-then-write', async () => {
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      await service.reserveStock(tx, [{ productId: 'p1', productName: 'Dog Food', quantity: 2 }]);
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: { productId: 'p1', quantityChange: -2, reason: 'SALE' },
      });
    });

    it('decrements a variant instead of the product when variantId is present', async () => {
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      await service.reserveStock(tx, [{ productId: 'p1', productName: 'Dog Food', variantId: 'v1', quantity: 1 }]);
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'v1', stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      });
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('throws PRODUCT_OUT_OF_STOCK when the conditional update affects zero rows — the race-condition guard', async () => {
      // count: 0 means the WHERE clause's `stock >= quantity` matched nothing — either it never had
      // enough, or a concurrent request just consumed the last unit first.
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.reserveStock(tx, [{ productId: 'p1', productName: 'Dog Food', quantity: 1 }]),
      ).rejects.toBeInstanceOf(ProductOutOfStockException);
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('reserves multiple lines in order, stopping at the first that fails', async () => {
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await expect(
        service.reserveStock(tx, [
          { productId: 'p1', productName: 'A', quantity: 1 },
          { productId: 'p2', productName: 'B', quantity: 1 },
        ]),
      ).rejects.toBeInstanceOf(ProductOutOfStockException);
      expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('releaseStock', () => {
    it('restores a plain product and records a RETURN movement', async () => {
      await service.releaseStock(tx, [{ productId: 'p1', productName: 'Dog Food', quantity: 2 }]);
      expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { increment: 2 } } });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: { productId: 'p1', quantityChange: 2, reason: 'RETURN' },
      });
    });

    it('restores a variant instead of the product when variantId is present', async () => {
      await service.releaseStock(tx, [{ productId: 'p1', productName: 'Dog Food', variantId: 'v1', quantity: 1 }]);
      expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 1 } } });
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });
});
