import { Injectable } from '@nestjs/common';
import { haversineKm } from '@bingoplus/utils';
import { Coordinates, ETAResult, GeocodeResult, MapProvider, MapProviderError, RouteResult } from './map-provider.interface';

/** Below this speed estimate, a very short haversine hop still gets a sane non-zero ETA. */
const MIN_DURATION_MINUTES = 3;
/** Rough average urban delivery speed (motorcycle/car in city traffic) — a deliberately simple,
 * deterministic model; a real routing provider replaces this with actual road-network timing. */
const AVERAGE_SPEED_KMH = 25;
/** Straight-line distance underestimates real road distance — a fixed detour factor keeps the
 * mock's numbers roughly plausible instead of unrealistically short. */
const ROAD_DISTANCE_FACTOR = 1.3;

/**
 * Dev/test-only MapProvider (§87) — deterministic, no network calls, no API key required.
 * Distance/ETA come from haversineKm (the same formula BusinessRankingService already uses for
 * straight-line proximity) with a fixed road-distance/speed model layered on top. Geocoding is a
 * simple deterministic stub, since every Business/Address in this app is entered with real
 * lat/long today rather than relying on geocoding.
 */
@Injectable()
export class MockMapProvider extends MapProvider {
  readonly name = 'mock';

  async geocode(address: string): Promise<GeocodeResult> {
    if (!address || address.trim().length === 0) {
      throw new MapProviderError('GEOCODING_FAILED', 'Cannot geocode an empty address.');
    }
    // Deterministic pseudo-coordinates derived from the address string, centered near Quito —
    // good enough to exercise the pipeline in dev/test without a real geocoder.
    const hash = this.hashString(address);
    const latitude = -0.2 + ((hash % 1000) / 1000 - 0.5) * 0.2;
    const longitude = -78.5 + (((hash >> 8) % 1000) / 1000 - 0.5) * 0.2;
    return { latitude, longitude, formattedAddress: address };
  }

  async reverseGeocode(coords: Coordinates): Promise<string> {
    this.assertValid(coords);
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  }

  async calculateDistance(origin: Coordinates, destination: Coordinates): Promise<{ distanceKm: number }> {
    this.assertValid(origin);
    this.assertValid(destination);
    const straightLineKm = haversineKm(
      { lat: origin.latitude, lng: origin.longitude },
      { lat: destination.latitude, lng: destination.longitude },
    );
    return { distanceKm: Number((straightLineKm * ROAD_DISTANCE_FACTOR).toFixed(2)) };
  }

  async calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteResult> {
    const { distanceKm } = await this.calculateDistance(origin, destination);
    const durationMinutes = this.estimateDuration(distanceKm);
    return { distanceKm, durationMinutes, polyline: null, steps: [] };
  }

  async calculateETA(origin: Coordinates, destination: Coordinates): Promise<ETAResult> {
    const { distanceKm } = await this.calculateDistance(origin, destination);
    return { etaMinutes: this.estimateDuration(distanceKm), distanceKm };
  }

  validateCoordinates(coords: Coordinates): boolean {
    return (
      Number.isFinite(coords.latitude) &&
      Number.isFinite(coords.longitude) &&
      coords.latitude >= -90 &&
      coords.latitude <= 90 &&
      coords.longitude >= -180 &&
      coords.longitude <= 180
    );
  }

  private assertValid(coords: Coordinates) {
    if (!this.validateCoordinates(coords)) {
      throw new MapProviderError('INVALID_COORDINATES', `Invalid coordinates: ${JSON.stringify(coords)}`);
    }
  }

  private estimateDuration(distanceKm: number): number {
    return Math.max(MIN_DURATION_MINUTES, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }
}
