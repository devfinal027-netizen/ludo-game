'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const { Game } = require('../models/Game');
const { startGameSession, rollDice, applyMove, endGameSession } = require('../services/GameService');

const router = express.Router();

// Get game by id
router.get('/:gameId', async (req, res, next) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
});

// Get latest game by room
router.get('/room/:roomId/current', async (req, res, next) => {
  try {
    const game = await Game.findOne({ roomId: req.params.roomId }).sort({ createdAt: -1 }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
});

// Start game from room
router.post('/start', validate(schemas.gameStart), async (req, res, next) => {
  try {
    const { roomId } = req.validated;
    const game = await startGameSession(roomId, req.app.get('logger'));
    res.json(game);
  } catch (err) {
    next(err);
  }
});

// Roll dice
router.post('/dice/roll', validate(schemas.diceRoll), async (req, res, next) => {
  try {
    const { gameId } = req.validated;
    const userId = req.user.userId;
    const result = await rollDice(userId, gameId, req.app.get('logger'));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Apply a move
router.post('/token/move', validate(schemas.tokenMove), async (req, res, next) => {
  try {
    const { gameId, tokenIndex, steps } = req.validated;
    const userId = req.user.userId;
    const outcome = await applyMove(userId, gameId, Number(tokenIndex), Number(steps), req.app.get('logger'));
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

// End a game session
router.post('/end', validate(schemas.gameEnd), async (req, res, next) => {
  try {
    const { gameId, winnerUserId } = req.validated;
    const game = await endGameSession(gameId, winnerUserId || null, req.app.get('logger'));
    res.json(game);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
