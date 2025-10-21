'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createLogger } = require('../utils/logger');
const { connectDatabase } = require('../config/database');
const roomSocketInit = require('../socketController/io');

const logger = createLogger();

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

describe('Socket rooms create→join→full', () => {
  let io, server, addr, mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    process.env.MONGO_URI = mem.getUri();
    await connectDatabase(logger);

    const app = express();
    server = http.createServer(app);
    io = new Server(server, { path: '/ludo' });
    roomSocketInit(io, logger);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    addr = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await io.close();
    await new Promise((r) => server.close(r));
    if (mem) await mem.stop();
  });

  test('create -> join -> full', async () => {
    const c1 = Client(addr, { path: '/ludo', autoConnect: true, auth: { userId: 'u1' } });
    const c2 = Client(addr, { path: '/ludo', autoConnect: true, auth: { userId: 'u2' } });

    await Promise.all([
      new Promise((r) => c1.on('connect', r)),
      new Promise((r) => c2.on('connect', r)),
    ]);

    const createRes = await new Promise((res) =>
      c1.emit('session:create', { stake: 10, mode: 'Classic', maxPlayers: 2 }, res),
    );
    expect(createRes.ok).toBe(true);

    const joinRes = await new Promise((res) =>
      c2.emit('session:join', { roomId: createRes.room.roomId }, res),
    );
    expect(joinRes.ok).toBe(true);
    expect(joinRes.room.status === 'full' || joinRes.room.status === 'playing').toBe(true);

    c1.close();
    c2.close();
    await delay(50);
  });
});
