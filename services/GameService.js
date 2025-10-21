'use strict';

const { v4: uuid } = require('uuid');
const { Game } = require('../models/Game');
const { Room } = require('../models/Room');
const { createDeterministicRng, generateGameSeed } = require('../utils/rng');
const { config } = require('../config/config');

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
  // Minimal legality: if 6 allows releasing from base; if on track, moving within limits; if homeStretch within bounds; no move if all tokens home
  const player = game.players[playerIndex];
  for (const t of player.tokens) {
    if (t.state === 'home') continue;
    if (t.state === 'base' && diceValue === 6) return true;
    if (t.state === 'track') return true; // baseline, actual path legality enforced in applyMove
    if (t.state === 'homeStretch') {
      const target = t.stepsFromStart + diceValue;
      if (target <= BOARD_TRACK_LENGTH + HOME_STRETCH_LENGTH) return true;
    }
  }
  return false;
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

function resolveCaptures(game, moverPlayerIndex, tokenStateAfter) {
  // Simplified capture: if mover lands on same track index as any opponent token on 'track', capture it (send to base), except safe squares.
  // Safe squares: indices 0, 8, 13, 21, 26, 34, 39, 47 (typical Ludo safe spots). Adjust if needed.
  const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const captures = [];

  if (tokenStateAfter.to.state !== 'track') return captures;
  const landingIndex = tokenStateAfter.to.stepsFromStart;
  if (SAFE_INDICES.has(landingIndex)) return captures;

  for (let pIdx = 0; pIdx < game.players.length; pIdx++) {
    if (pIdx === moverPlayerIndex) continue;
    const opponent = game.players[pIdx];
    for (const ot of opponent.tokens) {
      if (ot.state === 'track' && ot.stepsFromStart === landingIndex) {
        // capture
        captures.push({ victimUserId: opponent.userId, tokenIndex: ot.tokenIndex });
        ot.state = 'base';
        ot.stepsFromStart = -1;
      }
    }
  }

  return captures;
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

  // Validate legal move exists
  if (!hasAnyLegalMove(game, game.turnIndex, steps)) {
    // no legal move: consume dice and rotate turn
    game.pendingDiceValue = undefined;
    game.pendingDicePlayerIndex = undefined;
    game.turnIndex = nextTurnIndex(game.turnIndex, game.players.length);
    await game.save();
    return { skipped: true, nextTurnIndex: game.turnIndex };
  }

  const moveDelta = applyMoveOnToken(token, steps);
  const captures = resolveCaptures(game, game.turnIndex, moveDelta);

  game.moveSeq += 1;
  game.moveLogs.push({
    seq: game.moveSeq,
    userId: String(userId),
    tokenIndex: Number(tokenIndex),
    steps,
    from: moveDelta.from,
    to: moveDelta.to,
    captures,
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

  // Turn rotation: extra turn on 6; otherwise normal advance
  if (!rolledSix) {
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

module.exports = {
  startGameSession,
  rollDice,
  applyMove,
  endGameSession,
  // helpers exported for tests
  _internals: {
    hasAnyLegalMove,
    applyMoveOnToken,
    computeWinnerIfAny,
    nextTurnIndex,
  },
};
