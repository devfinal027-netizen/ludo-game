'use strict';

const jwt = require('jsonwebtoken');
const { verifyTelegramInitData, parseInitData } = require('../utils/telegram');
const { config } = require('../config/config');

async function telegram(req, res, next) {
  try {
    const { initData } = req.validated;
    const valid = verifyTelegramInitData(initData);
    if (!valid) return res.status(401).json({ message: 'Invalid Telegram data' });
    const data = parseInitData(initData);
    const userId = data['user.id'] || data['id'] || 'dev-user';
    const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    next(err);
  }
}

module.exports = { telegram };
