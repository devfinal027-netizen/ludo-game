'use strict';
const { validateMove } = require('../services/validator');
const jwt = require('jsonwebtoken');
const { createRoom, joinRoom, startGameIfFull, listRooms } = require('../services/RoomService');
const GameService = require('../services/GameService');
const { config } = require('../config/config');
const gameController = require('../controllers/gameController');

module.exports = function init(io, logger) {
  const nsp = io.of('/ludo');
  
  // Event versioning: add timestamp and sequence to prevent stale events
  let eventSequence = 0;
  function enrichEventPayload(payload) {
    return { ...payload, timestamp: Date.now(), seq: ++eventSequence };
  }

  const roomToGame = new Map(); // roomId -> gameId
  const activeByUser = new Map(); // userId -> socketId
  const userLastRoom = new Map(); // userId -> roomId
  const roomRegistry = new Map(); // roomId -> Set<userId>
  const opLock = new Map(); // userId -> Promise chain
  const roomLock = new Map(); // roomId -> Promise chain

  function runExclusive(userId, fn) {
    const prev = opLock.get(userId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn).finally(() => {
      if (opLock.get(userId) === next) opLock.delete(userId);
    });
    opLock.set(userId, next);
    return next;
  }

  function runRoomExclusive(roomId, fn) {
    const prev = roomLock.get(roomId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn).finally(() => {
      if (roomLock.get(roomId) === next) roomLock.delete(roomId);
    });
    roomLock.set(roomId, next);
    return next;
  }

  // Auth guard
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
    const userId = socket.user?.userId;

    // Single active socket
    try {
      const prevId = activeByUser.get(userId);
      if (prevId && prevId !== socket.id) {
        const prevSock = nsp.sockets.get(prevId);
        if (prevSock) prevSock.disconnect(true);
      }
      activeByUser.set(userId, socket.id);
      socket.join(`user:${userId}`);
    } catch (_) {}

    // -------------------- ROOM CREATE --------------------
    async function handleCreate(payload, cb) {
      try {
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        logger.info('socket:event:receive', { event: 'room|session:create', socketId: socket.id, userId, payload });

        const room = await createRoom({ ...payload, creatorUserId: userId, logger });

        if (!room || !room.roomId) {
          logger.error('room:create_failed', { socketId: socket.id, userId, payload });
          return cb && cb({ ok: false, message: 'Room creation failed' });
        }

        try {
          await socket.join(room.roomId);
        } catch (joinErr) {
          logger.error('socket:join_room_failed', { roomId: room.roomId, socketId: socket.id, error: joinErr.message });
          return cb && cb({ ok: false, message: 'Failed to join newly created room' });
        }

        // Track presence for creator
        userLastRoom.set(userId, room.roomId);
        if (!roomRegistry.has(room.roomId)) roomRegistry.set(room.roomId, new Set());
        roomRegistry.get(room.roomId).add(userId);

        const createPayload = enrichEventPayload(room);
        logger.info('socket:event:emit', { event: 'room:create', roomId: room.roomId, players: room.players?.length, seq: createPayload.seq });
        nsp.emit('room:create', createPayload);
        
        // Emit room:update to the room itself
        const updatePayload = enrichEventPayload(room);
        logger.info('socket:event:emit', { event: 'room:update', roomId: room.roomId, players: room.players?.length, seq: updatePayload.seq });
        nsp.to(room.roomId).emit('room:update', updatePayload);

        // Check if room is full immediately (e.g., single-player or auto-fill)
        if (room.status === 'full') {
          await runRoomExclusive(room.roomId, async () => {
            const fullPayload = enrichEventPayload(room);
            logger.info('socket:event:emit', { event: 'room:full', roomId: room.roomId, seq: fullPayload.seq });
            nsp.to(room.roomId).emit('room:full', fullPayload);
            const startedRoom = await startGameIfFull({ roomId: room.roomId, logger });
            if (startedRoom && startedRoom.roomId) {
              const game = await gameController.handleStartGame(startedRoom.roomId, logger);
              roomToGame.set(startedRoom.roomId, game.gameId);
              const startPayload = enrichEventPayload({ roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, players: game.players });
              logger.info('socket:event:emit', { event: 'game:start', roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, seq: startPayload.seq });
              nsp.to(room.roomId).emit('game:start', startPayload);
            }
          });
        }

        cb && cb({ ok: true, room });
      } catch (err) {
        logger.error('socket:event:error', { event: 'room|session:create', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    }

    socket.on('session:create', handleCreate);
    socket.on('room:create', handleCreate);

    // -------------------- ROOM JOIN --------------------
    async function handleJoin(payload, cb) {
      try {
        const { roomId, autoCreate, mode = 'Classic', stake = 10, maxPlayers = 2 } = payload || {};
        const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
        logger.info('socket:event:receive', { event: 'room|session:join', socketId: socket.id, userId, roomId });
        await runExclusive(userId, async () => {
          // Verify room existence or optionally auto-create
          let found = null;
          try {
            if (require('../services/RoomService').getRoom) {
              found = await require('../services/RoomService').getRoom(roomId);
            } else {
              // Fallback: search via listRooms
              const list = await listRooms({ status: 'waiting' });
              found = (list || []).find((r) => r.roomId === roomId) || null;
            }
          } catch (_e) {}
          if (!found && autoCreate) {
            try {
              logger.info('session:join:autoCreate', { userId, mode, stake, maxPlayers });
              found = await createRoom({ creatorUserId: userId, mode, stake, maxPlayers, logger });
              if (found && found.roomId) {
                logger.info('session:join:autoCreate:ok', { roomId: found.roomId, userId });
              }
            } catch (e) {
              logger.error('session:join:autoCreate:error', { error: e.message, userId });
            }
          }
          if (!found) {
            logger.warn('session:join:no_room', { roomId, userId });
            try { nsp.to(socket.id).emit('room:error', { ok: false, code: 'E_NO_ROOM', roomId }); } catch (_) {}
            return cb && cb({ ok: false, code: 'E_NO_ROOM', message: 'Room not found', roomId });
          }

          // Attempt to join via service; treat duplicate/already-joined as idempotent success
          let room;
          try {
            room = await joinRoom({ roomId: found.roomId || roomId, userId, logger });
          } catch (e) {
            const msg = String(e && e.message || e);
            if (/(already|exists|joined)/i.test(msg)) {
              room = found || { roomId };
            } else {
              throw e;
            }
          }
          if (!room) {
            logger.warn('session:join:no_room', { roomId, userId });
            try { nsp.to(socket.id).emit('room:error', { ok: false, code: 'E_NO_ROOM', roomId }); } catch (_) {}
            return cb && cb({ ok: false, code: 'E_ROOM_NOT_AVAILABLE', message: 'Room not available', roomId });
          }
          socket.join(room.roomId);
          // Presence bookkeeping
          userLastRoom.set(userId, room.roomId);
          if (!roomRegistry.has(room.roomId)) roomRegistry.set(room.roomId, new Set());
          roomRegistry.get(room.roomId).add(userId);
          const updatePayload = enrichEventPayload(room);
          logger.info('socket:event:emit', { event: 'room:update', roomId: room.roomId, players: room.players?.length, seq: updatePayload.seq });
          nsp.to(room.roomId).emit('room:update', updatePayload);
          logger.info('session:join:joined', { userId, roomId: room.roomId });
          if (room.status === 'full') {
            await runRoomExclusive(room.roomId, async () => {
              const fullPayload = enrichEventPayload(room);
              logger.info('socket:event:emit', { event: 'room:full', roomId: room.roomId, seq: fullPayload.seq });
              nsp.to(room.roomId).emit('room:full', fullPayload);

              const startedRoom = await startGameIfFull({ roomId: room.roomId, logger });
              if (startedRoom && startedRoom.roomId) {
                const game = await gameController.handleStartGame(startedRoom.roomId, logger);
                roomToGame.set(startedRoom.roomId, game.gameId);
                const startPayload = enrichEventPayload({ roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, players: game.players });
                logger.info('socket:event:emit', { event: 'game:start', roomId: startedRoom.roomId, gameId: game.gameId, turnIndex: game.turnIndex, seq: startPayload.seq });
                nsp.to(room.roomId).emit('game:start', startPayload);
              }
            });
          }

          cb && cb({ ok: true, room });
        });

      } catch (err) {
        logger.error('socket:event:error', { event: 'room|session:join', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, code: 'E_JOIN_FAILED', message: err.message });
      }
    }

    socket.on('session:join', handleJoin);
    socket.on('room:join', handleJoin);

    // -------------------- ROOMS LIST --------------------
    socket.on('rooms:list', async (_payload, cb) => {
      try {
        logger.info('socket:event:receive', { event: 'rooms:list', socketId: socket.id });
        const rooms = await listRooms({ status: 'waiting' });
        const enriched = rooms.map((r) => ({ ...r, online: roomRegistry.get(r.roomId)?.size || 0 }));
        logger.info('socket:event:ack', { event: 'rooms:list', count: enriched.length, to: socket.id });
        cb && cb({ ok: true, rooms: enriched });
      } catch (err) {
        logger.error('socket:event:error', { event: 'rooms:list', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, rooms: [] });
      }
    });

    // -------------------- CHAT & REACTION --------------------
    socket.on('chat:message', async ({ roomId, message }, cb) => {
      try {
        const userId = socket.user?.userId;
        if (!roomId || !message) throw new Error('roomId and message required');
        const payload = enrichEventPayload({ roomId, userId, message, at: new Date().toISOString() });
        nsp.to(roomId).emit('chat:message', payload);
        cb && cb({ ok: true });
      } catch (err) {
        logger.error('socket:event:error', { event: 'chat:message', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    });

    socket.on('reaction:emoji', async ({ roomId, emoji }, cb) => {
      try {
        const userId = socket.user?.userId;
        if (!roomId || !emoji) throw new Error('roomId and emoji required');
        const payload = enrichEventPayload({ roomId, userId, emoji, at: new Date().toISOString() });
        nsp.to(roomId).emit('reaction:emoji', payload);
        cb && cb({ ok: true });
      } catch (err) {
        logger.error('socket:event:error', { event: 'reaction:emoji', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, message: err.message });
      }
    });

    // -------------------- GAME RECONNECT --------------------
    socket.on('game:reconnect', async ({ roomId }, cb) => {
      try {
        const userId = socket.user?.userId;
        await runExclusive(userId, async () => {
          const targetRoom = roomId || userLastRoom.get(userId);
          if (!targetRoom) return cb && cb({ ok: false, code: 'E_NO_PRIOR_ROOM', message: 'roomId required' });

          try { await socket.join(targetRoom); } catch (_) {}
          userLastRoom.set(userId, targetRoom);
          if (!roomRegistry.has(targetRoom)) roomRegistry.set(targetRoom, new Set());
          roomRegistry.get(targetRoom).add(userId);

          let gameId = roomToGame.get(targetRoom);
          if (!gameId) {
            gameId = await gameController.findPlayingGameIdByRoom(targetRoom);
            if (gameId) roomToGame.set(targetRoom, gameId);
          }

          if (gameId) {
            const game = await gameController.getGameDocument(gameId);
            if (game) {
              const startPayload = enrichEventPayload({ roomId: targetRoom, gameId, turnIndex: game.turnIndex, players: game.players });
              nsp.to(socket.id).emit('game:start', startPayload);
              logger.info('game:reconnect:snapshot', { userId, roomId: targetRoom, gameId, seq: startPayload.seq });
              if (game.pendingDiceValue != null) {
                const dicePayload = enrichEventPayload({ roomId: targetRoom, gameId, value: game.pendingDiceValue, skipped: false, turnIndex: game.turnIndex, nextTurnIndex: game.turnIndex });
                nsp.to(socket.id).emit('dice:result', dicePayload);
                logger.info('game:reconnect:pending_dice', { userId, value: game.pendingDiceValue, seq: dicePayload.seq });
              }
            }
          }

          cb && cb({ ok: true, roomId: targetRoom, gameId });
        });
      } catch (err) {
        logger.error('socket:event:error', { event: 'game:reconnect', error: err.message, socketId: socket.id });
        cb && cb({ ok: false, code: 'E_RECONNECT_FAILED', message: err.message });
      }
    });

    // -------------------- ADDITIONAL GAMEPLAY EVENTS --------------------
    socket.on('game:get', async (payload, cb) => {
      try {
        const { roomId } = payload || {};
        if (!roomId) return cb && cb({ ok: false, message: 'roomId required' });
        
        const game = await gameController.getGameByRoomId(roomId);
        if (!game) return cb && cb({ ok: false, message: 'Game not found' });
        
        logger.info('socket:event:ack', { event: 'game:get', roomId, gameId: game.gameId });
        cb && cb({ ok: true, game: game.toObject ? game.toObject() : game });
      } catch (err) {
        logger.error('socket:event:error', { event: 'game:get', error: err.message });
        cb && cb({ ok: false, message: err.message });
      }
    });
    
    socket.on('token:move', async (payload, cb) => {
      try { await GameService.handleTokenMove(socket, payload, nsp, logger, cb, enrichEventPayload); } catch (err) { logger.error(err); cb && cb({ ok: false, message: err.message }); }
    });

    socket.on('dice:roll', async (payload, cb) => {
      try { await GameService.handleDiceRoll(socket, payload, nsp, logger, cb, enrichEventPayload); } catch (err) { logger.error(err); cb && cb({ ok: false, message: err.message }); }
    });

    socket.on('disconnect', () => {
      logger.info('socket:disconnected', { socketId: socket.id, userId });
      activeByUser.delete(userId);
      const lastRoom = userLastRoom.get(userId);
      if (lastRoom && roomRegistry.has(lastRoom)) {
        roomRegistry.get(lastRoom).delete(userId);
      }
    });

  });
};
