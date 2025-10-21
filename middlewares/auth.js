'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config/config');

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (required) return res.status(401).json({ message: 'Missing token' });
      req.user = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { userId: payload.userId, roles: payload.roles || [] };
      return next();
    } catch (_err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

module.exports = { auth };
