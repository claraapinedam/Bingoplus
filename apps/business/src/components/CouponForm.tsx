'use client';

import { FormEvent, useState } from 'react';

export interface CouponFormValues {
  code: string;
  title: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minimumPurchase: number | undefined;
  maximumDiscount: number | undefined;
  startDate: string;
  expirationDate: string;
  usageLimit: number | undefined;
  usagePerCustomer: number | undefined;
  termsAndConditions: string;
}

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : '';
}

export default function CouponForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<CouponFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: CouponFormValues) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>(initial?.discountType ?? 'PERCENTAGE');
  const [discountValue, setDiscountValue] = useState(initial?.discountValue?.toString() ?? '');
  const [minimumPurchase, setMinimumPurchase] = useState(initial?.minimumPurchase?.toString() ?? '');
  const [maximumDiscount, setMaximumDiscount] = useState(initial?.maximumDiscount?.toString() ?? '');
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate));
  const [expirationDate, setExpirationDate] = useState(toDateInput(initial?.expirationDate));
  const [usageLimit, setUsageLimit] = useState(initial?.usageLimit?.toString() ?? '');
  const [usagePerCustomer, setUsagePerCustomer] = useState(initial?.usagePerCustomer?.toString() ?? '');
  const [termsAndConditions, setTermsAndConditions] = useState(initial?.termsAndConditions ?? '');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      code: code.toUpperCase(),
      title,
      description,
      discountType,
      discountValue: Number(discountValue),
      minimumPurchase: minimumPurchase ? Number(minimumPurchase) : undefined,
      maximumDiscount: maximumDiscount ? Number(maximumDiscount) : undefined,
      startDate: new Date(startDate).toISOString(),
      expirationDate: new Date(expirationDate).toISOString(),
      usageLimit: usageLimit ? Number(usageLimit) : undefined,
      usagePerCustomer: usagePerCustomer ? Number(usagePerCustomer) : undefined,
      termsAndConditions,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Código</label>
          <input className="bingo-input" required value={code} onChange={(e) => setCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Título</label>
          <input className="bingo-input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción (opcional)</label>
        <textarea className="bingo-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tipo de descuento</label>
          <select className="bingo-input" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}>
            <option value="PERCENTAGE">Porcentaje (%)</option>
            <option value="FIXED_AMOUNT">Monto fijo ($)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Valor del descuento</label>
          <input className="bingo-input" type="number" min={0} step="0.01" required value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Compra mínima (opcional)</label>
          <input className="bingo-input" type="number" min={0} step="0.01" value={minimumPurchase} onChange={(e) => setMinimumPurchase(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descuento máximo (opcional)</label>
          <input className="bingo-input" type="number" min={0} step="0.01" value={maximumDiscount} onChange={(e) => setMaximumDiscount(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de inicio</label>
          <input className="bingo-input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de expiración</label>
          <input className="bingo-input" type="date" required value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Límite de usos totales (opcional)</label>
          <input className="bingo-input" type="number" min={1} step="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Límite por cliente (opcional)</label>
          <input className="bingo-input" type="number" min={1} step="1" value={usagePerCustomer} onChange={(e) => setUsagePerCustomer(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Términos y condiciones (opcional)</label>
        <textarea className="bingo-input" rows={2} value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} />
      </div>

      <button className="bingo-button" type="submit" disabled={submitting} style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}>
        {submitting ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
