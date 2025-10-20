'use strict';

async function getOrCreateUserByTelegramId(_telegramId) {
  return { userId: String(_telegramId || 'dev-user') };
}

module.exports = { getOrCreateUserByTelegramId };
