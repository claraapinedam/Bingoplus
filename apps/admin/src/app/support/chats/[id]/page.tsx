'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError, uploadFile } from '@/lib/api';

const POLL_INTERVAL_MS = 4000;

interface ChatMessage {
  id: string;
  senderType: 'CUSTOMER' | 'BUSINESS' | 'RIDER' | 'ADMIN';
  text: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface SupportChat {
  id: string;
  relatedType: 'ORDER' | 'DELIVERY' | 'BOOKING';
  relatedId: string;
  status: 'OPEN' | 'CLOSED';
  ratingScore: number | null;
  ratingComment: string | null;
  submitter: { firstName: string; lastName: string; email: string };
  business: { tradeName: string } | null;
  assignedAdmin: { firstName: string; lastName: string } | null;
}

const RELATED_LABELS: Record<string, string> = { ORDER: 'Pedido', DELIVERY: 'Entrega', BOOKING: 'Reserva' };

export default function AdminSupportChatPage() {
  const params = useParams<{ id: string }>();
  const [chat, setChat] = useState<SupportChat | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadChat = useCallback(() => {
    apiFetch<SupportChat>(`/admin/support/chats/${params.id}`).then(setChat).catch(() => setChat(null));
  }, [params.id]);

  const poll = useCallback(async () => {
    try {
      const fresh = await apiFetch<ChatMessage[]>(
        `/admin/support/chats/${params.id}/messages${cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : ''}`,
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
    // Opening the chat page is how an agent "picks it up" — first admin to open an unassigned
    // chat is assigned automatically (see SupportChatsService.openAdmin).
    apiFetch(`/admin/support/chats/${params.id}/open`, { method: 'POST' }).finally(() => {
      loadChat();
      poll();
    });
  }, [params.id, loadChat, poll]);

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
      await apiFetch(`/admin/support/chats/${params.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
      setText('');
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  async function attachImage(file: File | undefined) {
    if (!file) return;
    setAttaching(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      await apiFetch(`/admin/support/chats/${params.id}/messages`, { method: 'POST', body: JSON.stringify({ imageUrl: url }) });
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la imagen.');
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function closeChat() {
    try {
      const updated = await apiFetch<SupportChat>(`/admin/support/chats/${params.id}/close`, { method: 'POST' });
      setChat(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar el chat.');
    }
  }

  if (chat === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!chat) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>No encontramos este chat.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 4 }}>
        Chat con {chat.submitter.firstName} {chat.submitter.lastName}
      </h1>
      <p className="bingo-page-subtitle" style={{ marginTop: 0, marginBottom: 16 }}>
        {chat.submitter.email}
        {chat.business && ` · ${chat.business.tradeName}`} · Sobre: {RELATED_LABELS[chat.relatedType]} ({chat.relatedId})
        {chat.assignedAdmin && ` · Atendido por ${chat.assignedAdmin.firstName} ${chat.assignedAdmin.lastName}`}
      </p>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card" style={{ maxWidth: 640, minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {messages.length === 0 && <div style={{ fontSize: 13, color: '#7f8ea3' }}>Aún no hay mensajes.</div>}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.senderType === 'ADMIN' ? 'flex-end' : 'flex-start',
              background: m.senderType === 'ADMIN' ? 'var(--bingo-teal)' : '#f2f4f7',
              color: m.senderType === 'ADMIN' ? 'white' : 'var(--bingo-navy)',
              borderRadius: 12,
              padding: '8px 12px',
              maxWidth: '80%',
              fontSize: 13,
            }}
          >
            {m.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.imageUrl}
                alt="Imagen adjunta"
                style={{ maxWidth: '100%', borderRadius: 8, display: 'block', marginBottom: m.text ? 6 : 0 }}
              />
            )}
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {chat.status === 'OPEN' ? (
        <div style={{ maxWidth: 640, display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => attachImage(e.target.files?.[0])}
          />
          <button
            type="button"
            className="bingo-button secondary"
            style={{ width: 'auto', padding: '0 12px' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={attaching}
            aria-label="Adjuntar imagen"
            title="Adjuntar imagen"
          >
            {attaching ? '…' : '📎'}
          </button>
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
          <button className="bingo-button secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={closeChat}>
            Cerrar chat
          </button>
        </div>
      ) : (
        <div className="bingo-card" style={{ maxWidth: 640 }}>
          <div style={{ fontWeight: 800 }}>Este chat está cerrado</div>
          {chat.ratingScore != null && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              Calificación: ⭐ {chat.ratingScore}
              {chat.ratingComment && ` — "${chat.ratingComment}"`}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
