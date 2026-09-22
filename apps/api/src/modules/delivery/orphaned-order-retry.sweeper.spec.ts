import { OrphanedOrderRetrySweeper } from './orphaned-order-retry.sweeper';

describe('OrphanedOrderRetrySweeper — recovers orders stuck at READY_FOR_PICKUP with no Delivery', () => {
  let sweeper: OrphanedOrderRetrySweeper;
  let prisma: any;
  let delivery: any;

  beforeEach(() => {
    prisma = { order: { findMany: jest.fn().mockResolvedValue([]) } };
    delivery = { createForOrder: jest.fn() };
    sweeper = new OrphanedOrderRetrySweeper(prisma, delivery);
  });

  it('does nothing when there are no orphaned orders', async () => {
    await sweeper.sweep();
    expect(delivery.createForOrder).not.toHaveBeenCalled();
  });

  it('retries createForOrder for a DELIVERY order stuck at READY_FOR_PICKUP with no Delivery row', async () => {
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);

    await sweeper.sweep();

    expect(delivery.createForOrder).toHaveBeenCalledWith('o1');
  });

  it('keeps sweeping the rest of the batch when one retry still fails', async () => {
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
    delivery.createForOrder.mockRejectedValueOnce(new Error('still no valid location')).mockResolvedValueOnce(undefined);

    await expect(sweeper.sweep()).resolves.toBeUndefined();

    expect(delivery.createForOrder).toHaveBeenCalledWith('o1');
    expect(delivery.createForOrder).toHaveBeenCalledWith('o2');
  });
});
