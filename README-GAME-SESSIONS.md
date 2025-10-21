# Game Session Engine

This document describes the Game Session Engine implementation and how to use its APIs and sockets.

## Data Model

`models/Game.js` implements the MongoDB schema with the following fields:

- `gameId`, `roomId`, `stake`, `mode` (`Classic` | `Quick`)
- `players[{ userId, color, tokens[{ tokenIndex, state, stepsFromStart }] }]`
- `turnIndex`, `status` (`playing` | `ended` | `aborted`), `winnerUserId?`
- `rngSeed`, `diceSeq`, `moveSeq`
- `pendingDiceValue?`, `pendingDicePlayerIndex?`
- `diceLogs[]`, `moveLogs[]` (append-only with `seq` and `at` timestamps)

Indexes: `{ roomId, status, createdAt }` and unique index on `gameId`.

## RNG and Fairness

`utils/rng.js` provides a deterministic PRNG using xoshiro128** with a crypto-generated seed. Each dice roll derives from `seed + ':' + (diceSeq+1)`, ensuring reproducible 1–6 uniform values. Seeds are stored as `rngSeed` for audit.

## GameService

`services/GameService.js` exposes:

- `startGameSession(roomId)` — initialize game from a `Room`, assign colors, tokens, RNG seed.
- `rollDice(userId, gameId)` — only current player may roll; records dice; auto-skip if no legal move.
- `applyMove(userId, gameId, tokenIndex, steps)` — validates move per rules, records move, resolves captures, applies turn rotation (extra turn on 6), and detects winner.
- `endGameSession(gameId, winnerUserId?)` — closes game and records winner.

### Rules covered

- Token release from base only on 6
- Track progress, home stretch with exact landing to enter `home`
- Safe squares (no capture) and capture/bump opponents on landing
- Turn rotation with extra turn on 6 and skip when no legal move
- Winner detection: Classic all tokens home; Quick uses configured target (defaults to 2)

## Sockets

Namespace: `/ludo` (`socketController/io.js`):

Events emitted by server:
- `game:start`, `dice:result`, `token:move`, `turn:change`, `game:end`

Events accepted from clients:
- `session:create`, `session:join`
- `dice:roll` → emits `dice:result`
- `token:move` → emits `token:move` and `turn:change` or `game:end`

## REST API

Base path: `/api/games` (protected; Bearer JWT required)

- `GET /api/games/:gameId` → returns game document
- `GET /api/games/room/:roomId/current` → latest game for a room
- `POST /api/games/start` — body `{ roomId }`
- `POST /api/games/dice/roll` — body `{ gameId }`
- `POST /api/games/token/move` — body `{ gameId, tokenIndex, steps }`
- `POST /api/games/end` — body `{ gameId, winnerUserId? }`

Validation schemas live in `utils/schema.js`.

## Tests

Jest tests:
- `test/gameService.test.js` — service flow and rules
- `test/socketGame.int.test.js` — socket start→roll→move→turn

Note: Tests use `mongodb-memory-server`. If not installed in your environment, skip running tests or install it locally.

## Postman Collection

Import `postman/GameSessions.postman_collection.json` and configure an `authToken` variable for the Bearer token.
