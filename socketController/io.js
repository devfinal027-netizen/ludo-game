'use strict';

const jwt = require('jsonwebtoken');
const { createRoom, joinRoom, startGameIfFull, listRooms } = require('../services/RoomService');
const { config } = require('../config/config');
const gameController = require('../controllers/gameController');

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
        const userId = payload.userId || payload.id || payload._id;
        if (!userId) return next(new Error('Unauthorized'));
        socket.user = { userId: String(userId) };
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
    logger.info('socket:connected', { socketId: socket.id, userId: socket.user?.userId });

    async function handleCreate(payload, cb) {
      try {
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        logger.info('socket:event:receive', { event: 'room|session:create', socketId: socket.id, userId, payload });
        const room = await createRoom({ ...payload, creatorUserId: userId, logger });
        socket.join(room.roomId);
        logger.info('socket:event:emit', { event: 'room:create', roomId: room.roomId, players: room.players.length });
        nsp.emit('room:create', room);
        const ack = { ok: true, room };
        logger.info('socket:event:ack', { event: 'room|session:create', ok: true, roomId: room.roomId, to: socket.id });
        cb && cb(ack);
      } catch (err) {
        logger.error('socket:event:error', { event: 'room|session:create', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:create', handleCreate);
    socket.on('room:create', handleCreate);

    async function handleJoin(payload, cb) {
      try {
        const { roomId } = payload || {};
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        logger.info('socket:event:receive', { event: 'room|session:join', socketId: socket.id, userId, roomId });
        const room = await joinRoom({ roomId, userId, logger });
        if (!room) return cb && cb({ ok: false, message: 'Room not available' });
        socket.join(room.roomId);
        logger.info('socket:event:emit', { event: 'room:update', roomId: room.roomId, players: room.players.length });
        nsp.to(room.roomId).emit('room:update', room);
        if (room.status === 'full') {
          logger.info('socket:event:emit', { event: 'room:full', roomId: room.roomId });
          nsp.to(room.roomId).emit('room:full', room);
          const startedRoom = await startGameIfFull({ roomId: room.roomId, logger });
          if (startedRoom) {
            const game = await gameController.handleStartGame(startedRoom.roomId, logger);
            roomToGame.set(startedRoom.roomId, game.gameId);
            const payload = { roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, players: game.players };
            logger.info('socket:event:emit', { event: 'game:start', roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex });
            nsp.to(room.roomId).emit('game:start', payload);
          }
        }
        logger.info('socket:event:ack', { event: 'room|session:join', ok: true, roomId: room.roomId, to: socket.id });
        cb && cb({ ok: true, room });
      } catch (err) {
        logger.error('socket:event:error', { event: 'room|session:join', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:join', handleJoin);
    socket.on('room:join', handleJoin);

    socket.on('rooms:list', async (_payload, cb) => {
      try {
        logger.info('socket:event:receive', { event: 'rooms:list', socketId: socket.id });
        const rooms = await listRooms({ status: 'waiting' });
        logger.info('socket:event:ack', { event: 'rooms:list', count: rooms.length, to: socket.id });
        cb && cb({ rooms });
      } catch (err) {
        logger.error('socket:event:error', { event: 'rooms:list', error: err.message, socketId: socket.id });
        cb && cb({ rooms: [] });
      }
    });

    // Leave socket rooms
    async function handleLeave(payload, cb) {
      try {
        const { roomId } = payload || {};
        logger.info('socket:event:receive', { event: 'room|session:leave', socketId: socket.id, roomId });
        if (roomId) {
          await socket.leave(roomId);
          logger.info('room:leave', { socketId: socket.id, roomId });
          return cb && cb({ ok: true, roomId });
        }
        // If no roomId provided, leave all joined rooms except the socket's own room
        const joined = Array.from(socket.rooms || []);
        await Promise.all(
          joined
            .filter((r) => r !== socket.id)
            .map((r) => socket.leave(r)),
        );
        logger.info('room:leaveAll', { socketId: socket.id, rooms: joined.filter((r) => r !== socket.id) });
        cb && cb({ ok: true, leftAll: true });
      } catch (err) {
        logger.error('socket:event:error', { event: 'room|session:leave', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:leave', handleLeave);
    socket.on('room:leave', handleLeave);

    // Gameplay events
    socket.on('dice:roll', async ({ roomId }, cb) => {
      try {
        const userId = socket.user?.userId;
        logger.info('socket:event:receive', { event: 'dice:roll', socketId: socket.id, userId, roomId });
        if (!roomId) throw new Error('roomId required');
        let gameId = roomToGame.get(roomId);
        if (!gameId) {
          gameId = await gameController.findPlayingGameIdByRoom(roomId);
          if (!gameId) throw new Error('Game not found');
          roomToGame.set(roomId, gameId);
        }
        const result = await gameController.handleDiceRoll(gameId, userId, logger);
        logger.info('socket:event:emit', { event: 'dice:result', roomId, gameId, value: result.value, skipped: result.skipped });
        nsp.to(roomId).emit('dice:result', { roomId, gameId, ...result });
        logger.info('socket:event:ack', { event: 'dice:roll', ok: true, to: socket.id });
        cb && cb({ ok: true, ...result });
      } catch (err) {
        logger.error('socket:event:error', { event: 'dice:roll', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('token:move', async ({ roomId, tokenIndex, steps }, cb) => {
      try {
        const userId = socket.user?.userId;
        logger.info('socket:event:receive', { event: 'token:move', socketId: socket.id, userId, roomId, tokenIndex, steps });
        if (!roomId) throw new Error('roomId required');
        let gameId = roomToGame.get(roomId);
        if (!gameId) {
          gameId = await gameController.findPlayingGameIdByRoom(roomId);
          if (!gameId) throw new Error('Game not found');
          roomToGame.set(roomId, gameId);
        }
        const outcome = await gameController.handleTokenMove(gameId, Number(tokenIndex), Number(steps), userId, logger);
        if (outcome.ended) {
          logger.info('socket:event:emit', { event: 'game:end', roomId, gameId, winnerUserId: outcome.winnerUserId });
          nsp.to(roomId).emit('game:end', { roomId, gameId, winnerUserId: outcome.winnerUserId });
        } else if (outcome.skipped) {
          logger.info('socket:event:emit', { event: 'turn:change', roomId, gameId, turnIndex: outcome.nextTurnIndex });
          nsp.to(roomId).emit('turn:change', { roomId, gameId, turnIndex: outcome.nextTurnIndex });
        } else {
          logger.info('socket:event:emit', { event: 'token:move', roomId, gameId, tokenIndex: Number(tokenIndex), steps: Number(steps) });
          nsp.to(roomId).emit('token:move', { roomId, gameId, tokenIndex: Number(tokenIndex), steps: Number(steps) });
          logger.info('socket:event:emit', { event: 'turn:change', roomId, gameId, turnIndex: outcome.nextTurnIndex });
          nsp.to(roomId).emit('turn:change', { roomId, gameId, turnIndex: outcome.nextTurnIndex });
        }
        logger.info('socket:event:ack', { event: 'token:move', ok: true, to: socket.id });
        cb && cb({ ok: true, ...outcome });
      } catch (err) {
        logger.error('socket:event:error', { event: 'token:move', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('game:get', async ({ roomId }, cb) => {
      try {
        logger.info('socket:event:receive', { event: 'game:get', socketId: socket.id, roomId });
        let gameId = roomToGame.get(roomId);
        let game;
        if (gameId) {
          game = await gameController.getGameDocument(gameId);
        } else {
          game = await gameController.getLatestGameDocumentByRoom(roomId);
          if (game) roomToGame.set(roomId, game.gameId);
        }
        if (!game) return cb && cb({ ok: false, message: 'Game not found' });
        logger.info('socket:event:ack', { event: 'game:get', ok: true, to: socket.id, gameId: game.gameId });
        cb && cb({ ok: true, game });
      } catch (err) {
        logger.error('socket:event:error', { event: 'game:get', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket:disconnected', { socketId: socket.id, reason });
    });
  });
};
