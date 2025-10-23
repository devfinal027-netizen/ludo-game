'use strict';

const { validateMove, anyLegalToken, _internals } = require('../services/validator');

function makeGame({ players = 2, tokensPerPlayer = 4, setup }) {
  const colors = ['red', 'green', 'yellow', 'blue'];
  const game = {
    players: Array.from({ length: players }, (_, i) => ({
      userId: String(i + 1),
      color: colors[i % colors.length],
      tokens: Array.from({ length: tokensPerPlayer }, (_, ti) => ({ tokenIndex: ti, state: 'base', stepsFromStart: -1 })),
    })),
  };
  if (typeof setup === 'function') setup(game);
  return game;
}

describe('validator.validateMove', () => {
  test('base: must roll 6 to leave', () => {
    const game = makeGame({ setup: (g) => {
      // p0 t0 in base
    }});
    // dice 5 -> illegal
    const r1 = validateMove(game, 0, 0, 5, { allowBlocking: true, extraTurnOnSix: true });
    expect(r1.legal).toBe(false);
    expect(r1.reason).toMatch(/Must roll 6/i);
    // dice 6 -> legal, to track index 0, extra turn
    const r2 = validateMove(game, 0, 0, 6, { allowBlocking: true, extraTurnOnSix: true });
    expect(r2.legal).toBe(true);
    expect(r2.to).toEqual({ state: 'track', stepsFromStart: 0 });
    expect(r2.extraTurn).toBe(true);
  });

  test('exact home: overshoot is illegal', () => {
    const game = makeGame({ setup: (g) => {
      // Put p0 t0 two away from final home position (homeStretch index 56 = 52+4)
      const t = g.players[0].tokens[0];
      t.state = 'homeStretch';
      t.stepsFromStart = 52 + 4; // two away from 58
    }});
    // roll 3 would overshoot to 59 -> illegal
    const r = validateMove(game, 0, 0, 3, {});
    expect(r.legal).toBe(false);
    expect(r.reason).toMatch(/overshoot|exact/i);
  });

  test('capture on non-safe square sends opponent to base', () => {
    const game = makeGame({ setup: (g) => {
      // p0 t0 at track index 0; will move 1 to index 1
      const t0 = g.players[0].tokens[0];
      t0.state = 'track';
      t0.stepsFromStart = 0;
      // p1 t0 positioned so that its global square equals p0 dest global (index 1 from p0 start)
      // p1 start = 13, so to land at global 1, need stepsFromStart such that (13 + s) % 52 == 1 -> s = 40
      const t1 = g.players[1].tokens[0];
      t1.state = 'track';
      t1.stepsFromStart = 40;
    }});
    const r = validateMove(game, 0, 0, 1, {});
    expect(r.legal).toBe(true);
    expect(r.captures && r.captures.length).toBe(1);
    expect(r.captures[0]).toEqual({ playerIndex: 1, tokenIndex: 0 });
  });

  test('cannot capture on safe squares', () => {
    const safe = _internals.buildSafeSquaresDefault();
    // pick a safe index that is NOT p0 start to avoid off-by-one
    const p0start = _internals.defaultStartIndexForPlayer(0);
    const aSafe = Array.from(safe).find((idx) => idx !== p0start);
    expect(typeof aSafe).toBe('number');
    // Build positions so p0 destination global = aSafe and opponent is there
    const game = makeGame({ setup: (g) => {
      const p0startLocal = _internals.defaultStartIndexForPlayer(0);
      const stepsToSafe = (aSafe - p0startLocal + 52) % 52; // destination path index
      const mover = g.players[0].tokens[0];
      mover.state = 'track';
      mover.stepsFromStart = (stepsToSafe + 52 - 1) % 52; // so dice=1 lands on safe
      const p1start = _internals.defaultStartIndexForPlayer(1);
      const opp = g.players[1].tokens[0];
      opp.state = 'track';
      opp.stepsFromStart = (aSafe - p1start + 52) % 52;
    }});
    const r = validateMove(game, 0, 0, 1, {});
    expect(r.legal).toBe(false);
    expect(r.reason).toMatch(/safe/i);
  });

  test('blocking prevents passing and landing', () => {
    const game = makeGame({ setup: (g) => {
      // Build an opponent block at global index 5 (two tokens of p1)
      const p1start = _internals.defaultStartIndexForPlayer(1);
      const p1PathTo5 = (5 - p1start + 52) % 52;
      const b1 = g.players[1].tokens[0];
      b1.state = 'track'; b1.stepsFromStart = p1PathTo5;
      const b2 = g.players[1].tokens[1];
      b2.state = 'track'; b2.stepsFromStart = p1PathTo5;
      // Mover p0 at global 3, wants to move 3 -> would pass 4,5,6 and land on 6
      const p0start = _internals.defaultStartIndexForPlayer(0);
      const mover = g.players[0].tokens[0];
      mover.state = 'track';
      mover.stepsFromStart = ((3 - p0start + 52) % 52 + 52) % 52; // set so global=3
      // sanity: pathIndexToGlobal
      expect(_internals.pathIndexToGlobal(p0start, mover.stepsFromStart)).toBe(3);
    }});
    // moving 3 should be blocked (passes through 5)
    const r = validateMove(game, 0, 0, 3, {});
    expect(r.legal).toBe(false);
    expect(r.reason).toMatch(/block/i);
  });

  test('anyLegalToken matches validateMove results', () => {
    const game = makeGame({ setup: (g) => {
      // p0: one token in base, one on track far away
      g.players[0].tokens[0].state = 'base';
      g.players[0].tokens[1].state = 'track';
      g.players[0].tokens[1].stepsFromStart = 10;
    }});
    const dice = 6;
    const any = anyLegalToken(game, 0, dice, {});
    // At least one should be legal (base token release or track move)
    expect(any).toBe(true);
  });
});
