'use client';

import { useEffect, useMemo, useRef } from 'react';
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  /** Only meaningful for the `rider` marker — picks bike/motorcycle/car glyph; anything else falls
   * back to a generic pin. */
  vehicleType?: string | null;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface MapViewProps {
  pickup?: MapPoint | null;
  destination?: MapPoint | null;
  rider?: MapPoint | null;
  /** Google-encoded polyline string, as returned by the backend's MapService route calculation. */
  routePolyline?: string | null;
  /** A decoded path (e.g. from a live, browser-side DirectionsService call) — takes priority over
   * `routePolyline` when both are given, since it's meant to be the more current one. */
  routePath?: LatLng[] | null;
  height?: number;
}

const NAVY = '#172b4d';
const CORAL = '#ff6b5e';
const TEAL = '#16a085';

/** A 16x16 glyph (white fill/stroke) badged onto a 36x36 colored circle pin — built as inline SVG
 * data URIs instead of pulling in an icon font/library, so there's no extra asset request and the
 * pin color can double as the glyph's "cutout" color for a flat two-tone look. */
function badgeIcon(glyph: string, bg: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">` +
    `<circle cx="18" cy="18" r="17" fill="${bg}" stroke="white" stroke-width="2"/>` +
    `<g transform="translate(10,10)">${glyph}</g>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

const STORE_ICON = badgeIcon(
  `<rect x="1" y="3" width="14" height="3" fill="white"/><rect x="2" y="6" width="12" height="8" fill="white"/><rect x="6" y="9" width="4" height="5" fill="${NAVY}"/>`,
  NAVY,
);

const HOUSE_ICON = badgeIcon(
  `<polygon points="8,1 15,8 1,8" fill="white"/><rect x="3" y="8" width="10" height="6" fill="white"/><rect x="6.5" y="10" width="3" height="4" fill="${CORAL}"/>`,
  CORAL,
);

const BIKE_ICON = badgeIcon(
  `<circle cx="4" cy="12" r="2.6" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<circle cx="12" cy="12" r="2.6" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<path d="M4 12 L7 5.5 L10 5.5 L12 12 M7 5.5 L9.5 9.5" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  TEAL,
);

const MOTORCYCLE_ICON = badgeIcon(
  `<circle cx="4" cy="12.5" r="2.3" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<circle cx="12" cy="12.5" r="2.3" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<path d="M4 12.5 L6 8.5 L10.5 8.5 L12 12.5" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="6" y="6.5" width="4" height="2" rx="0.5" fill="white"/>`,
  TEAL,
);

const CAR_ICON = badgeIcon(
  `<path d="M3 12 L4 7.5 L12 7.5 L13 12 Z" fill="white"/><rect x="2" y="10.5" width="12" height="3.5" rx="1" fill="white"/>` +
    `<circle cx="5" cy="14" r="1.4" fill="${TEAL}" stroke="white" stroke-width="0.8"/>` +
    `<circle cx="11" cy="14" r="1.4" fill="${TEAL}" stroke="white" stroke-width="0.8"/>`,
  TEAL,
);

const PERSON_ICON = badgeIcon(
  `<circle cx="8" cy="4.5" r="2.2" fill="white"/><path d="M3.5 14 Q3.5 8.5 8 8.5 Q12.5 8.5 12.5 14 Z" fill="white"/>`,
  TEAL,
);

function riderIcon(vehicleType?: string | null) {
  switch (vehicleType) {
    case 'BIKE':
      return BIKE_ICON;
    case 'MOTORCYCLE':
      return MOTORCYCLE_ICON;
    case 'CAR':
      return CAR_ICON;
    default:
      return PERSON_ICON;
  }
}

export default function MapView({ pickup, destination, rider, routePolyline, routePath: liveRoutePath, height = 220 }: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const mapRef = useRef<google.maps.Map | null>(null);

  const points = [pickup, destination, rider].filter((p): p is MapPoint => !!p);

  const decodedRoutePath = useMemo(() => {
    if (!isLoaded || !routePolyline) return null;
    try {
      return google.maps.geometry.encoding.decodePath(routePolyline);
    } catch {
      return null;
    }
  }, [isLoaded, routePolyline]);

  const routePath = liveRoutePath && liveRoutePath.length > 0 ? liveRoutePath : decodedRoutePath;

  useEffect(() => {
    if (!mapRef.current) return;
    if (routePath && routePath.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      routePath.forEach((p) => bounds.extend(p));
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(bounds, 48);
      return;
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      mapRef.current.panTo({ lat: points[0].lat, lng: points[0].lng });
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, rider?.lat, rider?.lng, routePath]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="rider-map-placeholder" style={{ height }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>Mapa no configurado</div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rider-map-placeholder" style={{ height }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>No se pudo cargar el mapa</div>
      </div>
    );
  }
  if (!isLoaded || points.length === 0) {
    return (
      <div className="rider-map-placeholder" style={{ height }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>Cargando mapa…</div>
      </div>
    );
  }

  const iconLayout = { scaledSize: new google.maps.Size(36, 36), anchor: new google.maps.Point(18, 18) };

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        onUnmount={() => {
          mapRef.current = null;
        }}
        center={{ lat: points[0].lat, lng: points[0].lng }}
        zoom={14}
        options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' }}
      >
        {routePath && <PolylineF path={routePath} options={{ strokeColor: '#16a085', strokeWeight: 4, strokeOpacity: 0.85 }} />}
        {pickup && (
          <MarkerF position={{ lat: pickup.lat, lng: pickup.lng }} title={pickup.label ?? 'Negocio'} icon={{ url: STORE_ICON, ...iconLayout }} />
        )}
        {destination && (
          <MarkerF
            position={{ lat: destination.lat, lng: destination.lng }}
            title={destination.label ?? 'Destino'}
            icon={{ url: HOUSE_ICON, ...iconLayout }}
          />
        )}
        {rider && (
          <MarkerF
            position={{ lat: rider.lat, lng: rider.lng }}
            title="Repartidor"
            icon={{ url: riderIcon(rider.vehicleType), ...iconLayout }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
