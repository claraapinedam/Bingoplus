'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { ApiError, uploadFile } from '@/lib/api';

export interface RiderApplyValues {
  birthDate: string;
  nationalIdNumber: string;
  phone: string;
  address: string;
  city: string;
  idPhotoFrontUrl: string;
  idPhotoBackUrl: string;
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

function PhotoField({
  label,
  value,
  onUploaded,
}: {
  label: string;
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
  const [birthDate, setBirthDate] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [idPhotoFrontUrl, setIdPhotoFrontUrl] = useState('');
  const [idPhotoBackUrl, setIdPhotoBackUrl] = useState('');
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

  const plateRequired = vehicleType != null && PLATE_REQUIRED.includes(vehicleType);
  const payoutValid =
    payoutMethod === 'BANK_ACCOUNT'
      ? bankName.trim() !== '' && accountType != null && accountNumber.trim() !== ''
      : payoutMethod === 'MOBILE_WALLET'
        ? walletProvider.trim() !== '' && walletNumber.trim() !== ''
        : false;

  const isValid =
    birthDate !== '' &&
    nationalIdNumber.trim() !== '' &&
    phone.trim() !== '' &&
    address.trim() !== '' &&
    city.trim() !== '' &&
    idPhotoFrontUrl !== '' &&
    idPhotoBackUrl !== '' &&
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
    if (!isValid || !vehicleType || !payoutMethod) return;
    onSubmit({
      birthDate,
      nationalIdNumber,
      phone,
      address,
      city,
      idPhotoFrontUrl,
      idPhotoBackUrl,
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
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Información básica</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de nacimiento *</label>
            <input className="bingo-input" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Número de cédula / identificación *</label>
            <input className="bingo-input" required value={nationalIdNumber} onChange={(e) => setNationalIdNumber(e.target.value)} />
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
            <input className="bingo-input" required value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Ciudad *</label>
            <input className="bingo-input" required value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Foto de tu identificación</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PhotoField label="Foto — parte delantera" value={idPhotoFrontUrl} onUploaded={setIdPhotoFrontUrl} />
          <PhotoField label="Foto — parte trasera" value={idPhotoBackUrl} onUploaded={setIdPhotoBackUrl} />
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
          <span>He leído y acepto los Términos y Condiciones *</span>
        </label>
        <details style={{ fontSize: 12, color: '#7f8ea3', marginLeft: 26 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--bingo-teal)' }}>Ver Términos y Condiciones</summary>
          <p>
            Al enviar tu solicitud como rider de BINGO+, aceptas que tu cuenta quedará sujeta a revisión y aprobación del
            equipo de BINGO+ antes de poder recibir entregas. Debes mantener actualizada tu información personal, de
            contacto y de vehículo, y cumplir con las entregas aceptadas dentro de tiempos razonables. BINGO+ puede
            suspender o rechazar tu cuenta ante información falsa, incumplimientos reiterados o inactividad prolongada.
          </p>
        </details>

        <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={dataConsentAccepted}
            onChange={(e) => setDataConsentAccepted(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>He aceptado el tratamiento de mis datos personales *</span>
        </label>
        <details style={{ fontSize: 12, color: '#7f8ea3', marginLeft: 26 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--bingo-teal)' }}>Ver Política de Tratamiento de Datos</summary>
          <p>
            Usamos los datos de esta solicitud (información personal, de contacto, fotos de identificación, vehículo e
            información de pago) para verificar tu identidad, evaluar tu solicitud, operar tu cuenta de rider y procesar
            el pago de tus entregas completadas. No compartimos tus datos con terceros salvo lo necesario para procesar
            pagos o cumplir con la ley. Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a
            soporte@bingoplus.com.
          </p>
        </details>
      </section>

      <button className="bingo-button" type="submit" disabled={submitting || !isValid}>
        {submitting ? 'Enviando solicitud…' : 'Enviar solicitud'}
      </button>
    </form>
  );
}
