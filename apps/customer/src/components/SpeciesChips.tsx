import HorizontalChipRow from './HorizontalChipRow';

const SPECIES_ICONS: Record<string, string> = {
  dog: '🐶',
  cat: '🐱',
  bird: '🦜',
  fish: '🐠',
  rabbit: '🐰',
  rodent: '🐹',
  reptile: '🦎',
  other: '🐾',
};

export interface Species {
  id: string;
  name: string;
  slug: string;
}

export default function SpeciesChips({
  species,
  active,
  onSelect,
}: {
  species: Species[];
  active: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <HorizontalChipRow>
      <button className={`bingo-chip${active === '' ? ' active' : ''}`} onClick={() => onSelect('')}>
        Todos
      </button>
      {species.map((s) => (
        <button
          key={s.id}
          className={`bingo-chip${active === s.slug ? ' active' : ''}`}
          onClick={() => onSelect(s.slug)}
        >
          {SPECIES_ICONS[s.slug] ?? '🐾'} {s.name}
        </button>
      ))}
    </HorizontalChipRow>
  );
}
