'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { connectSocket } from '@/lib/socket';

/**
 * Rider<->customer chat for an active delivery (owner request: "chat bidireccional" once a rider
 * is assigned, closed once the delivery completes). Unlike the "Soporte con un pedido" chat
 * (short-polling — see SupportChatsService's own header comment for why), this reuses the
 * DeliveryGateway `delivery:{id}` socket room the host page (tracking) already subscribes to for
 * status/location — this component only adds its own `delivery.chat.message` listener on top of
 * that existing subscription, it does not join/leave the room itself. REST GET is still the
 * source of truth for history (first load, and catch-up after a reconnect gap).
 */
interface DeliveryChatMessage {
  id: string;
  senderType: 'CUSTOMER' | 'RIDER';
  senderUserId: string;
  text: string;
  createdAt: string;
}

interface DeliveryChatProps {
  deliveryId: string;
  /** Whether the chat currently accepts new messages — false once the delivery is terminal
   * (DELIVERED/CANCELLED/FAILED). History still renders read-only either way. */
  active: boolean;
}

export default function DeliveryChat({ deliveryId, active }: DeliveryChatProps) {
  const [messages, setMessages] = useState<DeliveryChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const addMessages = useCallback((fresh: DeliveryChatMessage[]) => {
    const newOnes = fresh.filter((m) => !seenIds.current.has(m.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((m) => seenIds.current.add(m.id));
    setMessages((prev) => [...prev, ...newOnes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, []);

  useEffect(() => {
    apiFetch<DeliveryChatMessage[]>(`/deliveries/${deliveryId}/chat/messages`)
      .then(addMessages)
      .catch(() => undefined);
  }, [deliveryId, addMessages]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const onMessage = (payload: { deliveryId: string; message: DeliveryChatMessage }) => {
      if (payload.deliveryId === deliveryId) addMessages([payload.message]);
    };
    socket.on('delivery.chat.message', onMessage);
    return () => {
      socket.off('delivery.chat.message', onMessage);
    };
  }, [deliveryId, addMessages]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send() {
    if (!text.trim() || !active) return;
    setSending(true);
    setError(null);
    try {
      const message = await apiFetch<DeliveryChatMessage>(`/deliveries/${deliveryId}/chat/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      });
      addMessages([message]);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  const unread = !open && messages.length > 0;

  return (
    <div className="bingo-card" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>
          💬 Chat con el repartidor
          {unread && (
            <span className="bingo-badge" style={{ marginLeft: 8, background: 'var(--bingo-coral)', color: 'white' }}>
              {messages.length}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: '#7f8ea3' }}>{open ? 'Ocultar' : 'Abrir'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ minHeight: 160, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 13, color: '#7f8ea3' }}>
                {active ? 'Escríbele al repartidor cuando quieras.' : 'No hay mensajes en esta entrega.'}
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.senderType === 'CUSTOMER' ? 'flex-end' : 'flex-start',
                  background: m.senderType === 'CUSTOMER' ? 'var(--bingo-teal)' : '#f2f4f7',
                  color: m.senderType === 'CUSTOMER' ? 'white' : 'var(--bingo-navy)',
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

          {error && (
            <div className="bingo-error-banner" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}

          {active ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                className="bingo-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Escribe un mensaje…"
                disabled={sending}
              />
              <button className="bingo-button" style={{ width: 'auto', padding: '0 16px' }} onClick={send} disabled={sending || !text.trim()}>
                Enviar
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 10 }}>Este chat está cerrado — la entrega ya terminó.</div>
          )}
        </div>
      )}
    </div>
  );
}
