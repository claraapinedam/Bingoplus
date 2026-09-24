import { BadRequestException } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { DeliveryStateMachine } from './delivery-state-machine';

describe('DeliveryStateMachine', () => {
  const machine = new DeliveryStateMachine();

  it('allows the full happy path', () => {
    const path: DeliveryStatus[] = [
      DeliveryStatus.PENDING,
      DeliveryStatus.SEARCHING_RIDER,
      DeliveryStatus.RIDER_ASSIGNED,
      DeliveryStatus.RIDER_ACCEPTED,
      DeliveryStatus.GOING_TO_PICKUP,
      DeliveryStatus.ARRIVED_AT_PICKUP,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.ARRIVED_AT_CUSTOMER,
      DeliveryStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(machine.canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('a rider rejection/timeout sends RIDER_ASSIGNED back to SEARCHING_RIDER, not to a dead end', () => {
    expect(machine.canTransition(DeliveryStatus.RIDER_ASSIGNED, DeliveryStatus.SEARCHING_RIDER)).toBe(true);
  });

  it('SEARCHING_RIDER can terminate as FAILED when no eligible rider is found', () => {
    expect(machine.canTransition(DeliveryStatus.SEARCHING_RIDER, DeliveryStatus.FAILED)).toBe(true);
  });

  it('rejects skipping straight from PENDING to DELIVERED', () => {
    expect(machine.canTransition(DeliveryStatus.PENDING, DeliveryStatus.DELIVERED)).toBe(false);
  });

  it('rejects backwards jumps like IN_TRANSIT -> PICKED_UP', () => {
    expect(machine.canTransition(DeliveryStatus.IN_TRANSIT, DeliveryStatus.PICKED_UP)).toBe(false);
  });

  it('DELIVERED, CANCELLED and FAILED are terminal — no transitions out', () => {
    expect(machine.canTransition(DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED)).toBe(false);
    expect(machine.canTransition(DeliveryStatus.CANCELLED, DeliveryStatus.PENDING)).toBe(false);
    expect(machine.canTransition(DeliveryStatus.FAILED, DeliveryStatus.SEARCHING_RIDER)).toBe(false);
  });

  it('assertTransition throws BadRequestException with the allowed list on an illegal move', () => {
    expect(() => machine.assertTransition(DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED)).toThrow(
      BadRequestException,
    );
  });

  describe('isCancellable', () => {
    it.each([
      DeliveryStatus.PENDING,
      DeliveryStatus.SEARCHING_RIDER,
      DeliveryStatus.RIDER_ASSIGNED,
      DeliveryStatus.RIDER_ACCEPTED,
      DeliveryStatus.GOING_TO_PICKUP,
      DeliveryStatus.ARRIVED_AT_PICKUP,
    ])('%s is cancellable', (status) => {
      expect(machine.isCancellable(status)).toBe(true);
    });

    it.each([DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT, DeliveryStatus.ARRIVED_AT_CUSTOMER, DeliveryStatus.DELIVERED])(
      '%s is not cancellable — once picked up, incidents are the mechanism',
      (status) => {
        expect(machine.isCancellable(status)).toBe(false);
      },
    );
  });

  describe('isTerminal', () => {
    it.each([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED])(
      '%s is terminal — used by DeliveryChatService to close the rider<->customer chat',
      (status) => {
        expect(machine.isTerminal(status)).toBe(true);
      },
    );

    it.each([
      DeliveryStatus.PENDING,
      DeliveryStatus.SEARCHING_RIDER,
      DeliveryStatus.RIDER_ASSIGNED,
      DeliveryStatus.RIDER_ACCEPTED,
      DeliveryStatus.GOING_TO_PICKUP,
      DeliveryStatus.ARRIVED_AT_PICKUP,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.ARRIVED_AT_CUSTOMER,
    ])('%s is not terminal', (status) => {
      expect(machine.isTerminal(status)).toBe(false);
    });
  });
});
