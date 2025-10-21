const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    unique: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  stakeValue: {
    type: Number,
    required: true
  },
  mode: {
    type: String,
    enum: ['Classic', 'Quick'],
    required: true
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    playerIndex: Number,
    tokens: [{
      tokenId: Number,
      position: Number,
      isHome: Boolean
    }]
  }],
  turnIndex: {
    type: Number,
    default: 0
  },
  currentTurnStartedAt: Date,
  diceRolls: [{
    playerId: mongoose.Schema.Types.ObjectId,
    value: Number,
    timestamp: Date
  }],
  moves: [{
    playerId: mongoose.Schema.Types.ObjectId,
    tokenId: Number,
    from: Number,
    to: Number,
    timestamp: Date
  }],
  status: {
    type: String,
    enum: ['playing', 'ended', 'aborted'],
    default: 'playing'
  },
  winnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  payout: {
    totalPot: Number,
    commission: Number,
    winnerPayout: Number
  }
}, {
  timestamps: true
});

gameSchema.index({ gameId: 1 });
gameSchema.index({ roomId: 1 });

module.exports = mongoose.model('Game', gameSchema);
