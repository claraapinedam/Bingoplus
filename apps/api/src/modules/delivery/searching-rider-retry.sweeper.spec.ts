import { SearchingRiderRetrySweeper } from './searching-rider-retry.sweeper';

describe('SearchingRiderRetrySweeper — query/backoff logic', () => {
  let sweeper: SearchingRiderRetrySweeper;
  let prisma: any;
  let dispatch: any;
  let orchestrator: any;
  let gateway: any;

  const oldCreatedAt = new Date(Date.now() - 10 * 60 * 1000);

  beforeEach(() => {
    prisma = {
      delivery: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryAssignmentHistory: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) => fn({})),
    };
    dispatch = { getConfig: jest.fn().mockResolvedValue({ retryBackoffSeconds: 15, maxDispatchAttempts: 20 }) };
    orchestrator = { dispatch: jest.fn() };
    gateway = { emitStatusUpdated: jest.fn(), emitRiderAssigned: jest.fn(), emitDeliveryOffer: jest.fn() };
    sweeper = new SearchingRiderRetrySweeper(prisma, dispatch, orchestrator, gateway);
  });

  it('does nothing when there are no SEARCHING_RIDER deliveries past the backoff window', async () => {
    await sweeper.sweep();
    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('re-dispatches a delivery whose last attempt is older than the backoff, excluding previously-offered riders', async () => {
    prisma.delivery.findMany.mockResolvedValue([
      { id: 'd1', createdAt: oldCreatedAt, pickupAddressSnapshot: { latitude: -0.2, longitude: -78.5 } },
    ]);
    prisma.deliveryAssignmentHistory.findMany.mockResolvedValue([{ riderId: 'rider-1' }]);
    orchestrator.dispatch.mockResolvedValue('rider-2');

    await sweeper.sweep();

    expect(orchestrator.dispatch).toHaveBeenCalledWith(expect.anything(), 'd1', -0.2, -78.5, ['rider-1']);
    expect(gateway.emitRiderAssigned).toHaveBeenCalledWith('d1', 'rider-2');
    expect(gateway.emitDeliveryOffer).toHaveBeenCalledWith('rider-2', 'd1');
  });

  it('skips a delivery whose last attempt is still inside the backoff window', async () => {
    prisma.delivery.findMany.mockResolvedValue([
      { id: 'd1', createdAt: oldCreatedAt, pickupAddressSnapshot: { latitude: -0.2, longitude: -78.5 } },
    ]);
    prisma.deliveryAssignmentHistory.findFirst.mockResolvedValue({ createdAt: new Date() }); // just attempted

    await sweeper.sweep();

    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('skips (never re-dispatches) a delivery that already hit maxDispatchAttempts — the safety valve, not an auto-fail', async () => {
    prisma.delivery.findMany.mockResolvedValue([
      { id: 'd1', createdAt: oldCreatedAt, pickupAddressSnapshot: { latitude: -0.2, longitude: -78.5 } },
    ]);
    prisma.deliveryAssignmentHistory.count.mockResolvedValue(20);

    await sweeper.sweep();

    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('skips a delivery with no usable pickup coordinates rather than throwing', async () => {
    prisma.delivery.findMany.mockResolvedValue([{ id: 'd1', createdAt: oldCreatedAt, pickupAddressSnapshot: {} }]);

    await expect(sweeper.sweep()).resolves.toBeUndefined();
    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });
});
