'use strict';

const jwt = require('jsonwebtoken');
const { createRoom, joinRoom, startGameIfFull, listRooms } = require('../services/RoomService');
const { config } = require('../config/config');

module.exports = function init(io, logger) {
  const nsp = io.of('/ludo');

  // Auth guard for namespace
  nsp.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
      const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (!token) return next(new Error('Unauthorized'));
      const payload = jwt.verify(token, config.jwtSecret);
      socket.user = { userId: payload.userId };
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  nsp.on('connection', (socket) => {
    logger.info('socket connected', { id: socket.id });

    async function handleCreate(payload, cb) {
      try {
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        const room = await createRoom({ ...payload, creatorUserId: userId, logger });
        socket.join(room.roomId);
        nsp.emit('room:create', room);
        cb && cb({ ok: true, room });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:create', handleCreate);
    socket.on('room:create', handleCreate);

    async function handleJoin(payload, cb) {
      const { roomId } = payload || {};
      const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
      const room = await joinRoom({ roomId, userId, logger });
      if (!room) return cb && cb({ ok: false, message: 'Room not available' });
      socket.join(room.roomId);
      nsp.to(room.roomId).emit('room:update', room);
      if (room.status === 'full') {
        nsp.to(room.roomId).emit('room:full', room);
        const started = await startGameIfFull({ roomId: room.roomId, logger });
        if (started) nsp.to(room.roomId).emit('game:start', { roomId: started.roomId });
      }
      cb && cb({ ok: true, room });
    }

    socket.on('session:join', handleJoin);
    socket.on('room:join', handleJoin);

    socket.on('rooms:list', async (_payload, cb) => {
      const rooms = await listRooms({ status: 'waiting' });
      cb && cb({ rooms });
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', { id: socket.id, reason });
    });
  });
};
