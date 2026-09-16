import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderStateMachine } from './order-state-machine';

describe('OrderStateMachine', () => {
  const machine = new OrderStateMachine();

  it('allows the full pickup happy path', () => {
    const path: OrderStatus[] = [
      OrderStatus.CREATED,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAID,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(machine.canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('rejects REFUNDED-style backwards jumps like PAID -> CREATED', () => {
    expect(machine.canTransition(OrderStatus.PAID, OrderStatus.CREATED)).toBe(false);
  });

  it('rejects skipping straight from CREATED to COMPLETED', () => {
    expect(machine.canTransition(OrderStatus.CREATED, OrderStatus.COMPLETED)).toBe(false);
  });

  it('allows cancellation up through CONFIRMED but not after PREPARING starts', () => {
    expect(machine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED)).toBe(false);
  });

  it('COMPLETED and CANCELLED are terminal — no transitions out', () => {
    expect(machine.canTransition(OrderStatus.COMPLETED, OrderStatus.PAID)).toBe(false);
    expect(machine.canTransition(OrderStatus.CANCELLED, OrderStatus.CREATED)).toBe(false);
  });

  it('assertTransition throws BadRequestException with the allowed list on an illegal move', () => {
    expect(() => machine.assertTransition(OrderStatus.PAID, OrderStatus.PREPARING)).toThrow(BadRequestException);
  });

  describe('isCustomerCancellable', () => {
    it.each([OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING, OrderStatus.PAID, OrderStatus.CONFIRMED])(
      '%s is customer-cancellable',
      (status) => {
        expect(machine.isCustomerCancellable(status)).toBe(true);
      },
    );

    it.each([OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED])(
      '%s is not customer-cancellable',
      (status) => {
        expect(machine.isCustomerCancellable(status)).toBe(false);
      },
    );
  });
});
