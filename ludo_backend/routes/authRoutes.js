'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const { verifyTelegramInitData, parseInitData } = require('../utils/telegram');
const { config } = require('../config/config');

const router = express.Router();

router.post('/telegram', validate(schemas.authTelegram), (req, res) => {
  const { initData } = req.validated;
  const valid = verifyTelegramInitData(initData);
  if (!valid) return res.status(401).json({ message: 'Invalid Telegram data' });
  const data = parseInitData(initData);
  const userId = data['user.id'] || data['id'] || 'dev-user';
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '24h' });
  res.json({ token });
});

module.exports = router;
