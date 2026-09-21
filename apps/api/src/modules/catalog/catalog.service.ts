import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, Prisma, ProductStatus } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { ListBusinessProductsQueryDto, ListPublicProductsQueryDto } from './dto/list-products-query.dto';
import { CreateProductVariantDto, UpdateProductVariantDto } from './dto/product-variant.dto';

/** Below this stock level a product is flagged lowStock in the business owner's listing. */
export const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
  }

  // ── Public (customer-facing) ─────────────────────────────────────────────

  async listPublicProducts(query: ListPublicProductsQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: ProductStatus.ACTIVE,
      // A product can only ever be discoverable while its business is ACTIVE and still has the
      // SELLS_PRODUCTS capability (RULE 4) — capability revocation must hide the product too.
      business: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        capabilities: { some: { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: true } },
      },
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.species ? { species: { some: { species: { slug: query.species } } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };

    // Prisma has no notion of "relevance" — "relevance" (the default) falls back to
    // newest-first, the closest honest signal available without a search-ranking engine
    // (out of scope for the MVP).
    const effectiveOrderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : { createdAt: 'desc' };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: effectiveOrderBy,
        include: {
          category: true,
          business: { select: { id: true, tradeName: true, city: true } },
          species: { include: { species: true } },
        },
      }),
    ]);

    return {
      data: products.map((p) => this.withSpeciesNames(p)),
      meta: { page, pageSize, total },
    };
  }

  async getPublicProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        business: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          capabilities: { some: { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: true } },
        },
      },
      include: {
        category: true,
        business: { select: { id: true, tradeName: true, city: true } },
        variants: true,
        species: { include: { species: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.withSpeciesNames(product);
  }

  /** Flattens the ProductSpecies join into a plain `species: PetSpecies[]` array for API responses. */
  private withSpeciesNames<T extends { species: { species: { id: string; name: string; slug: string } }[] }>(
    product: T,
  ) {
    const { species, ...rest } = product;
    return { ...rest, species: species.map((s) => s.species) };
  }

  // ── Admin-facing (FASE 6 §15) — global visibility, never a second Product management surface;
  // the business still only administers its own catalog via BusinessProductsController below ──

  async listForAdmin(query: { status?: ProductStatus; businessId?: string; search?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          species: { include: { species: true } },
          business: { select: { id: true, tradeName: true } },
        },
      }),
    ]);
    return {
      data: products.map((p) => ({ ...this.withSpeciesNames(p), lowStock: p.stock < LOW_STOCK_THRESHOLD })),
      meta: { page, pageSize, total },
    };
  }

  async getForAdmin(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        species: { include: { species: true } },
        business: { select: { id: true, tradeName: true } },
        variants: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return { ...this.withSpeciesNames(product), lowStock: product.stock < LOW_STOCK_THRESHOLD };
  }

  // ── Business-owner facing ────────────────────────────────────────────────

  async listForBusiness(businessId: string, query: ListBusinessProductsQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ProductWhereInput = {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.lowStock ? { stock: { lt: LOW_STOCK_THRESHOLD } } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { category: true, species: { include: { species: true } } },
      }),
    ]);

    return {
      data: products.map((p) => ({ ...this.withSpeciesNames(p), lowStock: p.stock < LOW_STOCK_THRESHOLD })),
      meta: { page, pageSize, total },
    };
  }

  async getForBusiness(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { category: true, species: { include: { species: true } } },
    });
    return { ...this.withSpeciesNames(product), lowStock: product.stock < LOW_STOCK_THRESHOLD };
  }

  /** `client` defaults to the regular PrismaService but accepts a `$transaction` callback's tx
   * client too — BulkProductUploadService.bulkCreate() passes one so an entire bulk upload commits
   * or rolls back as a single unit, reusing this exact same validation instead of duplicating it. */
  async create(businessId: string, dto: CreateProductDto, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const category = await client.productCategory.findUnique({
      where: { slug: dto.categorySlug },
    });
    if (!category) {
      throw new BadRequestException(`Unknown product category "${dto.categorySlug}"`);
    }
    if (dto.salePrice !== undefined && dto.salePrice >= dto.price) {
      throw new BadRequestException('salePrice must be lower than price');
    }
    const speciesIds = await this.resolveSpeciesIds(dto.speciesSlugs, client);

    return client.product.create({
      data: {
        businessId,
        categoryId: category.id,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        salePrice: dto.salePrice,
        sku: dto.sku,
        stock: dto.stock,
        weight: dto.weight,
        taxCategory: dto.taxCategory,
        images: dto.images ?? [],
        species: speciesIds ? { create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
  }

  async update(businessId: string, productId: string, dto: UpdateProductDto) {
    await this.assertOwnedProduct(businessId, productId);
    if (dto.salePrice !== undefined && dto.price !== undefined && dto.salePrice >= dto.price) {
      throw new BadRequestException('salePrice must be lower than price');
    }
    const { speciesSlugs, categorySlug, ...rest } = dto;
    const speciesIds = await this.resolveSpeciesIds(speciesSlugs);

    let categoryId: string | undefined;
    if (categorySlug !== undefined) {
      const category = await this.prisma.productCategory.findUnique({ where: { slug: categorySlug } });
      if (!category) {
        throw new BadRequestException(`Unknown product category "${categorySlug}"`);
      }
      categoryId = category.id;
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...rest,
        categoryId,
        // A provided speciesSlugs list replaces the product's species entirely — a merge would
        // leave no way to remove a species that no longer applies.
        species: speciesIds ? { deleteMany: {}, create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
  }

  /** Resolves PetSpecies slugs to ids, rejecting anything unknown — undefined input stays undefined (no change on update). */
  private async resolveSpeciesIds(
    slugs?: string[],
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string[] | undefined> {
    if (slugs === undefined) return undefined;
    if (slugs.length === 0) return [];
    const species = await client.petSpecies.findMany({ where: { slug: { in: slugs } } });
    const unknown = slugs.filter((slug) => !species.some((s) => s.slug === slug));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown pet species: ${unknown.join(', ')}`);
    }
    return species.map((s) => s.id);
  }

  async remove(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    await this.prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });
  }

  async activate(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ACTIVE },
    });
  }

  async deactivate(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.INACTIVE },
    });
  }

  async updateStock(businessId: string, productId: string, dto: UpdateStockDto) {
    const product = await this.assertOwnedProduct(businessId, productId);
    const newStock = product.stock + dto.quantityChange;
    if (newStock < 0) {
      throw new BadRequestException(
        `Stock cannot go negative (current: ${product.stock}, change: ${dto.quantityChange})`,
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.create({
        data: {
          productId,
          quantityChange: dto.quantityChange,
          reason: dto.reason,
          note: dto.note,
        },
      }),
      this.prisma.product.update({ where: { id: productId }, data: { stock: newStock } }),
    ]);

    return updated;
  }

  async listStockMovements(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    return this.prisma.inventoryMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Variants ─────────────────────────────────────────────────────────────

  async listVariants(businessId: string, productId: string) {
    await this.assertOwnedProduct(businessId, productId);
    return this.prisma.productVariant.findMany({ where: { productId }, orderBy: { name: 'asc' } });
  }

  async createVariant(businessId: string, productId: string, dto: CreateProductVariantDto) {
    await this.assertOwnedProduct(businessId, productId);
    const existingSku = await this.prisma.productVariant.findUnique({ where: { sku: dto.sku } });
    if (existingSku) {
      throw new ConflictException(`SKU "${dto.sku}" is already in use`);
    }
    return this.prisma.productVariant.create({
      data: {
        productId,
        name: dto.name,
        sku: dto.sku,
        priceDelta: dto.priceDelta ?? 0,
        stock: dto.stock,
      },
    });
  }

  async updateVariant(
    businessId: string,
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    await this.assertOwnedVariant(businessId, productId, variantId);
    if (dto.sku) {
      const existingSku = await this.prisma.productVariant.findUnique({ where: { sku: dto.sku } });
      if (existingSku && existingSku.id !== variantId) {
        throw new ConflictException(`SKU "${dto.sku}" is already in use`);
      }
    }
    return this.prisma.productVariant.update({ where: { id: variantId }, data: dto });
  }

  async removeVariant(businessId: string, productId: string, variantId: string) {
    await this.assertOwnedVariant(businessId, productId, variantId);
    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  private async assertOwnedVariant(businessId: string, productId: string, variantId: string) {
    await this.assertOwnedProduct(businessId, productId);
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Product variant not found');
    }
    return variant;
  }

  private async assertOwnedProduct(businessId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');
    if (product.businessId !== businessId) throw new NotFoundException('Product not found');
    return product;
  }
}
