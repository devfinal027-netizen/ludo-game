import { io } from 'socket.io-client';
import { updateTurn, diceResult, gameStarted, gameEnded, tokenMoved, fetchGame } from '../features/game/gameSlice';
import { log } from './logger';
import { setConnected } from '../features/socket/socketSlice';

let socket;
function alreadyWired(s) { return s && s.__LUDO_WIRED__ === true; }
function markWired(s) { try { s.__LUDO_WIRED__ = true; } catch (_) {} }

// Connection stability tracking
const connectionStats = {
  connects: 0,
  disconnects: 0,
  lastDisconnectReason: null,
  lastDisconnectAt: null,
  reconnectAttempts: 0,
  reconnectTimeoutId: null,
};

// Event sequence tracking to prevent stale events
let eventSequence = 0;
let lastReconnectAt = 0;
const STALE_EVENT_WINDOW_MS = 2000; // Ignore events from before recent reconnect

function isStaleEvent(eventTimestamp) {
  return lastReconnectAt > 0 && eventTimestamp && eventTimestamp < lastReconnectAt;
}

function logConnectionStats() {
  const uptime = connectionStats.lastDisconnectAt ? Date.now() - connectionStats.lastDisconnectAt : 0;
  log.info('socket:connection:stats', {
    connects: connectionStats.connects,
    disconnects: connectionStats.disconnects,
    lastReason: connectionStats.lastDisconnectReason,
    timeSinceLastDisconnect: uptime,
    reconnectAttempts: connectionStats.reconnectAttempts,
  });
}
const lastFetchByRoom = {};
function fetchOnce(dispatch, roomId, minIntervalMs = 400) {
  if (!roomId) return;
  const now = Date.now();
  const last = lastFetchByRoom[roomId] || 0;
  if (now - last < minIntervalMs) return;
  lastFetchByRoom[roomId] = now;
  dispatch(fetchGame({ roomId }));
}

// Debounce rooms:list calls to prevent flooding
let roomsListPending = null;
function debouncedRoomsList(socket) {
  if (roomsListPending) return roomsListPending;
  roomsListPending = new Promise((resolve) => {
    socket.emit('rooms:list', {}, (ack) => {
      roomsListPending = null;
      resolve(ack);
    });
  });
  return roomsListPending;
}

function getStoredRoom() {
  try { return JSON.parse(localStorage.getItem('currentRoom') || 'null'); } catch { return null; }
}
function setStoredRoom(roomId) {
  try { localStorage.setItem('currentRoom', JSON.stringify({ roomId })); } catch {}
}

function emitHUD(type, detail) {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail })); } catch (_) {}
}

export function connectSocket(getToken, dispatch) {
  try {
    if (!socket && typeof window !== 'undefined' && window.__CLIENT_SOCKET__) {
      socket = window.__CLIENT_SOCKET__;
    }
  } catch (_) {}
  if (socket && alreadyWired(socket)) return socket;
  socket = io(`${import.meta.env.VITE_API_BASE}/ludo`, {
    path: '/ludo',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    upgrade: true,
    rememberUpgrade: true,
    auth: { token: `Bearer ${getToken()}` },
  });
  
  // Set absolute reconnection timeout to prevent infinite loops
  const RECONNECT_ABSOLUTE_TIMEOUT = 60000; // 60 seconds total
  socket.io.on('reconnect_attempt', (n) => {
    if (!connectionStats.reconnectTimeoutId && n === 1) {
      connectionStats.reconnectTimeoutId = setTimeout(() => {
        log.error('socket:reconnect:timeout', { totalAttempts: n });
        socket.io.opts.reconnection = false;
        socket.disconnect();
        emitHUD('hud:reconnect-failed', { reason: 'timeout' });
      }, RECONNECT_ABSOLUTE_TIMEOUT);
    }
  });
  try { if (typeof window !== 'undefined') window.__CLIENT_SOCKET__ = socket; } catch (_) {}
  socket.on('connect', async () => {
    connectionStats.connects++;
    connectionStats.reconnectAttempts = 0;
    // Clear reconnect timeout on successful connection
    if (connectionStats.reconnectTimeoutId) {
      clearTimeout(connectionStats.reconnectTimeoutId);
      connectionStats.reconnectTimeoutId = null;
      socket.io.opts.reconnection = true; // Re-enable for future
    }
    log.info('socket:connect', { id: socket.id, connectCount: connectionStats.connects });
    if (connectionStats.connects > 1) {
      logConnectionStats();
      lastReconnectAt = Date.now(); // Mark reconnect time to filter stale events
      log.info('socket:reconnect:mark_stale_window', { lastReconnectAt });
    }
    dispatch(setConnected(true));
    // On reconnect, sync current game state if a room is persisted
    try {
      const room = getStoredRoom();
      if (room && room.roomId) {
        // Don't validate via rooms:list (it only shows 'waiting' rooms)
        // Instead, trust the stored room and let game:reconnect handle validation
        log.info('socket:connect:rejoin', { roomId: room.roomId });
        
        // Ask server to resync the game state snapshot and pending dice
        socket.emit('game:reconnect', { roomId: room.roomId }, (ack) => {
          log.info('socket:ack', { event: 'game:reconnect', ok: ack?.ok, gameId: ack?.gameId, code: ack?.code });
          if (ack?.ok && room?.roomId) {
            // Game exists, rejoin room
            socket.emit('session:join', { roomId: room.roomId }, (joinAck) => {
              log.info('socket:ack', { event: 'session:join', ok: joinAck?.ok, roomId: room.roomId });
              if (joinAck?.ok && room.roomId) setStoredRoom(room.roomId);
            });
            fetchOnce(dispatch, room.roomId);
            emitHUD('hud:reconnected', { roomId: room.roomId, gameId: ack.gameId });
          } else {
            // Game doesn't exist or room not found
            log.warn('socket:game:reconnect:failed', { code: ack?.code, roomId: room.roomId });
            if (ack?.code === 'E_NO_PRIOR_ROOM' || ack?.code === 'E_RECONNECT_FAILED') {
              try { localStorage.removeItem('currentRoom'); } catch (_) {}
              emitHUD('hud:room-stale', { roomId: room.roomId, reason: ack?.code });
            }
          }
        });
      }
    } catch (e) {
      log.error('socket:connect:rejoin:error', { message: e?.message || String(e) });
    }
  });
  socket.on('disconnect', (reason) => {
    connectionStats.disconnects++;
    connectionStats.lastDisconnectReason = reason;
    connectionStats.lastDisconnectAt = Date.now();
    log.warn('socket:disconnect', { reason, disconnectCount: connectionStats.disconnects });
    dispatch(setConnected(false));
  });
  socket.on('connect_error', (err) => {
    dispatch(setConnected(false));
    log.error('socket:connect_error', { message: err?.message || String(err) });
  });
  socket.io.on('reconnect_attempt', (n) => {
    connectionStats.reconnectAttempts = n;
    log.info('socket:reconnect_attempt', { attempt: n });
    if (n > 3) {
      log.warn('socket:reconnect:multiple_attempts', { attempt: n, lastReason: connectionStats.lastDisconnectReason });
    }
  });
  socket.io.on('reconnect_failed', () => log.warn('socket:reconnect_failed'));

  socket.on('connect', () => log.info('socket:connect'));
  socket.on('disconnect', () => log.info('socket:disconnect'));
  socket.on('reconnecting', () => log.info('socket:reconnecting'));
  socket.on('reconnect', () => log.info('socket:reconnect'));
  socket.on('reconnect_error', () => log.info('socket:reconnect_error'));
  socket.on('reconnect_failed', () => log.info('socket:reconnect_failed'));
  socket.on('error', () => log.info('socket:error'));
  socket.on('connect_timeout', () => log.info('socket:connect_timeout'));
  socket.on('connecting', () => log.info('socket:connecting'));

  socket.on('game:start', (p) => {
    log.info('socket:event', { event: 'game:start', roomId: p?.roomId, gameId: p?.gameId, seq: p?.seq });
    // Don't check stale events for game:start since it's an initial state event
    // But do check room mismatch
    const stored = getStoredRoom();
    if (stored?.roomId && p?.roomId && stored.roomId !== p.roomId) {
      log.warn('socket:event:room-mismatch', { event: 'game:start', stored: stored.roomId, eventRoom: p.roomId });
      emitHUD('hud:room-mismatch', { stored: stored.roomId, eventRoom: p.roomId, event: 'game:start' });
      return; // Don't process game:start for wrong room
    }
    if (p?.roomId) setStoredRoom(p.roomId);
    dispatch(gameStarted(p));
    if (p?.roomId) fetchOnce(dispatch, p.roomId);
  });
  socket.on('dice:result', (p) => {
    log.info('socket:event', { event: 'dice:result', value: p?.value, skipped: p?.skipped, seq: p?.seq });
    // Ignore stale events from before reconnect
    if (isStaleEvent(p?.timestamp)) {
      log.warn('socket:event:stale', { event: 'dice:result', eventTimestamp: p?.timestamp, lastReconnectAt });
      return;
    }
    // Only update stored room if event is for our current room
    const stored = getStoredRoom();
    if (stored?.roomId && p?.roomId && stored.roomId !== p.roomId) {
      log.warn('socket:event:room-mismatch', { event: 'dice:result', stored: stored.roomId, eventRoom: p.roomId });
      emitHUD('hud:room-mismatch', { stored: stored.roomId, eventRoom: p.roomId, event: 'dice:result' });
      return; // Don't process events for wrong room
    }
    if (p?.roomId) setStoredRoom(p.roomId);
    dispatch(diceResult(p));
    if (p?.roomId) fetchOnce(dispatch, p.roomId);
  });
  // Guard emits on server-side errors
  socket.on('turn:change', (p) => {
    log.info('socket:event', { event: 'turn:change', turnIndex: p?.turnIndex, seq: p?.seq });
    if (isStaleEvent(p?.timestamp)) {
      log.warn('socket:event:stale', { event: 'turn:change', eventTimestamp: p?.timestamp, lastReconnectAt });
      return;
    }
    const stored = getStoredRoom();
    if (stored?.roomId && p?.roomId && stored.roomId !== p.roomId) {
      log.warn('socket:event:room-mismatch', { event: 'turn:change', stored: stored.roomId, eventRoom: p.roomId });
      emitHUD('hud:room-mismatch', { stored: stored.roomId, eventRoom: p.roomId, event: 'turn:change' });
      return;
    }
    if (p?.roomId) setStoredRoom(p.roomId);
    dispatch(updateTurn(p.turnIndex));
    if (p?.roomId) fetchOnce(dispatch, p.roomId);
  });
  socket.on('token:move', (p) => {
    log.info('socket:event', { event: 'token:move', tokenIndex: p?.tokenIndex, steps: p?.steps, seq: p?.seq });
    if (isStaleEvent(p?.timestamp)) {
      log.warn('socket:event:stale', { event: 'token:move', eventTimestamp: p?.timestamp, lastReconnectAt });
      return;
    }
    const stored = getStoredRoom();
    if (stored?.roomId && p?.roomId && stored.roomId !== p.roomId) {
      log.warn('socket:event:room-mismatch', { event: 'token:move', stored: stored.roomId, eventRoom: p.roomId });
      emitHUD('hud:room-mismatch', { stored: stored.roomId, eventRoom: p.roomId, event: 'token:move' });
      return;
    }
    if (p?.roomId) setStoredRoom(p.roomId);
    dispatch(tokenMoved(p));
    if (p?.roomId) fetchOnce(dispatch, p.roomId);
  });
  socket.on('game:end', (p) => {
    log.info('socket:event', { event: 'game:end', winnerUserId: p?.winnerUserId, seq: p?.seq });
    if (isStaleEvent(p?.timestamp)) {
      log.warn('socket:event:stale', { event: 'game:end', eventTimestamp: p?.timestamp, lastReconnectAt });
      return;
    }
    dispatch(gameEnded(p));
    // Clear stored room on game end
    try { localStorage.removeItem('currentRoom'); } catch (_) {}
  });

  // Chat and reactions wiring (UI deferred)
  socket.on('chat:message', (p) => { log.info('socket:event', { event: 'chat:message', from: p?.userId, roomId: p?.roomId }); });
  socket.on('reaction:emoji', (p) => { log.info('socket:event', { event: 'reaction:emoji', emoji: p?.emoji, roomId: p?.roomId }); });

  markWired(socket);
  return socket;
}

export function getSocket() { return socket; }

export function getRoomsList() {
  if (!socket) return Promise.resolve({ ok: true, rooms: [] });
  return debouncedRoomsList(socket);
}

export function emitAck(event, payload, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      log.error('socket:emit:timeout', { event, payload });
      reject(new Error('Timeout'));
    }, timeoutMs);
    try {
      log.info('socket:emit', { event, payload });
      socket.emit(event, payload, (ack) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (!ack || ack.ok === false) {
          const msg = ack?.message || 'Ack failed';
          log.error('socket:ack:error', { event, message: msg });
          return resolve({ ok: false, message: msg });
        }
        log.info('socket:ack', { event, ok: ack?.ok, meta: { ...ack, payload: undefined } });
        resolve(ack);
      });
    } catch (e) {
      clearTimeout(t);
      log.error('socket:emit:error', { event, message: e?.message || String(e) });
      reject(e);
    }
  });
}

// Helper to request authoritative legal tokens from server
export async function requestLegalTokens(roomId, dice) {
  if (!socket) throw new Error('Socket not connected');
  return new Promise((resolve) => {
    try {
      const payload = { roomId };
      if (dice != null) payload.dice = dice;
      socket.emit('rules:legalTokens', payload, (ack) => {
        if (!ack || ack.ok === false) {
          log.warn('socket:rules:legalTokens:error', { message: ack?.message });
          return resolve({ ok: false, legalTokens: [], mustMove: false });
        }
        resolve({ ok: true, legalTokens: ack.legalTokens || [], mustMove: !!ack.mustMove, value: ack.value });
      });
    } catch (e) {
      log.error('socket:rules:legalTokens:throw', { message: e?.message || String(e) });
      resolve({ ok: false, legalTokens: [], mustMove: false });
    }
  });
}
