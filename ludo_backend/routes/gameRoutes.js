'use strict';

const express = require('express');
const router = express.Router();

router.get('/:gameId', (req, res) => {
  res.json({ gameId: req.params.gameId, status: 'not_implemented' });
});

module.exports = router;
