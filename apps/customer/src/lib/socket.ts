'use client';

import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

// DeliveryGateway lives on the same Nest HTTP server as the REST API, but Socket.IO's own
// /socket.io/ path is independent of app.setGlobalPrefix('api/v1') — so the socket URL is the
// bare origin, not NEXT_PUBLIC_API_URL (which already has /api/v1 appended).
const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;

/** One shared socket per tab. `auth` is a callback (not a plain object) so every reconnect sends
 * the *current* token, not whatever was in localStorage at first connect. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

export function connectSocket(): Socket | null {
  if (!getAccessToken()) return null;
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
