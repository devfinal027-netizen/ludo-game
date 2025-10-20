'use strict';

const { v4: uuid } = require('uuid');

const inMemoryRooms = new Map();

function createRoom({ stake, mode, maxPlayers, creatorUserId }) {
  const roomId = uuid();
  const room = {
    roomId,
    stake,
    mode,
    maxPlayers,
    status: 'waiting',
    players: [{ userId: creatorUserId, joinedAt: new Date().toISOString(), status: 'joined' }],
    createdAt: new Date().toISOString(),
  };
  inMemoryRooms.set(roomId, room);
  return room;
}

function joinRoom({ roomId, userId }) {
  const room = inMemoryRooms.get(roomId);
  if (!room) return null;
  if (room.status !== 'waiting') return null;
  const already = room.players.some((p) => p.userId === userId);
  if (!already) room.players.push({ userId, joinedAt: new Date().toISOString(), status: 'joined' });
  if (room.players.length >= room.maxPlayers) room.status = 'full';
  return room;
}

function listRooms() {
  return Array.from(inMemoryRooms.values());
}

module.exports = { createRoom, joinRoom, listRooms };
