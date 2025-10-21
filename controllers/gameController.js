'use strict';

const express = require('express');
const { Game } = require('../models/Game');
const router = express.Router();

router.get('/:gameId', async (req, res, next) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
});

router.get('/room/:roomId/current', async (req, res, next) => {
  try {
    const game = await Game.findOne({ roomId: req.params.roomId }).sort({ createdAt: -1 }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
