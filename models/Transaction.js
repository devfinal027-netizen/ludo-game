'use strict';

const mongoose = require('mongoose');

const TransactionType = Object.freeze({
  REGISTRATION_BONUS: 'REGISTRATION_BONUS',
  TRANSFER: 'TRANSFER',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  GAME_STAKE: 'GAME_STAKE',
  GAME_PAYOUT: 'GAME_PAYOUT',
});

const TransactionStatus = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: Object.values(TransactionType), required: true },
    description: { type: String },
    reference: { type: String, unique: true, index: true },
    status: { type: String, enum: Object.values(TransactionStatus), default: TransactionStatus.PENDING },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

TransactionSchema.index({ userId: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = { Transaction, TransactionType, TransactionStatus };
