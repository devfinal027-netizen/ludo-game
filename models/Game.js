'use strict';

const mongoose = require('mongoose');

// Token state representation:
// - base: token not on board yet
// - track: token is on the main circular track (ring of 52 squares)
//   represented via stepsFromStart in [0..51]
// - homeStretch: token is in the player's final stretch (after completing a full lap)
//   represented via stepsFromStart in [52..57] (homeLength = 6 -> last index 57)
// - home: token has reached final home position and is no longer movable

const TokenSchema = new mongoose.Schema(
  {
    tokenIndex: { type: Number, required: true },
    state: { type: String, enum: ['base', 'track', 'homeStretch', 'home'], required: true, default: 'base' },
    stepsFromStart: { type: Number, default: -1 }, // -1 for base, 0..51 track, 52..57 homeStretch, 58 ignored
  },
  { _id: false },
);

const PlayerInGameSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    color: { type: String, enum: ['red', 'green', 'yellow', 'blue'], required: true },
    tokens: { type: [TokenSchema], default: [] },
  },
  { _id: false },
);

const DiceLogSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true },
    userId: { type: String, required: true },
    value: { type: Number, required: true, min: 1, max: 6 },
    turnIndex: { type: Number, required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const MoveLogSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true },
    userId: { type: String, required: true },
    tokenIndex: { type: Number, required: true },
    steps: { type: Number, required: true },
    from: {
      state: { type: String, required: true },
      stepsFromStart: { type: Number },
    },
    to: {
      state: { type: String, required: true },
      stepsFromStart: { type: Number },
    },
    captures: {
      type: [
        new mongoose.Schema(
          {
            victimUserId: { type: String, required: true },
            tokenIndex: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    turnIndex: { type: Number, required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const GameSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, unique: true, index: true },
    roomId: { type: String, required: true, index: true },
    stake: { type: Number, required: true },
    mode: { type: String, enum: ['Classic', 'Quick'], required: true },

    players: { type: [PlayerInGameSchema], default: [] },

    turnIndex: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['playing', 'ended', 'aborted'], required: true, default: 'playing', index: true },
    winnerUserId: { type: String },

    // RNG auditability
    rngSeed: { type: String, required: true },
    diceSeq: { type: Number, required: true, default: 0 },
    moveSeq: { type: Number, required: true, default: 0 },

    // Pending dice that must be consumed by a move; null if none
    pendingDiceValue: { type: Number, min: 1, max: 6 },
    pendingDicePlayerIndex: { type: Number },

    // Logs are append-only
    diceLogs: { type: [DiceLogSchema], default: [] },
    moveLogs: { type: [MoveLogSchema], default: [] },
  },
  { timestamps: true },
);

GameSchema.index({ roomId: 1, status: 1, createdAt: -1 });

const Game = mongoose.model('Game', GameSchema);

module.exports = { Game };
