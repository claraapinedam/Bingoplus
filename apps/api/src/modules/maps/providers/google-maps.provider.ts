import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Coordinates, ETAResult, GeocodeResult, MapProvider, MapProviderError, RouteResult } from './map-provider.interface';

const BASE_URL = 'https://maps.googleapis.com/maps/api';

/**
 * Real Google Maps Platform provider (§40) — Geocoding, Directions and Distance Matrix APIs.
 * Selected by MapModule only when GOOGLE_MAPS_API_KEY is set and MAP_PROVIDER=google; never
 * imported directly by anything outside this module.
 */
@Injectable()
export class GoogleMapsProvider extends MapProvider {
  readonly name = 'google';

  constructor(private readonly config: ConfigService) {
    super();
  }

  private get apiKey(): string {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!key) {
      throw new MapProviderError('MAP_PROVIDER_UNAVAILABLE', 'GOOGLE_MAPS_API_KEY is not configured.');
    }
    return key;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const url = `${BASE_URL}/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`;
    const body = await this.fetchJson(url, 'GEOCODING_FAILED');
    const result = body.results?.[0];
    if (!result) {
      throw new MapProviderError('GEOCODING_FAILED', `No geocoding result for "${address}".`);
    }
    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  }

  async reverseGeocode(coords: Coordinates): Promise<string> {
    this.assertValid(coords);
    const url = `${BASE_URL}/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${this.apiKey}`;
    const body = await this.fetchJson(url, 'GEOCODING_FAILED');
    const result = body.results?.[0];
    if (!result) {
      throw new MapProviderError('GEOCODING_FAILED', `No reverse geocoding result for ${JSON.stringify(coords)}.`);
    }
    return result.formatted_address;
  }

  async calculateDistance(origin: Coordinates, destination: Coordinates): Promise<{ distanceKm: number }> {
    const { distanceKm } = await this.calculateETA(origin, destination);
    return { distanceKm };
  }

  async calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteResult> {
    this.assertValid(origin);
    this.assertValid(destination);
    const url =
      `${BASE_URL}/directions/json?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}&key=${this.apiKey}`;
    const body = await this.fetchJson(url, 'ROUTE_NOT_FOUND');
    const route = body.routes?.[0];
    const leg = route?.legs?.[0];
    if (!route || !leg) {
      throw new MapProviderError('ROUTE_NOT_FOUND', 'Directions API returned no route.');
    }
    return {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: Math.round(leg.duration.value / 60),
      polyline: route.overview_polyline?.points ?? null,
      steps: (leg.steps ?? []).map((s: { html_instructions: string }) => s.html_instructions),
    };
  }

  async calculateETA(origin: Coordinates, destination: Coordinates): Promise<ETAResult> {
    this.assertValid(origin);
    this.assertValid(destination);
    const url =
      `${BASE_URL}/distancematrix/json?origins=${origin.latitude},${origin.longitude}` +
      `&destinations=${destination.latitude},${destination.longitude}&key=${this.apiKey}`;
    const body = await this.fetchJson(url, 'ETA_UNAVAILABLE');
    const element = body.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      throw new MapProviderError('ETA_UNAVAILABLE', 'Distance Matrix API returned no usable element.');
    }
    return {
      etaMinutes: Math.round(element.duration.value / 60),
      distanceKm: element.distance.value / 1000,
    };
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

  private async fetchJson(url: string, failureCode: MapProviderError['code']): Promise<any> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new MapProviderError('MAP_PROVIDER_UNAVAILABLE', `Google Maps request failed: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new MapProviderError('MAP_PROVIDER_UNAVAILABLE', `Google Maps returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    if (body.status && body.status !== 'OK') {
      throw new MapProviderError(failureCode, `Google Maps API status "${body.status}": ${body.error_message ?? ''}`);
    }
    return body;
  }
}
