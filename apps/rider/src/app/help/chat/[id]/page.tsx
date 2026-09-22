'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import { apiFetch, ApiError } from '@/lib/api';

// Short-polling, not a WebSocket — see apps/api's SupportChatsService header comment: this
// codebase's one real-time channel (DeliveryGateway) is single-purpose for live tracking, so a
// second bidirectional multi-app chat transport was deliberately not built for this feature.
const POLL_INTERVAL_MS = 4000;

interface ChatMessage {
  id: string;
  senderType: 'CUSTOMER' | 'BUSINESS' | 'RIDER' | 'ADMIN';
  text: string;
  createdAt: string;
}

interface Chat {
  id: string;
  status: 'OPEN' | 'CLOSED';
  ratingScore: number | null;
}

function Stars({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: readOnly ? 'default' : 'pointer', fontSize: 22, color: n <= value ? 'var(--bingo-warning, #f5a623)' : '#e0e4ea' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function SupportChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [rateBusy, setRateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const fresh = await apiFetch<ChatMessage[]>(
        `/me/support/chats/${params.id}/messages${cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : ''}`,
      );
      if (fresh.length > 0) {
        cursorRef.current = fresh[fresh.length - 1].createdAt;
        setMessages((prev) => [...prev, ...fresh]);
      }
    } catch {
      // A single missed poll isn't worth surfacing.
    }
  }, [params.id]);

  useEffect(() => {
    apiFetch<Chat>(`/me/support/chats/${params.id}`).then(setChat).catch(() => setChat(null));
    poll();
  }, [params.id, poll]);

  useEffect(() => {
    if (chat?.status !== 'OPEN') return;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [chat, poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/me/support/chats/${params.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
      setText('');
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  async function endChat() {
    if (ratingScore === 0) {
      setError('Elige una calificación antes de terminar el chat.');
      return;
    }
    setRateBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Chat>(`/me/support/chats/${params.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ score: ratingScore, comment: ratingComment || undefined }),
      });
      setChat(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo terminar el chat.');
    } finally {
      setRateBusy(false);
    }
  }

  if (chat === undefined) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </RiderShell>
    );
  }
  if (!chat) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <div className="bingo-error-banner">No encontramos este chat.</div>
        </div>
      </RiderShell>
    );
  }

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Chat de soporte</div>
      </header>

      <div className="bingo-content">
        <div className="bingo-card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 13, color: '#7f8ea3' }}>Un agente se unirá pronto. Escribe tu mensaje cuando quieras.</div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.senderType === 'ADMIN' ? 'flex-start' : 'flex-end',
                background: m.senderType === 'ADMIN' ? '#f2f4f7' : 'var(--bingo-teal)',
                color: m.senderType === 'ADMIN' ? 'var(--bingo-navy)' : 'white',
                borderRadius: 12,
                padding: '8px 12px',
                maxWidth: '80%',
                fontSize: 13,
              }}
            >
              {m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        {chat.status === 'OPEN' ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="bingo-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Escribe un mensaje…"
                disabled={sending}
              />
              <button className="bingo-button" style={{ width: 'auto', padding: '0 16px' }} onClick={send} disabled={sending}>
                Enviar
              </button>
            </div>

            <div className="bingo-card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>¿Ya resolviste tu problema? Termina el chat y califica la atención</div>
              <Stars value={ratingScore} onChange={setRatingScore} />
              <textarea
                className="bingo-input"
                style={{ marginTop: 8 }}
                placeholder="Comentario (opcional)"
                rows={2}
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
              />
              <button className="bingo-button secondary" style={{ marginTop: 8 }} onClick={endChat} disabled={rateBusy}>
                {rateBusy ? 'Enviando…' : 'Terminar chat y calificar'}
              </button>
            </div>
          </>
        ) : (
          <div className="bingo-card" style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800 }}>Este chat terminó</div>
            {chat.ratingScore != null && (
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                <Stars value={chat.ratingScore} readOnly />
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => router.push('/help')}
        style={{ display: 'block', margin: '16px auto', background: 'none', border: 'none', color: 'var(--bingo-teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >
        ← Volver a Ayuda
      </button>
    </RiderShell>
  );
}
