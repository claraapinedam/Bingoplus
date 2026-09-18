'use client';

import { FormEvent, useRef, useState } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { ECUADOR_PROVINCES } from '@/lib/ecuadorProvinces';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';
import SearchableSelect from './SearchableSelect';
import HorizontalChipRow from './HorizontalChipRow';

export interface AddressFormValues {
  label: string;
  line1: string;
  line2: string;
  country: string;
  state: string;
  city: string;
  parish: string;
  notes: string;
  latitude?: number;
  longitude?: number;
}

const LABEL_PRESETS = ['Casa', 'Trabajo'];
const PROVINCES = Object.keys(ECUADOR_PROVINCES).sort((a, b) => a.localeCompare(b, 'es'));

/** Accent/case-insensitive match, since Google's address_components come back plain ("Pichincha")
 * but so does our own list — this only needs to bridge minor casing/whitespace differences. */
function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function findProvinceMatch(name: string | undefined): string | null {
  if (!name) return null;
  const target = normalize(name);
  return PROVINCES.find((p) => normalize(p) === target) ?? null;
}

function findCityMatch(province: string | null, name: string | undefined): string | null {
  if (!province || !name) return null;
  const target = normalize(name);
  const cities = ECUADOR_PROVINCES[province] ?? [];
  return cities.find((c) => normalize(c) === target) ?? null;
}

export default function AddressForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<AddressFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: AddressFormValues) => void;
}) {
  const initialIsPreset = initial?.label ? LABEL_PRESETS.includes(initial.label) : false;
  const [label, setLabel] = useState(initial?.label && initialIsPreset ? initial.label : '');
  const [customLabel, setCustomLabel] = useState(initial?.label && !initialIsPreset ? initial.label : '');
  const [usingCustomLabel, setUsingCustomLabel] = useState(!!initial?.label && !initialIsPreset);
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [line2, setLine2] = useState(initial?.line2 ?? '');
  const [state, setState] = useState(initial?.state ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [parish, setParish] = useState(initial?.parish ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [latitude, setLatitude] = useState(initial?.latitude);
  const [longitude, setLongitude] = useState(initial?.longitude);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handlePlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    setLine1(place.formatted_address ?? place.name ?? line1);
    setLatitude(place.geometry.location.lat());
    setLongitude(place.geometry.location.lng());

    const components = place.address_components ?? [];
    const provinceName = components.find((c) => c.types.includes('administrative_area_level_1'))?.long_name;
    const cityName =
      components.find((c) => c.types.includes('locality'))?.long_name ??
      components.find((c) => c.types.includes('administrative_area_level_2'))?.long_name;
    const parishName = components.find((c) => c.types.includes('administrative_area_level_3') || c.types.includes('sublocality'))?.long_name;

    // Best-effort only — Google's admin boundaries don't always line up 1:1 with INEC's official
    // cantón list, so a non-match just leaves the existing selects for the user to fill manually
    // rather than overwriting them with something wrong.
    const matchedProvince = findProvinceMatch(provinceName);
    if (matchedProvince) {
      setState(matchedProvince);
      const matchedCity = findCityMatch(matchedProvince, cityName);
      if (matchedCity) setCity(matchedCity);
    }
    if (parishName) setParish(parishName);
  }

  // Legacy/free-text data may not match the official cantón list for the chosen province —
  // keep it selectable instead of silently blanking it out.
  const cityOptions = state ? (ECUADOR_PROVINCES[state] ?? []) : [];
  const cityOptionsWithFallback = city && !cityOptions.includes(city) ? [city, ...cityOptions] : cityOptions;

  function handleStateChange(newState: string) {
    setState(newState);
    setCity('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ label: usingCustomLabel ? customLabel : label, line1, line2, country: 'EC', state, city, parish, notes, latitude, longitude });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>País</label>
        <select className="bingo-input" value="EC" disabled style={{ opacity: 0.7 }}>
          <option value="EC">Ecuador</option>
        </select>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Provincia</label>
        <SearchableSelect
          options={PROVINCES}
          value={state}
          onChange={handleStateChange}
          placeholder="Buscar provincia…"
          required
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Ciudad</label>
        <SearchableSelect
          options={cityOptionsWithFallback}
          value={city}
          onChange={setCity}
          placeholder={state ? 'Buscar ciudad…' : 'Primero elige una provincia'}
          disabled={!state}
          required
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Parroquia (opcional)
        </label>
        <input
          className="bingo-input"
          placeholder="Ej. Cumbayá, Tarqui…"
          value={parish}
          onChange={(e) => setParish(e.target.value)}
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Dirección</label>
        {mapsLoaded ? (
          <Autocomplete
            onLoad={(ac) => {
              autocompleteRef.current = ac;
            }}
            onPlaceChanged={handlePlaceChanged}
            options={{ componentRestrictions: { country: 'ec' }, fields: ['formatted_address', 'name', 'geometry', 'address_components'] }}
          >
            <input
              className="bingo-input"
              placeholder="Busca tu dirección…"
              required
              value={line1}
              onChange={(e) => {
                setLine1(e.target.value);
                setLatitude(undefined);
                setLongitude(undefined);
              }}
            />
          </Autocomplete>
        ) : (
          <input
            className="bingo-input"
            placeholder="Calle y número"
            required
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
          />
        )}
        <div style={{ fontSize: 11, color: latitude != null ? 'var(--bingo-success)' : '#9aa5b1', marginTop: 4 }}>
          {latitude != null ? '📍 Ubicación exacta guardada' : 'Elige una sugerencia de la lista para guardar la ubicación exacta'}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Piso / Apartamento / Referencia secundaria (opcional)
        </label>
        <input
          className="bingo-input"
          placeholder="Ej. Depto 6, calle secundaria…"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Referencias / Indicaciones para la entrega
        </label>
        <textarea
          className="bingo-input"
          rows={3}
          maxLength={100}
          placeholder="Ej: casa blanca con rejas, junto a la tienda…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div style={{ fontSize: 11, color: '#9aa5b1', textAlign: 'right', marginTop: 2 }}>{notes.length}/100</div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
          ¿Qué nombre le damos a esta dirección?
        </label>
        <HorizontalChipRow>
          {LABEL_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`bingo-chip${!usingCustomLabel && label === preset ? ' active' : ''}`}
              onClick={() => {
                setUsingCustomLabel(false);
                setLabel(preset);
              }}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            className={`bingo-chip${usingCustomLabel ? ' active' : ''}`}
            onClick={() => setUsingCustomLabel(true)}
          >
            Otro
          </button>
        </HorizontalChipRow>
        {usingCustomLabel && (
          <input
            className="bingo-input"
            style={{ marginTop: 8 }}
            placeholder="Nombre de la dirección"
            required
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
          />
        )}
      </div>

      <button className="bingo-button" type="submit" disabled={submitting}>
        {submitting ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
