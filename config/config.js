'use strict';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ludo',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  commissionPercent: Number(process.env.COMMISSION_PERCENT || 0.2),
  roomTimeoutSeconds: Number(process.env.ROOM_TIMEOUT_SECONDS || 300),
  allowedStakes: (process.env.ALLOWED_STAKES || '10,50,100')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => !Number.isNaN(v)),
};

module.exports = { config };
