'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createLogger } = require('../utils/logger');
const { connectDatabase } = require('../config/database');
const socketInit = require('../socketController/io');

const logger = createLogger();

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('Socket game flow: start → roll → move → turn change', () => {
  let io, server, addr, mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    process.env.MONGO_URI = mem.getUri();
    await connectDatabase(logger);

    const app = express();
    server = http.createServer(app);
    io = new Server(server, { path: '/ludo' });
    socketInit(io, logger);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    addr = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await io.close();
    await new Promise((r) => server.close(r));
    if (mem) await mem.stop();
  });

  test('from start to first move', async () => {
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

    const joinRes = await new Promise((res) => c2.emit('session:join', { roomId: createRes.room.roomId }, res));
    expect(joinRes.ok).toBe(true);

    const startPayload = await waitFor(c1, 'game:start');
    expect(startPayload.roomId).toBe(createRes.room.roomId);
    const roomId = startPayload.roomId;

    // Roll dice with player 1
    const rollRes = await new Promise((res) => c1.emit('dice:roll', { roomId }, res));
    expect(rollRes.ok).toBe(true);

    if (rollRes.value === 6) {
      // release from base and get extra turn
      const moveRes = await new Promise((res) =>
        c1.emit('token:move', { roomId, tokenIndex: 0, steps: 6 }, res),
      );
      expect(moveRes.ok).toBe(true);
      // turn might stay on player 1; we still should get turn:change or ended
      await new Promise((resolve) => setTimeout(resolve, 20));
    } else {
      // if not 6 from base, server should auto-skip turn or deny move; try move if legal
      if (!rollRes.skipped) {
        const moveRes = await new Promise((res) =>
          c1.emit('token:move', { roomId, tokenIndex: 0, steps: rollRes.value }, res),
        );
        // It might be illegal if still at base; ok if fails; if succeeds, expect turn change
        if (moveRes.ok) {
          const turn = await waitFor(c2, 'turn:change');
          expect(typeof turn.turnIndex).toBe('number');
        }
      }
    }

    c1.close();
    c2.close();
  });
});
