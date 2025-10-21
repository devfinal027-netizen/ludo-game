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
      // Normalize payload: accept either userId or id, and roles or role
      const userId = payload.userId || payload.id || payload._id || null;
      const roles = Array.isArray(payload.roles)
        ? payload.roles
        : payload.role
          ? [payload.role]
          : [];
      req.user = { userId, id: userId, roles };
      return next();
    } catch (_err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { auth, requireRole };
