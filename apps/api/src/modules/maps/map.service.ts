import { Inject, Injectable } from '@nestjs/common';
import {
  Coordinates,
  ETAResult,
  MAP_PROVIDER_TOKEN,
  MapProvider,
  RouteResult,
} from './providers/map-provider.interface';

/**
 * The only thing the rest of the app talks to (§40) — DispatchService/DeliveryService never
 * import a provider directly. Also where §70's "Maps failing must never break an Order" lives:
 * the *Safe variants swallow MapProviderError and return null instead of throwing, for call
 * sites where degraded-but-working is the right behavior (e.g. showing no ETA yet vs. failing
 * the whole delivery creation).
 */
@Injectable()
export class MapService {
  constructor(@Inject(MAP_PROVIDER_TOKEN) private readonly provider: MapProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  geocode(address: string) {
    return this.provider.geocode(address);
  }

  reverseGeocode(coords: Coordinates) {
    return this.provider.reverseGeocode(coords);
  }

  calculateDistance(origin: Coordinates, destination: Coordinates) {
    return this.provider.calculateDistance(origin, destination);
  }

  calculateRoute(origin: Coordinates, destination: Coordinates) {
    return this.provider.calculateRoute(origin, destination);
  }

  calculateETA(origin: Coordinates, destination: Coordinates) {
    return this.provider.calculateETA(origin, destination);
  }

  validateCoordinates(coords: Coordinates) {
    return this.provider.validateCoordinates(coords);
  }

  async calculateRouteSafe(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    try {
      return await this.provider.calculateRoute(origin, destination);
    } catch {
      return null;
    }
  }

  async calculateETASafe(origin: Coordinates, destination: Coordinates): Promise<ETAResult | null> {
    try {
      return await this.provider.calculateETA(origin, destination);
    } catch {
      return null;
    }
  }
}
