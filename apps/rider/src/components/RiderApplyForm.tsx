'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { ApiError, apiFetch, uploadFile } from '@/lib/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';
import { ECUADOR_CITIES } from '@/lib/ecuadorProvinces';
import SearchableSelect from './SearchableSelect';
import TermsModal, { RIDER_PRIVACY_SECTIONS, RIDER_TERMS_SECTIONS } from './TermsModal';

const MINIMUM_RIDER_AGE = 18;

export interface RiderApplyValues {
  birthDate: string;
  idType: 'RUC' | 'CEDULA';
  legalName?: string;
  nationalIdNumber: string;
  phone: string;
  address: string;
  city: string;
  idPhotoFrontUrl: string;
  idPhotoBackUrl: string;
  selfiePhotoUrl: string;
  vehicleType: 'BIKE' | 'MOTORCYCLE' | 'CAR';
  plate?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: number;
  payoutMethod: 'BANK_ACCOUNT' | 'MOBILE_WALLET';
  bankName?: string;
  accountType?: 'SAVINGS' | 'CHECKING';
  accountNumber?: string;
  walletProvider?: string;
  walletNumber?: string;
  accountHolderName: string;
  holderDocumentNumber: string;
  termsAccepted: boolean;
  dataConsentAccepted: boolean;
}

const VEHICLE_OPTIONS: { value: RiderApplyValues['vehicleType']; label: string; icon: string }[] = [
  { value: 'BIKE', label: 'Bicicleta', icon: '🚲' },
  { value: 'MOTORCYCLE', label: 'Moto', icon: '🛵' },
  { value: 'CAR', label: 'Auto', icon: '🚗' },
];

const PLATE_REQUIRED: RiderApplyValues['vehicleType'][] = ['MOTORCYCLE', 'CAR'];

const PAYOUT_OPTIONS: { value: RiderApplyValues['payoutMethod']; label: string }[] = [
  { value: 'BANK_ACCOUNT', label: 'Cuenta bancaria' },
  { value: 'MOBILE_WALLET', label: 'Billetera móvil' },
];

const ACCOUNT_TYPE_OPTIONS: { value: NonNullable<RiderApplyValues['accountType']>; label: string }[] = [
  { value: 'SAVINGS', label: 'Ahorros' },
  { value: 'CHECKING', label: 'Corriente' },
];

function normalizeCityName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function PhotoField({
  label,
  hint,
  value,
  onUploaded,
}: {
  label: string;
  hint?: string;
  value: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto.');
      onUploaded('');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>{label} *</label>
      {hint && <p style={{ fontSize: 11, color: '#7f8ea3', margin: '0 0 6px' }}>{hint}</p>}
      <div
        style={{
          border: '1px dashed #cfd6e0',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
        )}
        <div style={{ flex: 1 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} style={{ fontSize: 12 }} />
          {uploading && <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 4 }}>Subiendo…</div>}
          {!uploading && value && <div style={{ fontSize: 11, color: 'var(--bingo-success)', marginTop: 4 }}>✓ Foto lista</div>}
          {error && <div style={{ fontSize: 11, color: 'var(--bingo-error)', marginTop: 4 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function RiderApplyForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: RiderApplyValues) => void;
}) {
  const [idType, setIdType] = useState<'RUC' | 'CEDULA' | null>(null);
  // The caller's own account name — read-only everywhere in this form, never an editable field,
  // regardless of idType. Only RUC additionally asks for a separate, editable razón social.
  const [meName, setMeName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [idPhotoFrontUrl, setIdPhotoFrontUrl] = useState('');
  const [idPhotoBackUrl, setIdPhotoBackUrl] = useState('');
  const [selfiePhotoUrl, setSelfiePhotoUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  // Only used as a "did we get a real geocoded match" signal for the UX hint below — the backend
  // doesn't take address coordinates for riders (unlike Business), so this is never submitted.
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [city, setCity] = useState('');
  const [vehicleType, setVehicleType] = useState<RiderApplyValues['vehicleType'] | null>(null);
  const [plate, setPlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<RiderApplyValues['payoutMethod'] | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<RiderApplyValues['accountType'] | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [walletProvider, setWalletProvider] = useState('');
  const [walletNumber, setWalletNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [holderDocumentNumber, setHolderDocumentNumber] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    apiFetch<{ firstName: string; lastName: string }>('/me')
      .then((me) => setMeName(`${me.firstName} ${me.lastName}`.trim()))
      .catch(() => undefined);
  }, []);

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

    // City is still a real picklist (ECUADOR_CITIES), never free text — this only pre-selects a
    // match from that same list using what Google resolved, it never invents an entry outside it.
    const cityFromAddress = (place.address_components ?? []).find(
      (c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2'),
    )?.long_name;
    const matched = cityFromAddress && ECUADOR_CITIES.find((c) => normalizeCityName(c) === normalizeCityName(cityFromAddress));
    if (matched) setCity(matched);
  }

  const age = birthDate ? calculateAge(new Date(birthDate), new Date()) : null;
  const ageValid = age === null || age >= MINIMUM_RIDER_AGE;

  const plateRequired = vehicleType != null && PLATE_REQUIRED.includes(vehicleType);
  const payoutValid =
    payoutMethod === 'BANK_ACCOUNT'
      ? bankName.trim() !== '' && accountType != null && accountNumber.trim() !== ''
      : payoutMethod === 'MOBILE_WALLET'
        ? walletProvider.trim() !== '' && walletNumber.trim() !== ''
        : false;

  const isValid =
    idType !== null &&
    (idType !== 'RUC' || legalName.trim() !== '') &&
    birthDate !== '' &&
    ageValid &&
    nationalIdNumber.trim() !== '' &&
    idPhotoFrontUrl !== '' &&
    idPhotoBackUrl !== '' &&
    selfiePhotoUrl !== '' &&
    phone.trim() !== '' &&
    address.trim() !== '' &&
    city.trim() !== '' &&
    vehicleType != null &&
    (!plateRequired || plate.trim() !== '') &&
    payoutMethod != null &&
    payoutValid &&
    accountHolderName.trim() !== '' &&
    holderDocumentNumber.trim() !== '' &&
    termsAccepted &&
    dataConsentAccepted;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !idType || !vehicleType || !payoutMethod) return;
    onSubmit({
      birthDate,
      idType,
      legalName: idType === 'RUC' ? legalName : undefined,
      nationalIdNumber,
      phone,
      address,
      city,
      idPhotoFrontUrl,
      idPhotoBackUrl,
      selfiePhotoUrl,
      vehicleType,
      plate: plateRequired ? plate : undefined,
      vehicleBrand: vehicleBrand || undefined,
      vehicleModel: vehicleModel || undefined,
      vehicleColor: vehicleColor || undefined,
      vehicleYear: vehicleYear ? Number(vehicleYear) : undefined,
      payoutMethod,
      bankName: payoutMethod === 'BANK_ACCOUNT' ? bankName : undefined,
      accountType: payoutMethod === 'BANK_ACCOUNT' ? accountType ?? undefined : undefined,
      accountNumber: payoutMethod === 'BANK_ACCOUNT' ? accountNumber : undefined,
      walletProvider: payoutMethod === 'MOBILE_WALLET' ? walletProvider : undefined,
      walletNumber: payoutMethod === 'MOBILE_WALLET' ? walletNumber : undefined,
      accountHolderName,
      holderDocumentNumber,
      termsAccepted,
      dataConsentAccepted,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Identificación</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>¿Con qué te identificas? *</label>
            <div className="bingo-chip-row">
              <button type="button" className={`bingo-chip${idType === 'RUC' ? ' active' : ''}`} onClick={() => setIdType('RUC')}>
                RUC
              </button>
              <button type="button" className={`bingo-chip${idType === 'CEDULA' ? ' active' : ''}`} onClick={() => setIdType('CEDULA')}>
                Cédula
              </button>
            </div>
          </div>

          {idType && (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre y apellido</label>
                <input className="bingo-input" value={meName} disabled style={{ background: '#f2f4f7', color: '#7f8ea3' }} />
              </div>

              {idType === 'RUC' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Razón social *</label>
                  <input className="bingo-input" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {idType === 'RUC' ? 'RUC *' : 'Cédula *'}
                </label>
                <input className="bingo-input" required value={nationalIdNumber} onChange={(e) => setNationalIdNumber(e.target.value)} />
              </div>
            </>
          )}

          <PhotoField label="Foto de identificación — parte delantera" value={idPhotoFrontUrl} onUploaded={setIdPhotoFrontUrl} />
          <PhotoField label="Foto de identificación — parte trasera" value={idPhotoBackUrl} onUploaded={setIdPhotoBackUrl} />
          <PhotoField
            label="Selfie"
            hint="Tómate una foto tipo selfie con fondo blanco, sin gorra ni lentes de sol."
            value={selfiePhotoUrl}
            onUploaded={setSelfiePhotoUrl}
          />

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de nacimiento *</label>
            <input className="bingo-input" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            {!ageValid && (
              <div style={{ fontSize: 11, color: 'var(--bingo-error)', marginTop: 4 }}>
                Debes ser mayor de {MINIMUM_RIDER_AGE} años para aplicar como rider.
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Información de contacto</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Teléfono *</label>
            <input className="bingo-input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
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
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setLatitude(undefined);
                  }}
                />
              </Autocomplete>
            ) : (
              <input className="bingo-input" required value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ fontSize: 11, color: latitude != null ? 'var(--bingo-success)' : '#9aa5b1', marginTop: 4 }}>
              {latitude != null ? '📍 Ubicación exacta guardada' : 'Elige una sugerencia de la lista'}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Ciudad *</label>
            <SearchableSelect value={city} onChange={setCity} options={ECUADOR_CITIES} placeholder="Busca tu ciudad…" required />
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Vehículo</h3>
        <div className="bingo-chip-row" style={{ marginBottom: 10 }}>
          {VEHICLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`bingo-chip${vehicleType === opt.value ? ' active' : ''}`}
              onClick={() => setVehicleType(opt.value)}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
        {vehicleType && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plateRequired && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Placa *</label>
                <input className="bingo-input" required value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="bingo-input" placeholder="Marca (opcional)" value={vehicleBrand} onChange={(e) => setVehicleBrand(e.target.value)} />
              <input className="bingo-input" placeholder="Modelo (opcional)" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="bingo-input" placeholder="Color (opcional)" value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} />
              <input
                className="bingo-input"
                type="number"
                placeholder="Año (opcional)"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Información de pago</h3>
        <div className="bingo-chip-row" style={{ marginBottom: 10 }}>
          {PAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`bingo-chip${payoutMethod === opt.value ? ' active' : ''}`}
              onClick={() => setPayoutMethod(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {payoutMethod === 'BANK_ACCOUNT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            <input className="bingo-input" placeholder="Banco *" required value={bankName} onChange={(e) => setBankName(e.target.value)} />
            <div className="bingo-chip-row">
              {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`bingo-chip${accountType === opt.value ? ' active' : ''}`}
                  onClick={() => setAccountType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              className="bingo-input"
              placeholder="Número de cuenta *"
              required
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>
        )}

        {payoutMethod === 'MOBILE_WALLET' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            <input
              className="bingo-input"
              placeholder="Proveedor de billetera (ej. Payphone) *"
              required
              value={walletProvider}
              onChange={(e) => setWalletProvider(e.target.value)}
            />
            <input
              className="bingo-input"
              placeholder="Número de billetera *"
              required
              value={walletNumber}
              onChange={(e) => setWalletNumber(e.target.value)}
            />
          </div>
        )}

        {payoutMethod && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="bingo-input"
              placeholder="Nombre del titular de la cuenta *"
              required
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
            <input
              className="bingo-input"
              placeholder="Cédula del titular *"
              required
              value={holderDocumentNumber}
              onChange={(e) => setHolderDocumentNumber(e.target.value)}
            />
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} style={{ marginTop: 2 }} />
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
            checked={dataConsentAccepted}
            onChange={(e) => setDataConsentAccepted(e.target.checked)}
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
      </section>

      {showTerms && <TermsModal title="Términos y Condiciones" sections={RIDER_TERMS_SECTIONS} onClose={() => setShowTerms(false)} />}
      {showPrivacy && <TermsModal title="Tratamiento de Datos Personales" sections={RIDER_PRIVACY_SECTIONS} onClose={() => setShowPrivacy(false)} />}

      <button className="bingo-button" type="submit" disabled={submitting || !isValid}>
        {submitting ? 'Enviando solicitud…' : 'Enviar solicitud'}
      </button>
    </form>
  );
}
