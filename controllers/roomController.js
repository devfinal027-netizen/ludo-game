'use strict';

const { createRoom, joinRoom, listRooms } = require('../services/RoomService');

async function create(req, res, next) {
  try {
    const { stake, mode, maxPlayers } = req.validated;
    const userId = req.user.userId;
    const logger = req.app.get('logger');
    logger && logger.info('http:rooms:create', { userId, stake, mode, maxPlayers });
    const room = await createRoom({ stake, mode, maxPlayers, creatorUserId: userId, logger });
    res.json(room);
  } catch (err) {
    next(err);
  }
}

async function join(req, res, next) {
  try {
    const { roomId } = req.validated;
    const userId = req.user.userId;
    const logger = req.app.get('logger');
    logger && logger.info('http:rooms:join', { userId, roomId });
    const room = await joinRoom({ roomId, userId, logger });
    if (!room) return res.status(400).json({ message: 'Room not available' });
    res.json(room);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, stake, mode } = req.query;
    const logger = req.app.get('logger');
    logger && logger.info('http:rooms:list', { status, stake, mode });
    const rooms = await listRooms({ status, stake, mode });
    res.json(rooms);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, join, list };
