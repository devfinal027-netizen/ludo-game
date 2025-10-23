'use strict';
const mongoose = require('mongoose');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
let MongoMemoryServer;
try { ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch (_) { MongoMemoryServer = null; }

function waitWithTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label || 'wait'}_timeout`)), timeoutMs);
    promise.then((v) => { clearTimeout(timer); resolve(v); }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}

const { createLogger } = require('../utils/logger');
const { connectDatabase } = require('../config/database');
const socketInit = require('../socketController/io');

const logger = createLogger();

// Integration test can take longer due to socket and DB I/O
jest.setTimeout(20000);

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function waitForConnect(socket, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const onOk = () => { cleanup(); resolve(); };
    const onErr = (err) => { cleanup(); reject(err || new Error('connect_error')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('connect_timeout')); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.off('connect', onOk);
      socket.off('connect_error', onErr);
    }
    socket.once('connect', onOk);
    socket.once('connect_error', onErr);
  });
}

const maybeDescribe = (MongoMemoryServer || process.env.MONGO_URI) ? describe : describe.skip;

maybeDescribe('Socket game flow: start → roll → move → turn change', () => {
  let io, server, addr, mem;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      if (!MongoMemoryServer) throw new Error('mongodb-memory-server not available and MONGO_URI not set');
      mem = await MongoMemoryServer.create();
      process.env.MONGO_URI = mem.getUri();
    }
    await connectDatabase(logger);

    const app = express();
    server = http.createServer(app);
    io = new Server(server);
    socketInit(io, logger);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    addr = `http://localhost:${port}`;
  });

  afterAll(async () => {
    try { if (io) await io.close(); } catch (_) {}
    try { if (server) await new Promise((r) => server.close(r)); } catch (_) {}
    try { if (mem) await mem.stop(); } catch (_) {}
    try { await mongoose.disconnect(); } catch (_) {}
  });

  test('from start to first move', async () => {
    const nspUrl = addr + '/ludo';
    const c1 = Client(nspUrl, { autoConnect: true, transports: ['websocket'], timeout: 8000, forceNew: true, auth: { userId: 'u1' } });
    const c2 = Client(nspUrl, { autoConnect: true, transports: ['websocket'], timeout: 8000, forceNew: true, auth: { userId: 'u2' } });
    try {
      await Promise.all([
        waitForConnect(c1, 8000),
        waitForConnect(c2, 8000),
      ]);

      const createRes = await new Promise((res) =>
        c1.emit('session:create', { stake: 10, mode: 'Classic', maxPlayers: 2 }, res),
      );
      expect(createRes.ok).toBe(true);

      // Pre-register waits before triggering join to avoid missing fast emits
      const roomFullPromise = waitFor(c1, 'room:full');
      const gameStartPromise = waitFor(c1, 'game:start');

      const joinRes = await new Promise((res) => c2.emit('session:join', { roomId: createRes.room.roomId }, res));
      expect(joinRes.ok).toBe(true);

      // Wait for room:full -> then game:start
      await waitWithTimeout(roomFullPromise, 12000, 'room:full');
      const startPayload = await waitWithTimeout(gameStartPromise, 12000, 'game:start');
      expect(startPayload.roomId).toBe(createRes.room.roomId);
      const roomId = startPayload.roomId;

      // Roll dice with player 1
      const rollRes = await waitWithTimeout(new Promise((res) => c1.emit('dice:roll', { roomId }, res)), 8000, 'dice:roll');
      expect(rollRes.ok).toBe(true);

      if (rollRes.value === 6) {
        // release from base and get extra turn
        const moveRes = await waitWithTimeout(new Promise((res) =>
          c1.emit('token:move', { roomId, tokenIndex: 0, steps: 6 }, res),
        ), 8000, 'token:move');
        expect(moveRes.ok).toBe(true);
        // turn might stay on player 1; we still should get turn:change or ended
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else {
        // if not 6 from base, server should auto-skip turn or deny move; try move if legal
        if (!rollRes.skipped) {
          const moveRes = await waitWithTimeout(new Promise((res) =>
            c1.emit('token:move', { roomId, tokenIndex: 0, steps: rollRes.value }, res),
          ), 8000, 'token:move');
          // It might be illegal if still at base; ok if fails; if succeeds, expect turn change
          if (moveRes.ok) {
            const turn = await waitFor(c2, 'turn:change');
            expect(typeof turn.turnIndex).toBe('number');
          }
        }
      }
    } finally {
      try { c1.close(); } catch (_) {}
      try { c2.close(); } catch (_) {}
    }
  }, 20000);
});
