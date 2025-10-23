'use strict';
const mongoose = require('mongoose');

const request = require('supertest');
const http = require('http');
const express = require('express');
const routes = require('../routes');
const { createLogger } = require('../utils/logger');
let MongoMemoryServer;
try { ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch (_) { MongoMemoryServer = null; }
const { connectDatabase } = require('../config/database');
const jwt = require('jsonwebtoken');
const { config } = require('../config/config');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.set('logger', createLogger());
  app.use('/api', routes);
  return http.createServer(app);
}

describe('Rooms API', () => {
  let server;
  let mem;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      if (!MongoMemoryServer) throw new Error('mongodb-memory-server not available and MONGO_URI not set');
      mem = await MongoMemoryServer.create();
      process.env.MONGO_URI = mem.getUri();
    }
    await connectDatabase(console);
    server = makeApp();
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    try { await mongoose.disconnect(); } catch (_) {}
    if (mem) await mem.stop();
  });

  function auth() {
    const token = jwt.sign({ userId: 'u_api' }, config.jwtSecret, { expiresIn: '1h' });
    return { Authorization: `Bearer ${token}` };
  }

  test('create -> list waiting -> join', async () => {
    const createRes = await request(server)
      .post('/api/rooms/create')
      .set(auth())
      .send({ stake: 10, mode: 'Classic', maxPlayers: 2 })
      .expect(200);

    const listRes = await request(server)
      .get('/api/rooms?status=waiting')
      .set(auth())
      .expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    await request(server)
      .post('/api/rooms/join')
      .set(auth())
      .send({ roomId: createRes.body.roomId })
      .expect(200);
  });
});
