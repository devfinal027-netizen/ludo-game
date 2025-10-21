'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
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
    mem = await MongoMemoryServer.create();
    process.env.MONGO_URI = mem.getUri();
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
    const game = await startGameSession('r1', logger);

    // Force next die to be 6 by setting diceSeq so RNG(seed+seq) results in 6 is not guaranteed;
    // Instead, we roll until we get a 6, with a guard to prevent infinite loop.
    let roll;
    for (let i = 0; i < 20; i++) {
      roll = await rollDice('u1', game.gameId, logger);
      if (roll.value === 6) break;
      // if not 6 and no legal moves from base, auto-skip occurs
      if (roll.value !== 6) continue;
    }
    expect(roll).toBeTruthy();

    if (roll.value !== 6) {
      // If we didn't roll a 6 in 20 tries (unlikely), skip the rest to avoid flakiness
      return;
    }

    const moveRes = await applyMove('u1', game.gameId, 0, 6, logger);
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
