'use client';

import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import CustomerShell from '@/components/CustomerShell';
import { apiFetch, uploadFile, ApiError } from '@/lib/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';

type Category = 'RESTAURANT' | 'OUTDOOR_SPACE' | 'OTHER';

const CATEGORY_OPTIONS: { value: Category; label: string; icon: string }[] = [
  { value: 'RESTAURANT', label: 'Restaurante', icon: '🍽️' },
  { value: 'OUTDOOR_SPACE', label: 'Espacio al aire libre', icon: '🌳' },
  { value: 'OTHER', label: 'Otro', icon: '📍' },
];

export default function NewPetFriendlyPlacePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handlePlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;
    setAddress(place.formatted_address ?? place.name ?? address);
    setLatitude(place.geometry.location.lat());
    setLongitude(place.geometry.location.lng());
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      setPhotoUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto.');
      setPhotoUrl('');
    } finally {
      setUploading(false);
    }
  }

  const isValid = name.trim() !== '' && category != null && address.trim() !== '' && latitude != null && longitude != null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/me/pet-friendly-places', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category,
          description: description || undefined,
          address,
          latitude,
          longitude,
          photoUrl: photoUrl || undefined,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar tu lugar.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <CustomerShell>
        <div className="bingo-content" style={{ paddingTop: 30 }}>
          <div className="bingo-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <h2 style={{ margin: '0 0 8px' }}>¡Gracias!</h2>
            <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 20px' }}>
              Tu lugar fue enviado para revisión. Cuando el equipo de BINGO+ lo apruebe, aparecerá en el directorio para toda la comunidad.
            </p>
            <button className="bingo-button" onClick={() => router.push('/pet-friendly')}>
              Volver al directorio
            </button>
          </div>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <div className="bingo-content" style={{ paddingTop: 20 }}>
        <h2 style={{ margin: '0 0 4px' }}>Agregar un lugar pet friendly</h2>
        <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 20px' }}>
          Comparte un lugar donde puedas ir con tu mascota — un restaurante, un parque, o cualquier espacio que las reciba bien. Lo revisaremos antes de publicarlo.
        </p>

        {error && <div className="bingo-error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre del lugar *</label>
            <input className="bingo-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Café Huellas" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Categoría *</label>
            <div className="bingo-chip-row">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`bingo-chip${category === opt.value ? ' active' : ''}`}
                  onClick={() => setCategory(opt.value)}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Dirección *</label>
            {mapsLoaded ? (
              <Autocomplete
                onLoad={(ac) => {
                  autocompleteRef.current = ac;
                }}
                onPlaceChanged={handlePlaceChanged}
                options={{ componentRestrictions: { country: 'ec' }, fields: ['formatted_address', 'name', 'geometry'] }}
              >
                <input
                  className="bingo-input"
                  placeholder="Busca la dirección…"
                  required
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setLatitude(undefined);
                    setLongitude(undefined);
                  }}
                />
              </Autocomplete>
            ) : (
              <input className="bingo-input" required value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ fontSize: 11, color: latitude != null ? 'var(--bingo-success)' : '#9aa5b1', marginTop: 4 }}>
              {latitude != null ? '📍 Ubicación exacta guardada' : 'Elige una sugerencia de la lista para guardar la ubicación exacta'}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Foto (opcional)</label>
            <div style={{ border: '1px dashed #cfd6e0', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              {photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
              )}
              <div style={{ flex: 1 }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ fontSize: 12 }} />
                {uploading && <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 4 }}>Subiendo…</div>}
                {!uploading && photoUrl && <div style={{ fontSize: 11, color: 'var(--bingo-success)', marginTop: 4 }}>✓ Foto lista</div>}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción (opcional)</label>
            <textarea
              className="bingo-input"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cuéntanos qué hace especial a este lugar para ir con mascotas…"
            />
          </div>

          <button className="bingo-button" type="submit" disabled={submitting || !isValid}>
            {submitting ? 'Enviando…' : 'Enviar para revisión'}
          </button>
        </form>
      </div>
    </CustomerShell>
  );
}
