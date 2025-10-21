'use strict';

async function health(_req, res, _next) {
  res.json({ ok: true });
}

module.exports = { health };
