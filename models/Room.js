const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  creatorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  maxPlayers: {
    type: Number,
    enum: [2, 4],
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'ended', 'cancelled'],
    default: 'waiting'
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    playerIndex: Number,
    status: {
      type: String,
      enum: ['joined', 'playing', 'disconnected', 'left'],
      default: 'joined'
    }
  }],
  startedAt: Date,
  endedAt: Date
}, {
  timestamps: true
});

roomSchema.index({ status: 1, stakeValue: 1, mode: 1 });
roomSchema.index({ roomId: 1 });

module.exports = mongoose.model('Room', roomSchema);
