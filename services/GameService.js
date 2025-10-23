'use strict';

const { v4: uuid } = require('uuid');
const { Game } = require('../models/Game');
const { Room } = require('../models/Room');
const { createDeterministicRng, generateGameSeed } = require('../utils/rng');
const { config } = require('../config/config');
const { validateMove: validateByRules, anyLegalToken } = require('./validator');

// Core Ludo parameters (simple baseline, Classic/Quick differ by tokenCount)
const BOARD_TRACK_LENGTH = 52; // ring
const HOME_STRETCH_LENGTH = 6; // 6 steps to home after completing ring
const DEFAULT_TOKENS_CLASSIC = 4;
const DEFAULT_TOKENS_QUICK = 2;

function initialTokens(count) {
  const tokens = [];
  for (let i = 0; i < count; i++) {
    tokens.push({ tokenIndex: i, state: 'base', stepsFromStart: -1 });
  }
  return tokens;
}

function getPlayerCountForMode(mode) {
  return mode === 'Quick' ? DEFAULT_TOKENS_QUICK : DEFAULT_TOKENS_CLASSIC;
}

function nextTurnIndex(current, playersLen) {
  return (current + 1) % playersLen;
}

function hasAnyLegalMove(game, playerIndex, diceValue) {
  return anyLegalToken(game, playerIndex, diceValue, {
    allowBlocking: true,
    extraTurnOnSix: true,
  });
}

function allTokensHome(player) {
  return player.tokens.every((t) => t.state === 'home');
}

function computeWinnerIfAny(game) {
  // Classic: all tokens home
  // Quick: configured number of tokens home (default 2)
  const quickTarget = Number(config.quickWinTokens || DEFAULT_TOKENS_QUICK);
  for (const p of game.players) {
    const tokensHome = p.tokens.filter((t) => t.state === 'home').length;
    if (game.mode === 'Quick') {
      if (tokensHome >= quickTarget) return p.userId;
    } else {
      if (tokensHome === p.tokens.length && p.tokens.length > 0) return p.userId;
    }
  }
  return null;
}

async function startGameSession(roomId, logger) {
  const room = await Room.findOne({ roomId });
  if (!room) throw new Error('Room not found');
  if (room.status !== 'playing' && room.status !== 'full') throw new Error('Room not ready');

  const gameId = uuid();
  const tokenCount = getPlayerCountForMode(room.mode);
  const colors = ['red', 'green', 'yellow', 'blue'];
  const players = room.players.map((p, idx) => ({
    userId: String(p.userId),
    color: colors[idx % colors.length],
    tokens: initialTokens(tokenCount),
  }));

  const rngSeed = generateGameSeed();

  const game = await Game.create({
    gameId,
    roomId,
    stake: room.stake,
    mode: room.mode,
    players,
    turnIndex: 0,
    status: 'playing',
    rngSeed,
    diceSeq: 0,
    moveSeq: 0,
    pendingDiceValue: undefined,
    pendingDicePlayerIndex: undefined,
  });

  logger && logger.info('game:start', { roomId, gameId });
  return game.toObject();
}

async function rollDice(userId, gameId, logger) {
  const game = await Game.findOne({ gameId });
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error('Game not active');

  const currentPlayer = game.players[game.turnIndex];
  if (String(currentPlayer.userId) !== String(userId)) throw new Error('Not your turn');
  if (game.pendingDiceValue) throw new Error('Pending move exists');

  const rng = createDeterministicRng(game.rngSeed + ':' + (game.diceSeq + 1));
  const value = rng.rollDie();
  game.diceSeq += 1;
  game.pendingDiceValue = value;
  game.pendingDicePlayerIndex = game.turnIndex;
  game.diceLogs.push({ seq: game.diceSeq, userId: String(userId), value, turnIndex: game.turnIndex, at: new Date() });

  // Auto-skip if no legal move exists
  let skipped = false;
  let nextIdx = game.turnIndex;
  if (!hasAnyLegalMove(game, game.turnIndex, value)) {
    skipped = true;
    // consume dice and rotate turn
    game.pendingDiceValue = undefined;
    game.pendingDicePlayerIndex = undefined;
    nextIdx = nextTurnIndex(game.turnIndex, game.players.length);
    game.turnIndex = nextIdx;
  }

  await game.save();

  logger && logger.info('dice:result', { gameId, userId, value, skipped });
  return { value, turnIndex: game.turnIndex, skipped, nextTurnIndex: nextIdx };
}

function applyMoveOnToken(token, diceValue) {
  // Simplified ruleset sufficient for acceptance tests:
  // - From base: need 6 to release -> goes to stepsFromStart = 0 (track)
  // - From track: advance by diceValue; if exceeding BOARD_TRACK_LENGTH - 1, enter homeStretch
  // - From homeStretch: advance; must land exactly on final home index (BOARD_TRACK_LENGTH + HOME_STRETCH_LENGTH)

  if (token.state === 'base') {
    if (diceValue !== 6) throw new Error('Cannot release without rolling 6');
    token.state = 'track';
    token.stepsFromStart = 0;
    return { from: { state: 'base', stepsFromStart: -1 }, to: { state: 'track', stepsFromStart: 0 } };
  }

  if (token.state === 'track') {
    const next = token.stepsFromStart + diceValue;
    if (next < BOARD_TRACK_LENGTH) {
      const prev = token.stepsFromStart;
      token.stepsFromStart = next;
      return { from: { state: 'track', stepsFromStart: prev }, to: { state: 'track', stepsFromStart: next } };
    }
    // enter home stretch
    const homePos = BOARD_TRACK_LENGTH + (next - (BOARD_TRACK_LENGTH - 1));
    token.state = 'homeStretch';
    token.stepsFromStart = Math.min(homePos, BOARD_TRACK_LENGTH + HOME_STRETCH_LENGTH);
    return {
      from: { state: 'track', stepsFromStart: next - diceValue },
      to: { state: 'homeStretch', stepsFromStart: token.stepsFromStart },
    };
  }

  if (token.state === 'homeStretch') {
    const next = token.stepsFromStart + diceValue;
    const finalHome = BOARD_TRACK_LENGTH + HOME_STRETCH_LENGTH;
    if (next > finalHome) {
      throw new Error('Must land exactly on home');
    }
    if (next === finalHome) {
      const prev = token.stepsFromStart;
      token.state = 'home';
      token.stepsFromStart = next;
      return { from: { state: 'homeStretch', stepsFromStart: prev }, to: { state: 'home', stepsFromStart: next } };
    }
    const prev = token.stepsFromStart;
    token.stepsFromStart = next;
    return { from: { state: 'homeStretch', stepsFromStart: prev }, to: { state: 'homeStretch', stepsFromStart: next } };
  }

  if (token.state === 'home') {
    throw new Error('Token already home');
  }

  throw new Error('Invalid token state');
}

function resolveCaptures(game, moverPlayerIndex, capturesList) {
  // Apply captures received from validator: reset victim tokens to base
  const applied = [];
  for (const c of capturesList || []) {
    const victimPlayer = game.players[c.playerIndex];
    if (!victimPlayer) continue;
    const tok = victimPlayer.tokens.find((t) => Number(t.tokenIndex) === Number(c.tokenIndex));
    if (!tok) continue;
    tok.state = 'base';
    tok.stepsFromStart = -1;
    applied.push({ victimUserId: victimPlayer.userId, tokenIndex: tok.tokenIndex });
  }
  return applied;
}

async function applyMove(userId, gameId, tokenIndex, steps, logger) {
  const game = await Game.findOne({ gameId });
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') throw new Error('Game not active');
  if (game.pendingDiceValue == null) throw new Error('No pending dice');
  if (game.pendingDicePlayerIndex !== game.turnIndex) throw new Error('Turn desync');

  const player = game.players[game.turnIndex];
  if (String(player.userId) !== String(userId)) throw new Error('Not your turn');
  if (steps !== game.pendingDiceValue) throw new Error('Move steps must match dice');

  const token = player.tokens.find((t) => t.tokenIndex === Number(tokenIndex));
  if (!token) throw new Error('Token not found');

  // Validate the selected move using centralized validator
  const result = validateByRules(game.toObject ? game.toObject() : game, game.turnIndex, Number(tokenIndex), Number(steps), {
    allowBlocking: true,
    extraTurnOnSix: true,
  });
  if (!result.legal) throw new Error(result.reason || 'Illegal move');

  // Apply position change
  const from = { state: token.state, stepsFromStart: token.stepsFromStart };
  token.state = result.to.state;
  token.stepsFromStart = result.to.stepsFromStart;

  // Apply captures (reset opponent tokens)
  const capturesApplied = resolveCaptures(game, game.turnIndex, result.captures);

  game.moveSeq += 1;
  game.moveLogs.push({
    seq: game.moveSeq,
    userId: String(userId),
    tokenIndex: Number(tokenIndex),
    steps,
    from,
    to: { state: token.state, stepsFromStart: token.stepsFromStart },
    captures: capturesApplied,
    turnIndex: game.turnIndex,
    at: new Date(),
  });

  // clear pending dice
  const rolledSix = game.pendingDiceValue === 6;
  game.pendingDiceValue = undefined;
  game.pendingDicePlayerIndex = undefined;

  // Winner detection
  const winner = computeWinnerIfAny(game);
  if (winner) {
    game.status = 'ended';
    game.winnerUserId = winner;
    await game.save();
    logger && logger.info('game:end', { gameId, winnerUserId: winner });
    return { ended: true, winnerUserId: winner };
  }

  // Turn rotation: extra turn on 6 (or per validator extraTurn); otherwise normal advance
  const extraTurn = !!(result.extraTurn || rolledSix);
  if (!extraTurn) {
    game.turnIndex = nextTurnIndex(game.turnIndex, game.players.length);
  }

  await game.save();
  logger && logger.info('token:move', { gameId, userId, tokenIndex, steps, nextTurnIndex: game.turnIndex });
  return { nextTurnIndex: game.turnIndex };
}

async function endGameSession(gameId, winnerUserId, logger) {
  const game = await Game.findOne({ gameId });
  if (!game) throw new Error('Game not found');
  if (game.status !== 'playing') return game.toObject();

  game.status = 'ended';
  game.winnerUserId = winnerUserId || null;
  await game.save();

  logger && logger.info('game:end', { gameId, winnerUserId: game.winnerUserId });
  return game.toObject();
}

// Socket handler for dice roll with enriched event emission
async function handleDiceRoll(socket, payload, nsp, logger, cb, enrichEventPayload) {
  try {
    const { roomId } = payload || {};
    const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
    
    if (!roomId) throw new Error('roomId required');
    
    // Find game by roomId (assume roomToGame mapping exists in caller or we fetch it)
    const { Game } = require('../models/Game');
    const game = await Game.findOne({ roomId, status: 'playing' });
    if (!game) throw new Error('Game not found for room');
    
    const gameId = game.gameId;
    
    // Check for pending move
    if (game.pendingDiceValue != null) {
      logger.warn('dice:roll:pending_move', { gameId, userId, pendingValue: game.pendingDiceValue });
      return cb && cb({ ok: false, code: 'PENDING_MOVE', message: 'Pending move exists', pendingDiceValue: game.pendingDiceValue });
    }
    
    // Check turn
    const currentPlayer = game.players[game.turnIndex];
    if (String(currentPlayer.userId) !== String(userId)) {
      logger.warn('dice:roll:not_your_turn', { gameId, userId, currentTurn: game.turnIndex });
      return cb && cb({ ok: false, code: 'NOT_YOUR_TURN', message: 'Not your turn' });
    }
    
    // Roll dice
    const rollResult = await rollDice(userId, gameId, logger);
    const { value, turnIndex, skipped, nextTurnIndex } = rollResult;
    
    // Calculate legal tokens if not skipped
    let legalTokens = [];
    let mustMove = false;
    if (!skipped) {
      const { anyLegalToken } = require('./validator');
      for (let i = 0; i < currentPlayer.tokens.length; i++) {
        const legal = anyLegalToken(game.toObject ? game.toObject() : game, game.turnIndex, value, { allowBlocking: true, extraTurnOnSix: true }, i);
        if (legal) legalTokens.push(i);
      }
      mustMove = legalTokens.length > 0;
    }
    
    // Enrich and emit dice:result event
    const dicePayload = enrichEventPayload({
      roomId,
      gameId,
      value,
      skipped,
      legalTokens: skipped ? [] : legalTokens,
      mustMove: skipped ? false : mustMove,
      turnIndex: nextTurnIndex,  // Use nextTurnIndex as the new current turn
      nextTurnIndex,
    });
    nsp.to(roomId).emit('dice:result', dicePayload);
    logger.info('socket:event:emit', { event: 'dice:result', roomId, value, skipped, turnIndex: nextTurnIndex, seq: dicePayload.seq });
    
    // If skipped, emit turn:change so frontend updates immediately
    if (skipped) {
      const turnPayload = enrichEventPayload({ roomId, gameId, turnIndex: nextTurnIndex });
      nsp.to(roomId).emit('turn:change', turnPayload);
      logger.info('socket:event:emit', { event: 'turn:change', roomId, turnIndex: nextTurnIndex, seq: turnPayload.seq });
    }
    
    // Acknowledge
    cb && cb({ ok: true, value, skipped, legalTokens, mustMove, turnIndex: nextTurnIndex, nextTurnIndex });
  } catch (err) {
    logger.error('socket:event:error', { event: 'dice:roll', error: err.message, socketId: socket.id });
    cb && cb({ ok: false, message: err.message });
  }
}

// Socket handler for token move with enriched event emission
async function handleTokenMove(socket, payload, nsp, logger, cb, enrichEventPayload) {
  try {
    const { roomId, tokenIndex, steps } = payload || {};
    const userId = socket.user?.userId || socket.handshake.auth?.userId || 'dev-user';
    
    if (!roomId || tokenIndex == null || steps == null) {
      throw new Error('roomId, tokenIndex, and steps required');
    }
    
    // Find game
    const { Game } = require('../models/Game');
    const game = await Game.findOne({ roomId, status: 'playing' });
    if (!game) throw new Error('Game not found for room');
    
    const gameId = game.gameId;
    const playerIndex = game.turnIndex;
    
    // Apply move
    const moveResult = await applyMove(userId, gameId, tokenIndex, steps, logger);
    
    // Reload game for fresh state
    const updatedGame = await Game.findOne({ gameId });
    const token = updatedGame.players[playerIndex].tokens.find((t) => t.tokenIndex === Number(tokenIndex));
    
    // Emit token:move event
    const movePayload = enrichEventPayload({
      roomId,
      gameId,
      playerIndex,
      tokenIndex: Number(tokenIndex),
      steps: Number(steps),
      newState: token.state,
      stepsFromStart: token.stepsFromStart,
      turnIndex: updatedGame.turnIndex,
    });
    nsp.to(roomId).emit('token:move', movePayload);
    logger.info('socket:event:emit', { event: 'token:move', roomId, playerIndex, tokenIndex, seq: movePayload.seq });
    
    // Emit turn:change
    const turnPayload = enrichEventPayload({ roomId, gameId, turnIndex: updatedGame.turnIndex });
    nsp.to(roomId).emit('turn:change', turnPayload);
    logger.info('socket:event:emit', { event: 'turn:change', roomId, turnIndex: updatedGame.turnIndex, seq: turnPayload.seq });
    
    // Check if game ended
    if (moveResult.ended || updatedGame.status === 'ended') {
      const endPayload = enrichEventPayload({
        roomId,
        gameId,
        winnerUserId: updatedGame.winnerUserId,
        game: updatedGame.toObject ? updatedGame.toObject() : updatedGame,
      });
      nsp.to(roomId).emit('game:end', endPayload);
      logger.info('socket:event:emit', { event: 'game:end', roomId, gameId, winnerUserId: updatedGame.winnerUserId, seq: endPayload.seq });
    }
    
    cb && cb({ ok: true, turnIndex: updatedGame.turnIndex });
  } catch (err) {
    logger.error('socket:event:error', { event: 'token:move', error: err.message, socketId: socket.id });
    cb && cb({ ok: false, message: err.message });
  }
}

module.exports = {
  startGameSession,
  rollDice,
  applyMove,
  endGameSession,
  handleDiceRoll,
  handleTokenMove,
  // helpers exported for tests
  _internals: {
    hasAnyLegalMove,
    applyMoveOnToken,
    computeWinnerIfAny,
    nextTurnIndex,
  },
};
