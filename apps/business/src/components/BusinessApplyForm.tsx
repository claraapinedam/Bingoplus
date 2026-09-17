'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { apiFetch } from '@/lib/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';
import TermsModal, { BUSINESS_TERMS_SECTIONS, PRIVACY_TERMS_SECTIONS } from './TermsModal';
import EmailField, { isValidEmail } from './EmailField';

export interface BusinessApplyValues {
  tradeName: string;
  legalName: string;
  taxId: string;
  email: string;
  phone: string;
  categorySlug: string;
  speciesSlugs: string[];
  description: string;
  addressLine: string;
  city: string;
  latitude: number | undefined;
  longitude: number | undefined;
  sellsProducts: boolean;
  pickupEnabled: boolean | undefined;
  deliveryEnabled: boolean | undefined;
  directoryListing: boolean;
  membershipPlanId: string | undefined;
  couponCode: string | undefined;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PetSpeciesOption {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  currency: string;
  billingFrequency: 'MONTHLY' | 'YEARLY';
  trialDays: number;
  isDefault: boolean;
}

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

type BusinessGoal = 'PRODUCTS' | 'DIRECTORY' | 'BOTH';

const GOAL_OPTIONS: { value: BusinessGoal; label: string }[] = [
  { value: 'PRODUCTS', label: 'Vender productos' },
  { value: 'DIRECTORY', label: 'Aparecer en el directorio' },
  { value: 'BOTH', label: 'Ambos' },
];

// "Tiendas"/"Delivery" are the two retail-type categories — a pure product-seller only makes
// sense as one of those. Everything else is a service-type category, meaningful only once the
// business is actually going into the Directory.
const PRODUCT_CATEGORY_SLUGS = ['tiendas', 'delivery'];

function categoriesForGoal(goal: BusinessGoal | null, categories: Category[]): Category[] {
  if (goal === 'PRODUCTS') return categories.filter((c) => PRODUCT_CATEGORY_SLUGS.includes(c.slug));
  if (goal === 'DIRECTORY') return categories.filter((c) => !PRODUCT_CATEGORY_SLUGS.includes(c.slug));
  return categories;
}

export default function BusinessApplyForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: BusinessApplyValues) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<PetSpeciesOption[]>([]);
  const [tradeName, setTradeName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [speciesSlugs, setSpeciesSlugs] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [goal, setGoal] = useState<BusinessGoal | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [membershipPlanId, setMembershipPlanId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);

  const sellsProducts = goal === 'PRODUCTS' || goal === 'BOTH';
  // Directory presence is what's monetized via membership, independent of SELLS_PRODUCTS —
  // selling products alone puts a business in "Tiendas" only (paid via commission), never the
  // Directory. Choosing the Directory, alone or together with selling products, always needs a plan.
  const wantsDirectory = goal === 'DIRECTORY' || goal === 'BOTH';
  const availableCategories = categoriesForGoal(goal, categories);

  // Every field is required except Descripción and Código de descuento — and a field that isn't
  // even visible yet (Categoría before a goal is picked, Plan when not going into the Directory)
  // can't be required either, since the user has no way to fill in something they can't see.
  const isValid =
    tradeName.trim() !== '' &&
    legalName.trim() !== '' &&
    taxId.trim() !== '' &&
    isValidEmail(email) &&
    phone.trim() !== '' &&
    addressLine.trim() !== '' &&
    city.trim() !== '' &&
    goal !== null &&
    categorySlug !== '' &&
    speciesSlugs.length > 0 &&
    (!wantsDirectory || membershipPlanId !== '') &&
    acceptedTerms &&
    acceptedPrivacy;

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handlePlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;

    setAddressLine(place.formatted_address ?? place.name ?? addressLine);
    setLatitude(place.geometry.location.lat());
    setLongitude(place.geometry.location.lng());

    // Best-effort only — never blocks manual correction of the City field.
    const cityName = (place.address_components ?? []).find(
      (c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2'),
    )?.long_name;
    if (cityName) setCity(cityName);
  }

  useEffect(() => {
    apiFetch<Category[]>('/public/business-categories').then(setCategories).catch(() => setCategories([]));
    apiFetch<PetSpeciesOption[]>('/public/pet-species').then(setSpeciesOptions).catch(() => setSpeciesOptions([]));
  }, []);

  function toggleSpecies(slug: string) {
    setSpeciesSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  // The set of valid categories changes with the goal — clear a selection that's no longer offered
  // instead of silently submitting a category that doesn't match what was chosen.
  useEffect(() => {
    if (categorySlug && !categoriesForGoal(goal, categories).some((c) => c.slug === categorySlug)) {
      setCategorySlug('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  useEffect(() => {
    if (!wantsDirectory) return;
    apiFetch<MembershipPlan[]>('/public/membership-plans').then((list) => {
      setPlans(list);
      if (!membershipPlanId) {
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) setMembershipPlanId(def.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsDirectory]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !goal) return;
    onSubmit({
      tradeName,
      legalName,
      taxId,
      email,
      phone,
      categorySlug,
      speciesSlugs,
      description,
      addressLine,
      city,
      latitude,
      longitude,
      sellsProducts,
      // Fulfillment (pickup/delivery) is configured later from Settings, not asked here — the
      // backend applies its own sensible defaults (pickup on, delivery off) when left undefined.
      pickupEnabled: undefined,
      deliveryEnabled: undefined,
      directoryListing: wantsDirectory,
      membershipPlanId: wantsDirectory ? membershipPlanId : undefined,
      couponCode: wantsDirectory && couponCode ? couponCode : undefined,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre comercial *</label>
        <input className="bingo-input" required value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Razón social *</label>
          <input className="bingo-input" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>RUC / Identificación tributaria *</label>
          <input className="bingo-input" required value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <EmailField label="Email de contacto *" email={email} onEmailChange={setEmail} variant="block" />
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Teléfono *</label>
          <input className="bingo-input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Dirección *</label>
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
                value={addressLine}
                onChange={(e) => {
                  setAddressLine(e.target.value);
                  setLatitude(undefined);
                  setLongitude(undefined);
                }}
              />
            </Autocomplete>
          ) : (
            <input className="bingo-input" required value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
          )}
          <div style={{ fontSize: 11, color: latitude != null ? 'var(--bingo-success)' : '#9aa5b1', marginTop: 4 }}>
            {latitude != null ? '📍 Ubicación exacta guardada' : 'Elige una sugerencia de la lista'}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Ciudad *</label>
          <input className="bingo-input" required value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción (opcional)</label>
        <textarea className="bingo-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>¿A qué mascotas aplica tu negocio? *</label>
        <p style={{ fontSize: 11, color: '#7f8ea3', margin: '0 0 8px' }}>
          Así podemos recomendarte a los clientes según las mascotas que tengan registradas.
        </p>
        <div className="bingo-chip-row">
          {speciesOptions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`bingo-chip${speciesSlugs.includes(s.slug) ? ' active' : ''}`}
              onClick={() => toggleSpecies(s.slug)}
            >
              {s.icon ? `${s.icon} ` : ''}
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>¿Qué quieres hacer en BINGO+? *</label>
        <div className="bingo-chip-row">
          {GOAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`bingo-chip${goal === opt.value ? ' active' : ''}`}
              onClick={() => setGoal(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {goal && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Categoría *</label>
          <select className="bingo-input" required value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
            <option value="">Elige una categoría…</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {wantsDirectory && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Elige un plan *</label>
          {plans.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9aa5b1' }}>Cargando planes…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plans.map((p) => (
                <label
                  key={p.id}
                  className="bingo-card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: membershipPlanId === p.id ? '2px solid var(--bingo-teal)' : '1px solid #e0e4ea',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="radio" checked={membershipPlanId === p.id} onChange={() => setMembershipPlanId(p.id)} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                      {p.trialDays > 0 && <div style={{ fontSize: 11, color: '#7f8ea3' }}>{p.trialDays} días de prueba gratis</div>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {currencyFormatter.format(Number(p.price))}
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa5b1' }}>/{p.billingFrequency === 'MONTHLY' ? 'mes' : 'año'}</span>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Código de descuento (opcional)</label>
            <input
              className="bingo-input"
              placeholder="Si tienes uno de BINGO+"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            He leído y acepto los{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bingo-teal)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              Términos y Condiciones
            </button>
            {' *'}
          </span>
        </label>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            He aceptado el{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bingo-teal)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              tratamiento de mis datos personales
            </button>
            {' *'}
          </span>
        </label>
      </div>

      {showTerms && <TermsModal title="Términos y Condiciones" sections={BUSINESS_TERMS_SECTIONS} onClose={() => setShowTerms(false)} />}
      {showPrivacy && <TermsModal title="Tratamiento de Datos Personales" sections={PRIVACY_TERMS_SECTIONS} onClose={() => setShowPrivacy(false)} />}

      <button
        className="bingo-button"
        type="submit"
        disabled={submitting || !isValid}
        style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}
      >
        {submitting ? 'Enviando…' : 'Enviar solicitud'}
      </button>
    </form>
  );
}
