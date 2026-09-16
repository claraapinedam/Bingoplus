import { Injectable } from '@nestjs/common';
import { BusinessCapabilityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CapabilityMap = Record<BusinessCapabilityType, boolean>;

const ALL_CAPABILITIES = Object.values(BusinessCapabilityType);

function emptyMap(): CapabilityMap {
  return Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, false])) as CapabilityMap;
}

/**
 * RULE 2/3: capabilities are independent of BusinessCategory — a category describes what kind
 * of business it is, capabilities describe what it's allowed to do on BINGO+. This is the single
 * place that reads/writes BusinessCapability so Marketplace/Directory eligibility (RULE 4/5) is
 * never re-derived ad hoc elsewhere.
 */
@Injectable()
export class BusinessCapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMap(businessId: string): Promise<CapabilityMap> {
    const rows = await this.prisma.businessCapability.findMany({ where: { businessId } });
    const map = emptyMap();
    for (const row of rows) map[row.capability] = row.enabled;
    return map;
  }

  /** Batched version of getMap for list endpoints — one query instead of N. */
  async getMapForMany(businessIds: string[]): Promise<Map<string, CapabilityMap>> {
    const result = new Map<string, CapabilityMap>(businessIds.map((id) => [id, emptyMap()]));
    if (businessIds.length === 0) return result;
    const rows = await this.prisma.businessCapability.findMany({
      where: { businessId: { in: businessIds } },
    });
    for (const row of rows) {
      result.get(row.businessId)![row.capability] = row.enabled;
    }
    return result;
  }

  async has(businessId: string, capability: BusinessCapabilityType): Promise<boolean> {
    const row = await this.prisma.businessCapability.findUnique({
      where: { businessId_capability: { businessId, capability } },
    });
    return row?.enabled ?? false;
  }

  set(businessId: string, capability: BusinessCapabilityType, enabled: boolean) {
    return this.prisma.businessCapability.upsert({
      where: { businessId_capability: { businessId, capability } },
      update: { enabled },
      create: { businessId, capability, enabled },
    });
  }

  /**
   * Called once at onboarding (BusinessesService.apply) — the owner's onboarding answers decide
   * both flags independently: SELLS_PRODUCTS from "¿Quieres vender productos?" (and, only then,
   * fulfillment options), DIRECTORY_LISTING from "¿Quieres aparecer en el Directorio?". Selling
   * products alone never implies Directory presence — a pure seller shows up in "Tiendas" only,
   * monetized via marketplace commission. DIRECTORY_LISTING=true always means a paid membership
   * plan was chosen (see apply()), whether or not the business also sells products.
   */
  async grantOnboardingDefaults(
    businessId: string,
    opts: { sellsProducts: boolean; directoryListing: boolean; pickupEnabled?: boolean; deliveryEnabled?: boolean },
  ): Promise<void> {
    const rows: { capability: BusinessCapabilityType; enabled: boolean }[] = [
      { capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: opts.directoryListing },
      { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: opts.sellsProducts },
    ];
    if (opts.sellsProducts) {
      rows.push({ capability: BusinessCapabilityType.PICKUP, enabled: opts.pickupEnabled ?? true });
      rows.push({
        capability: BusinessCapabilityType.DELIVERY,
        enabled: opts.deliveryEnabled ?? false,
      });
    }
    await this.prisma.businessCapability.createMany({
      data: rows.map((r) => ({ businessId, ...r })),
      skipDuplicates: true,
    });
  }
}
