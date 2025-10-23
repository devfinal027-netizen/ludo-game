'use strict';
const mongoose = require('mongoose');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
let MongoMemoryServer;
try { ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch (_) { MongoMemoryServer = null; }

const { createLogger } = require('../utils/logger');
const { connectDatabase } = require('../config/database');
const roomSocketInit = require('../socketController/io');

const logger = createLogger();

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

maybeDescribe('Socket rooms create→join→full', () => {
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
    roomSocketInit(io, logger);
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

  test('create -> join -> full', async () => {
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

      // Pre-register full/start just in case ordering matters
      const roomFullPromise = waitFor(c1, 'room:full');

      const joinRes = await new Promise((res) =>
        c2.emit('session:join', { roomId: createRes.room.roomId }, res),
      );
      expect(joinRes.ok).toBe(true);

      const full = await roomFullPromise;
      expect(full.roomId).toBe(createRes.room.roomId);
    } finally {
      try { c1.close(); } catch (_) {}
      try { c2.close(); } catch (_) {}
    }
  }, 20000);
});
