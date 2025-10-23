'use strict';

// Centralized Ludo rules validator for backend
// Works with Game model tokens: { state: 'base'|'track'|'homeStretch'|'home', stepsFromStart }

const BOARD_SIZE = 52;
const HOME_LENGTH = 6; // indices 52..57, and 58 treated as home completion

function defaultStartIndexForPlayer(playerIndex) {
  // Seating order indices
  const starts = [0, 13, 26, 39];
  return starts[playerIndex % starts.length];
}

function buildSafeSquaresDefault() {
  // Typical safe squares (global indices). Adjust per board art if needed.
  return new Set([0, 8, 13, 21, 26, 34, 39, 47]);
}

function posToPathIndex(pos) {
  if (!pos) return null;
  if (pos.state === 'base') return null; // off-board
  if (pos.state === 'track') return pos.stepsFromStart; // 0..51
  if (pos.state === 'homeStretch') return pos.stepsFromStart; // 52..57
  if (pos.state === 'home') return BOARD_SIZE + HOME_LENGTH; // 58
  return null;
}

function pathIndexToGlobal(startIndex, pathIndex) {
  if (pathIndex >= 0 && pathIndex < BOARD_SIZE) {
    return (startIndex + pathIndex) % BOARD_SIZE;
  }
  return null;
}

function buildTrackOccupancy(game) {
  // Map global index -> occupants [{ playerIndex, tokenIndex }]
  const occ = new Map();
  (game.players || []).forEach((p, pIdx) => {
    const start = defaultStartIndexForPlayer(pIdx);
    (p.tokens || []).forEach((t) => {
      if (t.state === 'track') {
        const g = pathIndexToGlobal(start, t.stepsFromStart);
        if (g != null) {
          const list = occ.get(g) || [];
          list.push({ playerIndex: pIdx, tokenIndex: t.tokenIndex });
          occ.set(g, list);
        }
      }
    });
  });
  return occ;
}

function isOpponentBlockAt(occMap, globalIndex, moverPlayerIndex) {
  const list = occMap.get(globalIndex) || [];
  if (list.length >= 2) {
    // If all belong to same player and it's not the mover, it's a block
    const samePlayer = list.every((o) => o.playerIndex === list[0].playerIndex);
    if (samePlayer && list[0].playerIndex !== moverPlayerIndex) {
      return true;
    }
  }
  return false;
}

function occupantsAt(occMap, globalIndex) {
  return occMap.get(globalIndex) || [];
}

function validateMove(game, playerIndex, tokenIndex, dice, options = {}) {
  const allowBlocking = options.allowBlocking !== false; // default true
  const extraTurnOnSix = options.extraTurnOnSix !== false; // default true
  const safeSquares = options.safeSquares || buildSafeSquaresDefault();

  if (!game || !game.players || !game.players[playerIndex]) {
    return { legal: false, reason: 'Invalid player' };
  }
  const player = game.players[playerIndex];
  const token = (player.tokens || []).find((t) => Number(t.tokenIndex) === Number(tokenIndex));
  if (!token) return { legal: false, reason: 'Invalid token index' };
  if (dice < 1 || dice > 6) return { legal: false, reason: 'Invalid dice' };

  const startIndex = defaultStartIndexForPlayer(playerIndex);
  const occ = buildTrackOccupancy(game);

  // Helper: check passing squares for opponent blocks
  function pathBlocked(currentPathIndex, destPathIndex) {
    if (!allowBlocking) return false;
    // Only consider path indices that are on track (0..51)
    const from = currentPathIndex == null ? -1 : currentPathIndex;
    for (let pi = from + 1; pi <= destPathIndex && pi < BOARD_SIZE; pi++) {
      const g = pathIndexToGlobal(startIndex, pi);
      if (g == null) continue;
      if (isOpponentBlockAt(occ, g, playerIndex)) return true;
    }
    return false;
  }

  // Case: token in base
  if (token.state === 'base') {
    if (dice !== 6) return { legal: false, reason: 'Must roll 6 to leave base' };
    const destPath = 0;
    const destGlobal = pathIndexToGlobal(startIndex, destPath);
    if (destGlobal == null) return { legal: false, reason: 'Invalid destination' };

    // Cannot land on opponent block
    if (allowBlocking && isOpponentBlockAt(occ, destGlobal, playerIndex)) {
      return { legal: false, reason: 'Destination blocked by opponent block' };
    }

    // Evaluate occupants
    const occs = occupantsAt(occ, destGlobal);
    const opponents = occs.filter((o) => o.playerIndex !== playerIndex);
    if (opponents.length > 0 && safeSquares.has(destGlobal)) {
      return { legal: false, reason: 'Cannot land on opponent on safe square' };
    }

    const captures = opponents.map((o) => ({ playerIndex: o.playerIndex, tokenIndex: o.tokenIndex }));
    return {
      legal: true,
      to: { state: 'track', stepsFromStart: 0 },
      captures,
      extraTurn: !!extraTurnOnSix, // entering on 6 grants extra turn
    };
  }

  // Compute current and destination path indices
  const curPI = posToPathIndex(token);
  if (curPI == null) return { legal: false, reason: 'Unexpected token state' };
  const destPI = curPI + dice;
  const finalHomePI = BOARD_SIZE + HOME_LENGTH; // 58

  if (destPI > finalHomePI) return { legal: false, reason: 'Must land exactly on home' };

  // Destination in home area
  if (destPI >= BOARD_SIZE) {
    const homeIdx = destPI - BOARD_SIZE; // 0..6, where 6 means final home
    if (homeIdx === HOME_LENGTH) {
      // Finish
      return {
        legal: true,
        to: { state: 'home', stepsFromStart: BOARD_SIZE + HOME_LENGTH },
        captures: [],
        extraTurn: extraTurnOnSix && dice === 6,
      };
    }
    // Ensure not colliding with own token in same home slot
    const selfHomeConflict = (player.tokens || []).some(
      (t) => t.tokenIndex !== token.tokenIndex && t.state === 'homeStretch' && (t.stepsFromStart - BOARD_SIZE) === homeIdx,
    );
    if (selfHomeConflict) return { legal: false, reason: 'Home square already occupied by your token' };

    return {
      legal: true,
      to: { state: 'homeStretch', stepsFromStart: destPI },
      captures: [],
      extraTurn: extraTurnOnSix && dice === 6,
    };
  }

  // Destination on track
  if (pathBlocked(curPI, destPI)) {
    return { legal: false, reason: 'Path blocked by opponent block' };
  }

  const destGlobal = pathIndexToGlobal(startIndex, destPI);
  if (destGlobal == null) return { legal: false, reason: 'Invalid destination' };

  // Cannot land on opponent block at destination
  if (allowBlocking && isOpponentBlockAt(occ, destGlobal, playerIndex)) {
    return { legal: false, reason: 'Destination blocked by opponent block' };
  }

  const occs = occupantsAt(occ, destGlobal);
  const opponents = occs.filter((o) => o.playerIndex !== playerIndex);
  if (opponents.length > 0 && safeSquares.has(destGlobal)) {
    return { legal: false, reason: 'Cannot capture on safe square' };
  }
  const captures = opponents.map((o) => ({ playerIndex: o.playerIndex, tokenIndex: o.tokenIndex }));

  return {
    legal: true,
    to: { state: 'track', stepsFromStart: destPI },
    captures,
    extraTurn: !!(extraTurnOnSix && dice === 6),
  };
}

function anyLegalToken(game, playerIndex, dice, options) {
  const player = game.players[playerIndex];
  for (const t of player.tokens) {
    const r = validateMove(game, playerIndex, t.tokenIndex, dice, options);
    if (r.legal) return true;
  }
  return false;
}

module.exports = {
  validateMove,
  anyLegalToken,
  constants: { BOARD_SIZE, HOME_LENGTH },
  _internals: {
    defaultStartIndexForPlayer,
    buildSafeSquaresDefault,
    posToPathIndex,
    pathIndexToGlobal,
    buildTrackOccupancy,
  },
};
