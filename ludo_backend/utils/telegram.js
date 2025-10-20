'use strict';

const crypto = require('crypto');
const { config } = require('../config/config');

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const data = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }
  return data;
}

function verifyTelegramInitData(initData) {
  if (!config.telegramBotToken) return false;
  const data = parseInitData(initData);
  const hash = data.hash;
  delete data.hash;

  const sorted = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegramBotToken)
    .digest();
  const signature = crypto.createHmac('sha256', secretKey).update(sorted).digest('hex');

  return signature === hash;
}

module.exports = { parseInitData, verifyTelegramInitData };
