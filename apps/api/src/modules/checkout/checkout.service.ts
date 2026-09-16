import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessCapabilityType, BusinessStatus, FulfillmentType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { PriceCalculationService, PriceableCartItem } from '../pricing/price-calculation.service';
import { StockService } from '../pricing/stock.service';
import { PaymentService } from '../payments/payment.service';
import { OrderStateMachine } from '../orders/order-state-machine';
import { NotificationService } from '../notifications/notification.service';
import { ProductOutOfStockException } from '../../common/exceptions/product-out-of-stock.exception';
import { generateOrderNumber } from '../orders/order-number.util';
import { CheckoutValidateDto, CreatePaymentDto } from './dto/checkout.dto';

const CART_INCLUDE = {
  items: { include: { product: { include: { business: true } }, variant: true } },
} satisfies Prisma.CartInclude;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
    private readonly priceCalculation: PriceCalculationService,
    private readonly stock: StockService,
    private readonly payments: PaymentService,
    private readonly stateMachine: OrderStateMachine,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  /** §11: MVP is USD-only, but every price is stored per-record (never a global constant) — a
   * business/order in a different currency later is a data change, not an architecture change. */
  private get defaultCurrency(): string {
    return this.config.get<string>('CURRENCY') ?? 'USD';
  }

  /** §8: dry-run — never mutates anything, never reserves stock, never creates a Payment/Order. */
  async validate(userId: string, dto: CheckoutValidateDto) {
    const { cart, business, address } = await this.loadAndValidateCheckoutInputs(userId, dto, this.prisma);

    const items = this.toPriceableItems(cart);
    this.assertStockAvailable(cart);

    const breakdown = await this.priceCalculation.calculate(
      business.id,
      items,
      dto.fulfillmentType,
      business.deliveryFeeUsd,
      this.defaultCurrency,
    );

    return {
      valid: true,
      business: { id: business.id, tradeName: business.tradeName },
      address: address ? { id: address.id, label: address.label, line1: address.line1, city: address.city } : null,
      items: breakdown.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toNumber(),
        subtotal: i.subtotal.toNumber(),
        taxCategory: i.taxCategory,
        taxAmount: i.taxAmount.toNumber(),
      })),
      subtotal: breakdown.subtotal.toNumber(),
      discount: breakdown.discount.toNumber(),
      taxableSubtotal: breakdown.taxableSubtotal.toNumber(),
      zeroTaxSubtotal: breakdown.zeroTaxSubtotal.toNumber(),
      taxes: breakdown.tax.toNumber(),
      platformFee: breakdown.platformFee.toNumber(),
      serviceFee: breakdown.serviceFee.toNumber(),
      deliveryFee: breakdown.deliveryFee.toNumber(),
      total: breakdown.total.toNumber(),
      currency: breakdown.currency,
    };
  }

  /**
   * §29: the whole order-creation transaction — validate, reserve stock, create Order+Items,
   * create the Payment — all inside one `$transaction`. If any step fails, nothing is left
   * behind: no reduced stock without an order, no orphaned Payment.
   *
   * §21/67: the idempotency check runs *first*, before touching the cart at all — a retried
   * request with the same key must return the original order/payment even though the first
   * call already consumed (deleted) the cart, so there is nothing left to re-validate.
   */
  async createPayment(userId: string, dto: CreatePaymentDto) {
    const existingPayment = await this.prisma.payment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existingPayment) {
      // This idempotency key was already used for a Marketplace checkout in a previous request —
      // a Booking payment (FASE 9 §1) is created through BookingsService and would never reach
      // this code path, so a hit here must be an Order payment.
      if (!existingPayment.orderId) {
        throw new BadRequestException('This idempotency key was already used for a different kind of payment.');
      }
      const order = await this.prisma.order.findUniqueOrThrow({ where: { id: existingPayment.orderId } });
      if (order.userId !== userId) throw new ForbiddenException('Not your payment');
      return { order, payment: existingPayment };
    }

    return this.prisma.$transaction(async (tx) => {
      const { cart, business, address } = await this.loadAndValidateCheckoutInputs(userId, dto, tx);
      const items = this.toPriceableItems(cart);

      const breakdown = await this.priceCalculation.calculate(
        business.id,
        items,
        dto.fulfillmentType,
        business.deliveryFeeUsd,
        this.defaultCurrency,
      );

      await this.stock.reserveStock(
        tx,
        cart.items.map((i) => ({
          productId: i.productId,
          productName: i.product.name,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      );

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          businessId: business.id,
          addressId: address?.id,
          fulfillmentType: dto.fulfillmentType,
          status: OrderStatus.PAYMENT_PENDING,
          subtotal: breakdown.subtotal,
          discount: breakdown.discount,
          platformFee: breakdown.platformFee,
          serviceFee: breakdown.serviceFee,
          deliveryFee: breakdown.deliveryFee,
          taxableSubtotal: breakdown.taxableSubtotal,
          zeroTaxSubtotal: breakdown.zeroTaxSubtotal,
          tax: breakdown.tax,
          total: breakdown.total,
          currency: breakdown.currency,
          notes: dto.notes,
          deliveryAddressSnapshot: address ? (address as unknown as Prisma.InputJsonValue) : undefined,
        },
      });

      await tx.orderItem.createMany({
        data: breakdown.items.map((i) => ({
          orderId: order.id,
          productId: i.productId,
          variantId: i.variantId,
          nameSnapshot: i.productName,
          skuSnapshot: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
          taxCategory: i.taxCategory,
          taxAmount: i.taxAmount,
        })),
      });

      const payment = await this.payments.createPayment(tx, { orderId: order.id }, breakdown.total, breakdown.currency, dto.idempotencyKey);

      // The cart becomes an order now — clearing it prevents accidentally checking out the same
      // items twice from a stale page.
      await tx.cart.delete({ where: { id: cart.id } }).catch(() => undefined);

      return { order, payment };
    });
  }

  /** §19/20: idempotent — confirming an already-resolved order just returns its current state. */
  async confirm(userId: string, paymentId: string, simulateFailure?: boolean) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.order) {
      throw new BadRequestException('This payment is not for a Marketplace order.');
    }
    if (payment.order.userId !== userId) throw new ForbiddenException('Not your payment');

    if (payment.order.status === OrderStatus.PAID || payment.order.status === OrderStatus.CANCELLED) {
      return this.prisma.order.findUniqueOrThrow({
        where: { id: payment.order.id },
        include: { items: true, payment: true },
      });
    }

    const result = await this.payments.confirmPayment(payment.id, simulateFailure ? 'failure' : 'success');
    await this.syncOrderFromPaymentStatus(payment.order.id, result.status);

    return this.prisma.order.findUniqueOrThrow({ where: { id: payment.order.id }, include: { items: true, payment: true } });
  }

  /** Shared by confirm() and the webhook handler — one place decides what a Payment status means for the Order. */
  async syncOrderFromPaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    if (paymentStatus === PaymentStatus.PAID && this.stateMachine.canTransition(order.status, OrderStatus.PAID)) {
      await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID } });

      void this.notifications.notify({
        userId: order.userId,
        event: 'order.paid',
        title: 'Pago confirmado',
        body: 'Recibimos tu pago. Tu pedido fue enviado al negocio.',
        entityType: 'Order',
        entityId: order.id,
      });
      const business = await this.prisma.business.findUnique({ where: { id: order.businessId }, select: { ownerId: true } });
      if (business) {
        void this.notifications.notify({
          userId: business.ownerId,
          event: 'order.new',
          title: 'Nuevo pedido',
          body: `Tienes un nuevo pedido #${order.orderNumber}.`,
          entityType: 'Order',
          entityId: order.id,
        });
      }
    } else if (
      paymentStatus === PaymentStatus.FAILED &&
      this.stateMachine.canTransition(order.status, OrderStatus.CANCELLED)
    ) {
      await this.prisma.$transaction(async (tx) => {
        const items = await tx.orderItem.findMany({ where: { orderId } });
        await this.stock.releaseStock(
          tx,
          items.map((i) => ({
            productId: i.productId,
            productName: i.nameSnapshot,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        );
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED, cancelReason: 'Payment failed', cancelledAt: new Date() },
        });
      });

      void this.notifications.notify({
        userId: order.userId,
        event: 'order.payment_failed',
        title: 'Pago no procesado',
        body: 'No pudimos procesar el pago de tu pedido. Inténtalo de nuevo.',
        entityType: 'Order',
        entityId: order.id,
      });
    }
  }

  // ── Shared validation ────────────────────────────────────────────────────

  private async loadAndValidateCheckoutInputs(
    userId: string,
    dto: CheckoutValidateDto,
    client: Prisma.TransactionClient,
  ) {
    const cart = await client.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException({ error: { code: 'CART_EMPTY', message: 'Your cart is empty.' } });
    }

    const business = cart.items[0].product.business;
    if (business.status !== BusinessStatus.ACTIVE || business.deletedAt) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_NOT_ACTIVE', message: 'This business is not currently accepting orders.' },
      });
    }

    const capMap = await this.capabilities.getMap(business.id);
    if (!capMap[BusinessCapabilityType.SELLS_PRODUCTS]) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_NOT_SELLING', message: 'This business is not currently selling products.' },
      });
    }

    for (const item of cart.items) {
      if (item.product.deletedAt || item.product.status !== 'ACTIVE') {
        throw new BadRequestException({
          error: {
            code: 'PRODUCT_UNAVAILABLE',
            message: `"${item.product.name}" is no longer available.`,
            details: { productId: item.productId },
          },
        });
      }
    }

    if (dto.fulfillmentType === FulfillmentType.PICKUP && !capMap[BusinessCapabilityType.PICKUP]) {
      throw new BadRequestException({
        error: { code: 'FULFILLMENT_NOT_AVAILABLE', message: 'This business does not offer pickup.' },
      });
    }
    if (dto.fulfillmentType === FulfillmentType.DELIVERY && !capMap[BusinessCapabilityType.DELIVERY]) {
      throw new BadRequestException({
        error: { code: 'FULFILLMENT_NOT_AVAILABLE', message: 'This business does not offer delivery.' },
      });
    }

    let address = null;
    if (dto.fulfillmentType === FulfillmentType.DELIVERY) {
      if (!dto.addressId) {
        throw new BadRequestException({
          error: { code: 'ADDRESS_REQUIRED', message: 'An address is required for delivery.' },
        });
      }
      address = await client.address.findUnique({ where: { id: dto.addressId } });
      if (!address || address.userId !== userId) throw new NotFoundException('Address not found');
    }

    return { cart, business, address };
  }

  private toPriceableItems(cart: Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>): PriceableCartItem[] {
    return cart.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      sku: item.variant?.sku ?? item.product.sku,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.product.salePrice ?? item.product.price).plus(
        item.variant?.priceDelta ?? 0,
      ),
      taxCategory: item.product.taxCategory,
    }));
  }

  private assertStockAvailable(cart: Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>) {
    for (const item of cart.items) {
      const available = item.variant ? item.variant.stock : item.product.stock;
      if (item.quantity > available) {
        throw new ProductOutOfStockException(item.productId, item.product.name);
      }
    }
  }
}
