'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const filtered = open
    ? options.filter((o) => normalize(o).includes(normalize(query)))
    : options;

  function select(option: string) {
    onChange(option);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        className="bingo-input"
        placeholder={placeholder}
        disabled={disabled}
        required={required && !value}
        value={open ? query : value}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (
        <div
          className="bingo-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            padding: 6,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9aa5b1', padding: '8px 10px' }}>Sin resultados</div>
          ) : (
            filtered.map((option, i) => (
              <div
                key={option}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(option);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: option === value ? 700 : 500,
                  cursor: 'pointer',
                  background: i === highlight ? '#f2f4f7' : 'transparent',
                  color: option === value ? 'var(--bingo-teal)' : 'var(--bingo-navy)',
                }}
              >
                {option}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
