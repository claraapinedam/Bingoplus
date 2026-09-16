export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  /** Encoded polyline, provider-specific — null if the provider doesn't return one. */
  polyline: string | null;
  /** Turn-by-turn steps (§39 getDirections) — folded into the route result rather than a
   * separate method, since every provider that can compute a route can return its steps too. */
  steps: string[];
}

export interface ETAResult {
  etaMinutes: number;
  distanceKm: number;
}

/** §70: thrown instead of a generic Error so callers can degrade gracefully (§70 — Maps failing
 * must never break an Order) and so HTTP layers can map `code` to a stable client-facing error. */
export class MapProviderError extends Error {
  constructor(
    public readonly code:
      | 'MAP_PROVIDER_UNAVAILABLE'
      | 'GEOCODING_FAILED'
      | 'ROUTE_NOT_FOUND'
      | 'INVALID_COORDINATES'
      | 'ETA_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'MapProviderError';
  }
}

/**
 * The only surface DispatchService/DeliveryService talk to (§40) — no module ever imports
 * Google Maps directly. Swapping providers means implementing this class, nothing else.
 */
export abstract class MapProvider {
  abstract readonly name: string;
  abstract geocode(address: string): Promise<GeocodeResult>;
  abstract reverseGeocode(coords: Coordinates): Promise<string>;
  abstract calculateDistance(origin: Coordinates, destination: Coordinates): Promise<{ distanceKm: number }>;
  abstract calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteResult>;
  abstract calculateETA(origin: Coordinates, destination: Coordinates): Promise<ETAResult>;
  abstract validateCoordinates(coords: Coordinates): boolean;
}

export const MAP_PROVIDER_TOKEN = 'MAP_PROVIDER_TOKEN';
