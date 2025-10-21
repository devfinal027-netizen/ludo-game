'use strict';

async function getMe(req, res, _next) {
  res.json({ userId: req.user.userId });
}

module.exports = { getMe };
