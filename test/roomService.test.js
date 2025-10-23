'use strict';

const mongoose = require('mongoose');
let MongoMemoryServer;
try { ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch (_) { MongoMemoryServer = null; }
const { connectDatabase } = require('../config/database');
const { createRoom, joinRoom, startGameIfFull, cancelRoom } = require('../services/RoomService');

const logger = { info: () => {}, error: () => {} };

describe('RoomService', () => {
  let mem;
  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      if (!MongoMemoryServer) throw new Error('mongodb-memory-server not available and MONGO_URI not set');
      mem = await MongoMemoryServer.create();
      process.env.MONGO_URI = mem.getUri();
    }
    await connectDatabase(logger);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mem) await mem.stop();
  });

  test('create -> join -> full -> start', async () => {
    const room = await createRoom({ stake: 10, mode: 'Classic', maxPlayers: 2, creatorUserId: 'u1', logger });
    expect(room.status).toBe('waiting');

    const afterJoin = await joinRoom({ roomId: room.roomId, userId: 'u2', logger });
    expect(afterJoin.status).toBe('full');

    const started = await startGameIfFull({ roomId: room.roomId, logger });
    expect(started.status).toBe('playing');
  });

  test('cancel waiting room', async () => {
    const room = await createRoom({ stake: 50, mode: 'Quick', maxPlayers: 4, creatorUserId: 'u1', logger });
    const cancelled = await cancelRoom({ roomId: room.roomId, reason: 'timeout', logger });
    expect(cancelled.status).toBe('cancelled');
  });
});
