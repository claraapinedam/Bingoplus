'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface PetSpecies {
  id: string;
  name: string;
  slug: string;
}

interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
}

export default function PetsPage() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [speciesOptions, setSpeciesOptions] = useState<PetSpecies[]>([]);
  const [showAddPet, setShowAddPet] = useState(false);
  const [petName, setPetName] = useState('');
  const [petSpeciesSlug, setPetSpeciesSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPets = useCallback(() => {
    apiFetch<Pet[]>('/me/pets').then(setPets).catch(() => setPets([]));
  }, []);

  useEffect(() => {
    apiFetch<PetSpecies[]>('/public/pet-species').then((options) => {
      setSpeciesOptions(options);
      setPetSpeciesSlug((current) => current || options[0]?.slug || '');
    });
    loadPets();
  }, [loadPets]);

  async function addPet(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/me/pets', {
        method: 'POST',
        body: JSON.stringify({ name: petName, speciesSlug: petSpeciesSlug }),
      });
      setPetName('');
      setShowAddPet(false);
      loadPets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar la mascota.');
    } finally {
      setSaving(false);
    }
  }

  async function removePet(id: string) {
    await apiFetch(`/me/pets/${id}`, { method: 'DELETE' }).catch(() => undefined);
    loadPets();
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Mis mascotas</div>
      </header>

      <div className="bingo-content">
        <p style={{ fontSize: 12, color: '#7f8ea3', marginTop: -8, marginBottom: 12 }}>
          Usamos las especies de tus mascotas para recomendarte tiendas relevantes.
        </p>

        {pets === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : pets.length === 0 && !showAddPet ? (
          <EmptyState title="Aún no has agregado ninguna mascota" />
        ) : (
          pets?.map((pet) => (
            <div
              key={pet.id}
              className="bingo-card"
              style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{pet.name}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3' }}>
                  {pet.species.name}
                  {pet.breed ? ` · ${pet.breed}` : ''}
                </div>
              </div>
              <button className="bingo-button secondary small" onClick={() => removePet(pet.id)}>
                Eliminar
              </button>
            </div>
          ))
        )}

        {showAddPet ? (
          <form onSubmit={addPet} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <input
              className="bingo-input"
              placeholder="Nombre"
              required
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
            />
            <select
              className="bingo-input"
              required
              value={petSpeciesSlug}
              onChange={(e) => setPetSpeciesSlug(e.target.value)}
            >
              {speciesOptions.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
            {error && <div className="bingo-error-banner">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="bingo-button" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button className="bingo-button secondary" type="button" onClick={() => setShowAddPet(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button className="bingo-button secondary" style={{ marginTop: 8 }} onClick={() => setShowAddPet(true)}>
            + Agregar mascota
          </button>
        )}
      </div>
    </CustomerShell>
  );
}
