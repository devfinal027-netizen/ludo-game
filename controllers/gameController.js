'use strict';

const { Game } = require('../models/Game');
const { startGameSession, rollDice, applyMove, endGameSession } = require('../services/GameService');

// ----------------------
// Express route handlers
// ----------------------

async function getGame(req, res, next) {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
}

async function getCurrentByRoom(req, res, next) {
  try {
    const game = await Game.findOne({ roomId: req.params.roomId }).sort({ createdAt: -1 }).lean();
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json(game);
  } catch (err) {
    next(err);
  }
}

async function start(req, res, next) {
  try {
    const { roomId } = req.validated;
    const logger = req.app.get('logger');
    logger && logger.info('http:games:start', { roomId, userId: req.user.userId });
    const game = await startGameSession(roomId, logger);
    res.json(game);
  } catch (err) {
    next(err);
  }
}

async function roll(req, res, next) {
  try {
    const { gameId } = req.validated;
    const userId = req.user.userId;
    const logger = req.app.get('logger');
    logger && logger.info('http:games:roll', { gameId, userId });
    const result = await rollDice(userId, gameId, logger);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function move(req, res, next) {
  try {
    const { gameId, tokenIndex, steps } = req.validated;
    const userId = req.user.userId;
    const logger = req.app.get('logger');
    logger && logger.info('http:games:move', { gameId, userId, tokenIndex: Number(tokenIndex), steps: Number(steps) });
    const outcome = await applyMove(userId, gameId, Number(tokenIndex), Number(steps), logger);
    res.json(outcome);
  } catch (err) {
    next(err);
  }
}

async function end(req, res, next) {
  try {
    const { gameId, winnerUserId } = req.validated;
    const logger = req.app.get('logger');
    logger && logger.info('http:games:end', { gameId, winnerUserId: winnerUserId || null, userId: req.user.userId });
    const game = await endGameSession(gameId, winnerUserId || null, logger);
    res.json(game);
  } catch (err) {
    next(err);
  }
}

// ----------------------
// Reusable controller methods (for Socket.IO and internal calls)
// ----------------------

async function handleStartGame(roomId, logger) {
  return await startGameSession(roomId, logger);
}

async function handleDiceRoll(gameId, userId, logger) {
  return await rollDice(userId, gameId, logger);
}

async function handleTokenMove(gameId, tokenIndex, steps, userId, logger) {
  return await applyMove(userId, gameId, Number(tokenIndex), Number(steps), logger);
}

async function handleEndGame(gameId, winnerUserId, logger) {
  return await endGameSession(gameId, winnerUserId || null, logger);
}

async function findPlayingGameIdByRoom(roomId) {
  const existing = await Game.findOne({ roomId, status: 'playing' }, { gameId: 1 }).lean();
  return existing ? existing.gameId : null;
}

async function getGameDocument(gameId) {
  return await Game.findOne({ gameId }).lean();
}

async function getLatestGameDocumentByRoom(roomId) {
  return await Game.findOne({ roomId }).sort({ createdAt: -1 }).lean();
}

module.exports = {
  // Express handlers
  getGame,
  getCurrentByRoom,
  start,
  roll,
  move,
  end,
  // Reusable methods
  handleStartGame,
  handleDiceRoll,
  handleTokenMove,
  handleEndGame,
  findPlayingGameIdByRoom,
  getGameDocument,
  getLatestGameDocumentByRoom,
};
