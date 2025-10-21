'use strict';

const { v4: uuid } = require('uuid');
const { Room } = require('../models/Room');
const { config } = require('../config/config');

// In-memory timeouts registry: roomId -> timeoutId
const waitingTimeouts = new Map();

async function createRoom({ stake, mode, maxPlayers, creatorUserId, logger }) {
  const roomId = uuid();
  const now = new Date();
  const room = await Room.create({
    roomId,
    stake,
    mode,
    maxPlayers,
    status: 'waiting',
    players: [
      { userId: String(creatorUserId), joinedAt: now, status: 'joined' },
    ],
  });

  // schedule timeout
  scheduleWaitingTimeout(room.roomId, logger);
  logger && logger.info('room:create', { roomId: room.roomId, stake, mode, maxPlayers });
  return room.toObject();
}

async function joinRoom({ roomId, userId, logger }) {
  const room = await Room.findOne({ roomId });
  if (!room) return null;
  if (room.status !== 'waiting') return null;
  const exists = room.players.some((p) => String(p.userId) === String(userId));
  if (!exists) {
    room.players.push({ userId: String(userId), joinedAt: new Date(), status: 'joined' });
  }
  if (room.players.length >= room.maxPlayers) room.status = 'full';
  await room.save();

  logger && logger.info('room:join', { roomId, userId, count: room.players.length });
  if (room.status === 'full') {
    clearWaitingTimeout(roomId);
  }
  return room.toObject();
}

async function startGameIfFull({ roomId, onStart, logger }) {
  const room = await Room.findOne({ roomId });
  if (!room) return null;
  if (room.status !== 'full') return null;
  room.status = 'playing';
  room.startedAt = new Date();
  await room.save();
  logger && logger.info('room:startGame', { roomId });
  onStart && onStart(room.toObject());
  return room.toObject();
}

async function cancelRoom({ roomId, reason, logger, onCancel }) {
  const room = await Room.findOne({ roomId });
  if (!room) return null;
  if (room.status === 'waiting' || room.status === 'full') {
    room.status = 'cancelled';
    room.endedAt = new Date();
    await room.save();
    clearWaitingTimeout(roomId);
    logger && logger.info('room:cancel', { roomId, reason });
    onCancel && onCancel(room.toObject());
  }
  return room.toObject();
}

function scheduleWaitingTimeout(roomId, logger) {
  clearWaitingTimeout(roomId);
  const ttl = Math.max(5, Number(config.roomTimeoutSeconds || 300));
  const timeoutId = setTimeout(async () => {
    try {
      await cancelRoom({ roomId, reason: 'timeout', logger });
    } catch (err) {
      logger && logger.error('room:timeoutError', { roomId, err: String(err) });
    }
  }, ttl * 1000);
  waitingTimeouts.set(roomId, timeoutId);
}

function clearWaitingTimeout(roomId) {
  const t = waitingTimeouts.get(roomId);
  if (t) clearTimeout(t);
  waitingTimeouts.delete(roomId);
}

module.exports = {
  createRoom,
  joinRoom,
  startGameIfFull,
  cancelRoom,
  scheduleWaitingTimeout,
  clearWaitingTimeout,
};
