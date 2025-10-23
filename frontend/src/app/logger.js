// Simple frontend logger with in-memory buffer and console passthrough
// Usage: import { log } from './logger'; log.info('message', meta)

const MAX_BUFFER = 1000;
let lastSent = 0;
function sendToServer(level, message, meta) {
  try {
    const s = window.__CLIENT_SOCKET__;
    if (!s || typeof s.emit !== 'function') return;
    const now = Date.now();
    if (now - lastSent < 50) return; // basic flood protection
    lastSent = now;
    s.emit('client:log', { level, message, meta });
  } catch (_) {}
}

function push(entry) {
  try {
    const buf = (window.__APP_LOGS__ = window.__APP_LOGS__ || []);
    buf.unshift({ ...entry, ts: new Date().toISOString() });
    if (buf.length > MAX_BUFFER) buf.length = MAX_BUFFER;
  } catch (_) {}
}

export const log = {
  info(message, meta) {
    console.log('[INFO]', message, meta || '');
    push({ level: 'info', message, ...meta });
    sendToServer('info', message, meta);
  },
  warn(message, meta) {
    console.warn('[WARN]', message, meta || '');
    push({ level: 'warn', message, ...meta });
    sendToServer('warn', message, meta);
  },
  error(message, meta) {
    console.error('[ERROR]', message, meta || '');
    push({ level: 'error', message, ...meta });
    sendToServer('error', message, meta);
  },
};

export function getLogs() {
  return (window.__APP_LOGS__ || []).slice(0, MAX_BUFFER);
}
