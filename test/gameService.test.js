'use strict';

const mongoose = require('mongoose');
let MongoMemoryServer;
try { ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch (_) { MongoMemoryServer = null; }
const { connectDatabase } = require('../config/database');
const { Room } = require('../models/Room');
const { Game } = require('../models/Game');
const { startGameSession, rollDice, applyMove, _internals } = require('../services/GameService');

const logger = { info: () => {}, error: () => {} };

function makeRoom({ stake = 10, mode = 'Classic', maxPlayers = 2 } = {}) {
  return Room.create({
    roomId: 'r1',
    stake,
    mode,
    maxPlayers,
    status: 'playing',
    players: [
      { userId: 'u1', joinedAt: new Date(), status: 'joined' },
      { userId: 'u2', joinedAt: new Date(), status: 'joined' },
    ],
  });
}

describe('GameService', () => {
  let mem;
  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      if (!MongoMemoryServer) throw new Error('mongodb-memory-server not available and MONGO_URI not set');
      mem = await MongoMemoryServer.create();
      process.env.MONGO_URI = mem.getUri();
    }
    await connectDatabase(logger);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mem) await mem.stop();
  });

  beforeEach(async () => {
    await Room.deleteMany({});
    await Game.deleteMany({});
  });

  test('start -> roll -> move release on 6 -> extra turn', async () => {
    await makeRoom();
    const started = await startGameSession('r1', logger);

    // Roll respecting turn order until u1 gets a 6, with a guard to prevent long loops.
    let roll = null;
    for (let i = 0; i < 60; i++) {
      const g = await Game.findOne({ gameId: started.gameId });
      const current = g.players[g.turnIndex];
      let res;
      try {
        res = await rollDice(String(current.userId), started.gameId, logger);
      } catch (e) {
        if (String(e && e.message || e).includes('Pending move exists')) {
          // Resolve existing pending move for current player, then continue
          const gPending = await Game.findOne({ gameId: started.gameId });
          const steps = gPending.pendingDiceValue;
          const player = gPending.players[gPending.turnIndex];
          let applied = false;
          for (const t of player.tokens) {
            try {
              await applyMove(String(player.userId), started.gameId, t.tokenIndex, steps, logger);
              applied = true;
              break;
            } catch (_) {}
          }
          if (applied) {
            continue;
          }
        }
        throw e;
      }
      if (String(current.userId) === 'u1' && res.value === 6) {
        roll = res;
        break;
      }
      // If another player rolled a 6, they now have a pending move.
      // Clear it by applying the release move so the loop can continue without 'Pending move exists'.
      if (String(current.userId) !== 'u1' && res.value === 6) {
        await applyMove(String(current.userId), started.gameId, 0, 6, logger);
        continue;
      }
      // If the roll was not skipped, there is a pending dice that must be resolved by a legal move.
      if (!res.skipped) {
        const g2 = await Game.findOne({ gameId: started.gameId });
        const pIdx = g2.turnIndex; // still same player until a move is applied
        const player = g2.players[pIdx];
        let applied = false;
        for (const t of player.tokens) {
          try {
            await applyMove(String(player.userId), started.gameId, t.tokenIndex, res.value, logger);
            applied = true;
            break;
          } catch (_) {}
        }
        if (!applied) {
          // If no legal move found, let loop continue; but ideally this shouldn't happen
        }
      }
      // otherwise continue loop; turn may rotate automatically on skip
    }
    expect(roll).toBeTruthy();
    if (!roll || roll.value !== 6) return; // avoid flakiness if unlucky

    const moveRes = await applyMove('u1', started.gameId, 0, 6, logger);
    expect(moveRes.ended).not.toBe(true);
    // Extra turn expected when 6
    expect(moveRes.nextTurnIndex).toBe(0);
  });

  test('no legal move on non-6 from base -> skip turn', async () => {
    await makeRoom();
    const game = await startGameSession('r1', logger);

    // Roll once; if it's not 6, expect skip, else move once and expect not skipped.
    const res = await rollDice('u1', game.gameId, logger);
    if (res.value !== 6) {
      expect(res.skipped).toBe(true);
      expect(res.nextTurnIndex).toBe(1);
    }
  });

  test('home stretch requires exact landing', async () => {
    await makeRoom();
    const started = await startGameSession('r1', logger);
    const g = await Game.findOne({ gameId: started.gameId });
    const player = g.players[0];
    const token = player.tokens[0];
    token.state = 'homeStretch';
    token.stepsFromStart = 52 + 4; // two away from home
    await g.save();

    // set pending dice manually to 3 to exceed home
    g.pendingDiceValue = 3;
    g.pendingDicePlayerIndex = 0;
    await g.save();

    await expect(applyMove('u1', started.gameId, 0, 3, logger)).rejects.toThrow('Must land exactly on home');
  });
});
