'use strict';

const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    joinedAt: { type: Date, required: true, default: () => new Date() },
    status: {
      type: String,
      enum: ['joined', 'left'],
      required: true,
      default: 'joined',
    },
  },
  { _id: false },
);

const RoomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    stake: { type: Number, required: true },
    mode: { type: String, enum: ['Classic', 'Quick'], required: true },
    maxPlayers: { type: Number, enum: [2, 4], required: true },
    status: {
      type: String,
      enum: ['waiting', 'playing', 'ended', 'cancelled'],
      required: true,
      default: 'waiting',
      index: true,
    },
    players: { type: [PlayerSchema], default: [] },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

RoomSchema.index({ status: 1, stake: 1, mode: 1, createdAt: -1 });

const Room = mongoose.model('Room', RoomSchema);

module.exports = { Room };
