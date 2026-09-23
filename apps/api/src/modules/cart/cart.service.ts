import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, ProductStatus } from '@prisma/client';
import { getBusinessOnlineStatus } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CartBelongsToDifferentBusinessException } from '../../common/exceptions/cart-different-business.exception';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { isMembershipStatusGoodStanding } from '../memberships/membership-visibility.util';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const CART_INCLUDE = {
  items: {
    include: { product: true, variant: true },
    orderBy: { id: 'asc' as const },
  },
  // Delivery/pickup now live in BusinessCapability, not on Business directly — the cart doesn't
  // need them for its own logic, so they're omitted here rather than joined in just for display.
  business: { select: { id: true, tradeName: true } },
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: CART_INCLUDE });
    return this.toResponse(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { business: { include: { membership: { select: { status: true } } } } },
    });
    if (!product || product.deletedAt || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product not found');
    }
    if (product.business.status !== BusinessStatus.ACTIVE || product.business.deletedAt) {
      throw new BadRequestException('This business is not currently accepting orders');
    }
    if (!isMembershipStatusGoodStanding(product.business.membership?.status)) {
      throw new BadRequestException('This business is not currently accepting orders');
    }
    // Connect/disconnect toggle (manual override or, absent one, the business's own configured
    // opening hours) — checked here too, not just at checkout, so a business that goes offline
    // mid-session can't have new items added to a cart against it either (mirrors the
    // SELLS_PRODUCTS check right below).
    const onlineStatus = getBusinessOnlineStatus(product.business.openingHours, product.business.manualOverride);
    if (!onlineStatus.online) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_OFFLINE', message: 'This business is currently offline and not accepting orders.' },
      });
    }
    // RULE 4: a business only participates in Marketplace (and therefore Cart/Checkout) while
    // SELLS_PRODUCTS is enabled — checked here, not just on the listing endpoints, so a business
    // that loses the capability mid-session can never have new items added to a cart either.
    const sellsProducts = await this.capabilities.has(
      product.businessId,
      BusinessCapabilityType.SELLS_PRODUCTS,
    );
    if (!sellsProducts) {
      throw new BadRequestException({
        error: { code: 'BUSINESS_NOT_SELLING', message: 'This business is not currently selling products.' },
      });
    }

    const variant = dto.variantId
      ? await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } })
      : null;
    if (dto.variantId && (!variant || variant.productId !== product.id)) {
      throw new NotFoundException('Product variant not found');
    }

    const availableStock = variant ? variant.stock : product.stock;
    const unitPrice =
      Number(product.salePrice ?? product.price) + Number(variant?.priceDelta ?? 0);

    let cart = await this.prisma.cart.findUnique({ where: { userId } });

    if (cart && cart.businessId !== product.businessId) {
      if (!dto.replaceCart) {
        throw new CartBelongsToDifferentBusinessException();
      }
      await this.prisma.cart.delete({ where: { id: cart.id } });
      cart = null;
    }

    if (!cart) {
      cart = await this.prisma.cart.create({ data: { userId, businessId: product.businessId } });
    }

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: product.id, variantId: variant?.id ?? null },
    });

    const requestedTotalQty = (existingItem?.quantity ?? 0) + dto.quantity;
    if (requestedTotalQty > availableStock) {
      throw new BadRequestException(
        `Not enough stock: ${availableStock} available, ${requestedTotalQty} requested`,
      );
    }

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: requestedTotalQty, unitPriceSnapshot: unitPrice },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id,
          quantity: dto.quantity,
          unitPriceSnapshot: unitPrice,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItemQuantity(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.assertOwnedItem(userId, itemId);
    const availableStock = item.variant ? item.variant.stock : item.product.stock;
    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `Not enough stock: ${availableStock} available, ${dto.quantity} requested`,
      );
    }
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.assertOwnedItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cart.delete({ where: { id: cart.id } });
    }
    return null;
  }

  private async assertOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, product: true, variant: true },
    });
    if (!item) throw new NotFoundException('Cart item not found');
    if (item.cart.userId !== userId) throw new ForbiddenException('Not your cart item');
    return item;
  }

  private toResponse(cart: any | null) {
    if (!cart) return null;

    const items = cart.items ?? [];
    const subtotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.unitPriceSnapshot) * item.quantity,
      0,
    );

    return { ...cart, subtotal };
  }
}
