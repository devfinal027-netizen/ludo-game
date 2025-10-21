'use strict';

const { createRoom, joinRoom, startGameIfFull } = require('../services/RoomService');

module.exports = function init(io, logger) {
  const nsp = io.of('/ludo');

  nsp.on('connection', (socket) => {
    logger.info('socket connected', { id: socket.id });

    socket.on('session:create', async (payload, cb) => {
      try {
        const userId = socket.handshake.auth?.userId || 'dev-user';
        const room = await createRoom({ ...payload, creatorUserId: userId, logger });
        socket.join(room.roomId);
        nsp.emit('room:create', room);
        cb && cb({ ok: true, room });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('session:join', async (payload, cb) => {
      const { roomId } = payload || {};
      const userId = socket.handshake.auth?.userId || 'dev-user';
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
    });

    socket.on('rooms:list', (_payload, cb) => {
      cb && cb({ rooms: [] });
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', { id: socket.id, reason });
    });
  });
};
