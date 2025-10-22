'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, index: true },
    fullName: { type: String },
    phone: { type: String, unique: true, sparse: true, index: true },
    referralCode: { type: String, unique: true, index: true },
    invitedBy: { type: String },
    role: { type: String, enum: ['user', 'agent', 'admin'], default: 'user', index: true },
    wallet: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    password: { type: String },
  },
  { timestamps: true },
);

UserSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.verifyPassword = async function verifyPassword(candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = { User };
