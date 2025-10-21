'use strict';

const jwt = require('jsonwebtoken');
const { createRoom, joinRoom, startGameIfFull, listRooms } = require('../services/RoomService');
const { startGameSession, rollDice, applyMove } = require('../services/GameService');
const { Game } = require('../models/Game');
const { config } = require('../config/config');

module.exports = function init(io, logger) {
  const nsp = io.of('/ludo');

  // Map roomId -> gameId for quick lookup
  const roomToGame = new Map();

  // Auth guard for namespace (accept raw userId in non-production for tests)
  nsp.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization || '';
      const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (token) {
        const payload = jwt.verify(token, config.jwtSecret);
        socket.user = { userId: payload.userId };
        return next();
      }
      const testUserId = socket.handshake.auth?.userId;
      if (testUserId && config.env !== 'production') {
        socket.user = { userId: String(testUserId) };
        return next();
      }
      return next(new Error('Unauthorized'));
    } catch (_err) {
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
      try {
        const { roomId } = payload || {};
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        const room = await joinRoom({ roomId, userId, logger });
        if (!room) return cb && cb({ ok: false, message: 'Room not available' });
        socket.join(room.roomId);
        nsp.to(room.roomId).emit('room:update', room);
        if (room.status === 'full') {
          nsp.to(room.roomId).emit('room:full', room);
          const startedRoom = await startGameIfFull({ roomId: room.roomId, logger });
          if (startedRoom) {
            const game = await startGameSession(startedRoom.roomId, logger);
            roomToGame.set(startedRoom.roomId, game.gameId);
            nsp.to(room.roomId).emit('game:start', { roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, players: game.players });
          }
        }
        cb && cb({ ok: true, room });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:join', handleJoin);
    socket.on('room:join', handleJoin);

    socket.on('rooms:list', async (_payload, cb) => {
      const rooms = await listRooms({ status: 'waiting' });
      cb && cb({ rooms });
    });

    // Gameplay events
    socket.on('dice:roll', async ({ roomId }, cb) => {
      try {
        const userId = socket.user?.userId;
        if (!roomId) throw new Error('roomId required');
        let gameId = roomToGame.get(roomId);
        if (!gameId) {
          const existing = await Game.findOne({ roomId, status: 'playing' }).lean();
          if (!existing) throw new Error('Game not found');
          gameId = existing.gameId;
          roomToGame.set(roomId, gameId);
        }
        const result = await rollDice(userId, gameId, logger);
        nsp.to(roomId).emit('dice:result', { roomId, gameId, ...result });
        cb && cb({ ok: true, ...result });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('token:move', async ({ roomId, tokenIndex, steps }, cb) => {
      try {
        const userId = socket.user?.userId;
        if (!roomId) throw new Error('roomId required');
        let gameId = roomToGame.get(roomId);
        if (!gameId) {
          const existing = await Game.findOne({ roomId, status: 'playing' }).lean();
          if (!existing) throw new Error('Game not found');
          gameId = existing.gameId;
          roomToGame.set(roomId, gameId);
        }
        const outcome = await applyMove(userId, gameId, Number(tokenIndex), Number(steps), logger);
        if (outcome.ended) {
          nsp.to(roomId).emit('game:end', { roomId, gameId, winnerUserId: outcome.winnerUserId });
        } else if (outcome.skipped) {
          nsp.to(roomId).emit('turn:change', { roomId, gameId, turnIndex: outcome.nextTurnIndex });
        } else {
          nsp.to(roomId).emit('token:move', { roomId, gameId, tokenIndex: Number(tokenIndex), steps: Number(steps) });
          nsp.to(roomId).emit('turn:change', { roomId, gameId, turnIndex: outcome.nextTurnIndex });
        }
        cb && cb({ ok: true, ...outcome });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('game:get', async ({ roomId }, cb) => {
      try {
        let gameId = roomToGame.get(roomId);
        let game;
        if (gameId) {
          game = await Game.findOne({ gameId });
        } else {
          game = await Game.findOne({ roomId }).lean();
          if (game) roomToGame.set(roomId, game.gameId);
        }
        if (!game) return cb && cb({ ok: false, message: 'Game not found' });
        cb && cb({ ok: true, game });
      } catch (err) {
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', { id: socket.id, reason });
    });
  });
};
