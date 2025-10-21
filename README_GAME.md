# Ludo Game Engine (Backend)

## Overview
This adds server-side Ludo game sessions with deterministic dice RNG, legality checks, turn rotation (extra turn on 6, skip on no moves), capture rules, and Socket.IO events.

## Data Model
- `models/Game.js`: Stores game sessions with fields: `gameId`, `roomId`, `stake`, `mode`, `players[{ userId, color, tokens[] }]`, `turnIndex`, `status`, `winnerUserId`, `rngSeed`, `diceSeq`, `moveSeq`, `pendingDice*`, `diceLogs[]`, `moveLogs[]`, timestamps. Indexes on `roomId,status,createdAt`.

## RNG
- `utils/rng.js`: Crypto-seeded deterministic PRNG (xoshiro128**) with `generateGameSeed()` and `createDeterministicRng(seed)`; `rollDie()` yields uniform 1–6.

## Service
- `services/GameService.js`:
  - `startGameSession(roomId)`
  - `rollDice(userId, gameId)` (records dice log; auto-skip if no move)
  - `applyMove(userId, gameId, tokenIndex, steps)` (validates, updates board, captures, advances turn; extra turn on 6)
  - `endGameSession(gameId, winnerUserId)`
  - Helpers for rules and winner detection (Classic/Quick)

## Socket Events (namespace `/ludo`)
- `room:create`, `room:update`, `room:full`
- `game:start` (payload includes `gameId`, `turnIndex`, `players`)
- `dice:roll` (client→server: `{ roomId }`), `dice:result` (server→clients)
- `token:move` (client→server: `{ roomId, tokenIndex, steps }`); server emits `token:move` and `turn:change`
- `game:end`

Implemented in `socketController/io.js`. For tests/non-production, namespace allows `auth.userId` without JWT.

## HTTP Endpoints
- `GET /api/games/:gameId` — fetch game
- `GET /api/games/room/:roomId/current` — latest game for room

## Tests
- Unit: `test/gameService.test.js`
- Integration (rooms): `test/socketRooms.int.test.js`
- Integration (game): `test/socketGame.int.test.js`

Run: `npm test`

## Postman
- `docs/Games.postman_collection.json` — import and set variables `baseUrl`, `jwt`.

## Notes
- Rules are minimal but enforce: current player, release on 6, home exact landing, safe squares, captures, extra turn on 6, skip on no legal move. Quick mode winner via `config.quickWinTokens`.
