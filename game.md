
# Ludo Project Specification

Extracted from ludo.pdf — organized and formatted.

---

## Table of Contents
- Tech Stack
- Authentication and User Management
- Game Sessions and Matchmaking
- Room & Matchmaking Details
- Game Logic & Real-Time Play
- Payout & Settlement
- Admin Management
- Frontend Implementation
- Non-Functional & Operational Features
- Sequence of Operations / Flow Summaries
- Configurable Rules & Parameters

---

## Tech Stack

**Layer / Technology / Developer Notes**

- **Frontend**
  - React + Vite, GSAP/PixiJS (for board animations if needed)
  - Modular components; Telegram Web App API for initData; responsive for web fallback.

- **Backend**
  - Node.js + Express.js
  - Pure JS functions for routes/handlers; (CommonJS, functional style)
  - MongoDB ODM for data ops.
  - Real-time Socket.IO
  - Namespaced events; Redis pub/sub for scaling (optional).

- **Database**
  - MongoDB
  - Schemas for users, sessions, transactions; indexes on userId, sessionId, timestamp.

- **Cache (optional)**
  - Redis
  - Session storage; pub/sub for room broadcasts; TTL for active games.

- **Payment**
  - AddisPay API
  - Invoice creation/polling; webhook handling for status updates.

- **PDF parser** (noted as included)

- **Deployment**
  - Docker (multi-container: app, mongo, redis)
  - Compose for local dev.

- **Currency**
  - Ethiopian Birr (ETB)
  - Decimal precision to 2 places; all calcs in Number type.

---

## Auth

- JWT (for sessions)
- HMAC verification of initData; Telegram initData validation
- bcrypt/bcryptjs for optional passwords

---

## Authentication and User Management

- **Registration via Telegram:**
  - Capture full Telegram data: `initData` including `user.id` (TelegramID), `user.phone_number` (verified phone), `user.username`, `user.first_name`, `user.last_name`.
  - Validate `initData` server-side using Telegram's HMAC-SHA256 signature (bot token as secret).
  - Store password if provided for fallback login.
  - Create user document in MongoDB if new; issue JWT with `userId`, `phone`, `TelegramID`.

- **Fallback Login:**
  - Phone; if password set, validate hash.
  - No guest mode; all users must register.

- **Session Management:**
  - JWT expiry: 24 hours; refresh via Telegram re-auth if expired.
  - API: All endpoints require `Authorization: Bearer <JWT>`.

---

## Game Sessions and Matchmaking

- **Session-Based Rooms:**
  - Unique `sessionId` per room (UUID); multiple rooms can share stake/mode (e.g., two 50 ETB Classic sessions).
  - Player Creation: Select stake (10/50/100 ETB), mode (Classic/Quick), players (2/4). Deduct/lock stake.
  - Admin Creation: Via admin panel; pre-populate with bots if needed for testing.
  - Matchmaking: 'QuickJoin' queues by stake/mode; create new session if no open room, or join existing (FiFO). Use Redis sorted set for queue (score: timestamp).
  - Auto-Start: When full; timeout 5 min → refund/abort.
  - PotCalc: `stake * players - commission`.

- **Socket Events (Namespace: /ludo):**
  - `session:create` — Body: `{ stake: Number, mode: String, maxPlayers: 2|4 }` → Return `{ sessionId: String }`
  - `session:join` — Body: `{ sessionId?: String }` → Join/create, broadcast `session:update`.
  - `session:full` — Auto-trigger start; emit `game:start` to players.
  - `session:abort` — Refund stakes; emit to all.

---

## Room & Matchmaking

- **Modes:**
  - Classic: 4 tokens/player; win by all home.
  - Quick: 2 tokens/player; first to home wins (shorter paths).

- **Server-Side Execution:**
  - Dice: Functional RNG (`Math.random` seeded); 1-6, emit result.
  - Moves: Validate paths, captures (bump opponents), safe zones. Turn timer: 30s → forfeit turn.
  - Disconnect: Pause 30s; forfeit if persistent (auto-move random).
  - Win: All tokens home → end session, payout.

- **Room schema:**
  - `roomId` (unique), `creatorUserId` (or null for admin), `stakeValue`, `mode`, `status` ("waiting", "playing", "ended", "cancelled"), `players` (list of userIds + join timestamp + status), `createdAt`, `startedAt`, `endedAt`.

- **Room creation endpoints:**
  - `POST /api/rooms/create` (player or admin)
  - `POST /api/rooms/join` (user supplies `roomId` or auto-select from available rooms with same stake)
  - `GET /api/rooms?stake=<value>&mode=<value>&status=waiting`

- **Socket events for room lifecycle:**
  - `room:create` (server → all lobby clients)
  - `room:update` (server → room players)
  - `room:join` (client → server)
  - `room:full` (server → players) triggers `game:start`

- Timeout logic: if room stays “waiting” for X minutes (configurable) with insufficient players → auto-cancel/refund logic.

- Duplicate stake values allowed: multiple rooms with same stake exist concurrently with distinct `roomId`s.

- Concurrent game sessions allowed: users may only join one room at a time.

- Disconnection/rejoin handling:
  - If player leaves before game start, allow remain in waiting list.
  - After game started, treat as mid-game drop (see Game Logic).
  - Admin ability: list all rooms, filter by status, force-end room, refund players.

---

## Game Logic & Real-Time Play

- **Game session schema:**
  - `gameId` (linked to `roomId`), `roomId`, `stakeValue`, `mode`, `players` with initial tokens/times, `turnIndex`, `diceRolls[]`, `moves[]`, `winnerUserId` (nullable until determined), `status` ("playing", "ended", "aborted").

- **Server-side authoritative logic:**
  - Dice roll generation, token move validation, turn change.

- **Supported game modes:**
  - Classic: full token set (e.g., 4 tokens each) and full win condition.
  - Quick: reduced tokens for faster win condition (configurable; e.g., first to 2 tokens home).

- **Socket events:**
  - `game:start` (server → room clients)
  - `dice:roll` (client → server)
  - `dice:result` (server → room clients)
  - `token:move` (server → room clients)
  - `turn:change` (server → room clients)
  - `game:end` (server → room clients) with `winnerUserId`, payout info

- **Move validation:**
  - Server checks that token move is legal (based on dice result), ensures correct player's turn.

- **Handling disconnections mid-game:**
  - Provide grace period (e.g., 30 seconds) for reconnect.
  - If user fails to reconnect within threshold: skip their turn automatically, or mark game aborted (based on configuration).

- **Game end outcomes:**
  - Normal winner, draw (if allowed), aborted (due to too many disconnects) — in aborted case, stakes refunded.

- **Logging game events:**
  - Dice rolls, moves, turn changes, winner, timestamp. Useful for audit/fairness.

---

## Payout & Settlement

- At game end (status = "ended"): backend calculates winner payout = (stake x numberPlayers) x (1 - commissionPercent).
- Commission amount recorded as system revenue.
- System updates wallet balances accordingly.
- If game aborted/cancelled: locked stakes for all players are released back to available balance.
- End-of-day/reporting: system should provide totals of games played, total pot value, commission earned, payouts made.
- Ensure atomic updates: deduct locked stake, credit payout — use transactions or two-phase updates in MongoDB.
- Prevent race conditions: lock user wallet during stake deduction/payout.

---

## Admin Management

- Admin authentication (separate role).
- CRUD operations for stake value configurations (allowed stake amounts).
- View & manage users: list users, view profile details (phone, TelegramID, wallet balance, transaction history).
- View & manage rooms: filter by status, stake, mode; force end or cancel rooms.
- View & manage games: list games, inspect events, game logs.
- View & manage wallet transactions: filter by type, user, date.
- Configure commission percent, mode parameters (Quick mode token count, win condition), room waiting timeout.
- Export reports (CSV/Excel) for finance: payouts, commission, deposits/withdrawals.

---

## Frontend Implementation

- **Telegram Mini App:**
  - Use `Telegram.WebApp` for `initData`, theme, haptic.
  - Components: `WalletView`, `SessionList`, `Board` (PixiJS for drag-drop tokens if perf ok).
  - Socket.IO client: Connect on mount; handle reconnects.
  - Web Fallback: Same components; use `localStorage` for JWT.
  - Error UI: Global handler for network/offline; retry buttons for critical actions.

---

## Non-Functional & Operational Features

- Performance: real-time interactions across Socket.IO must support low latency (use pub/sub if needed).
- Deployment: Docker-based containers; environment variables for DB URLs, Redis, payment keys.
- Payments: invoice status logged to persistent logging storage; webhook handlers for payments.
- Security: all endpoints behind HTTPS/TLS, authentication tokens, rate limiting, protect wallet endpoints against abuse, verify Telegram ID authenticity.
- Data integrity & fairness: store all dice-roll results, moves for audit; provide API/admin view to review history if needed.
- Backup & recovery: periodic backup of MongoDB, Redis persistence.
- Configuration management: keep constants (commission%, timeout values) in config file or environment variables.
- Code structure: Node.js modules in CommonJS (`require`), purely functional (no class usage), clear separation: `auth`, `wallet`, `rooms`, `games`, `admin`.
- Frontend architecture: React + Vite; optional Pixi.js for board animation; support design (Compose), CI/CD pipeline (optional).
- Localization: design UI to support multiple languages if needed later.
- Accessibility: basic accessibility features in UI (keyboard nav, screenreader friendly) if required.
- Audit & compliance: store logs of all financial transactions, ensure traceability from deposit→game→payout/withdrawal.

---

## Sequence of Operations / Flow Summaries

### 7.1 Registration/Login
1. User opens app (Telegram Mini App).
2. If chooses Telegram login: system invokes Telegram login widget, receives phone + TelegramID → backend checks if user exists → if not, creates user → issues JWT and wallet initialized (balance 0).
3. If chooses full registration: user enters phone + TelegramID + optional password → system verifies uniqueness → stores user + password hash → issues JWT.
4. User logs in with phone + password if set, or via Telegram login each time.

### 7.2 Wallet Deposit
1. User selects “Deposit” → chooses amount → backend calls AddisPay API, receives invoiceID/URL → frontend redirects user.
2. User completes payment → AddisPay sends webhook/callback → backend verifies payment status → updates wallet balance, logs transaction, notifies user.

### 7.3 Room Creation & Join
1. User chooses stake value and mode (2-player/4-player) → `POST /api/rooms/create` → backend creates room entry/status `waiting`.
2. Other user(s) query `GET /api/rooms?filter` → picks room and `POST /api/rooms/join` → backend adds user to players → if `players.length == playerCount` → status becomes `full`, trigger socket event `room:full`.
3. Backend locks each player's stake amount: deduct from available, add to locked, transaction type `STAKE_LOCK`.
4. Socket game: start event sent to players.

### 7.4 Gameplay
1. On `game:start`, server sends initial state.
2. Player whose turn it is sends `dice:roll` → server generates random value, logs it, sends `dice:result` to all in room.
3. Then server emits `turn:change` to next player.
4. On `game:end`, backend calculates payout, commission, updates wallets, logs transactions. Socket notifies `game:end` with winner and payout.
5. Room status becomes `ended`.

### 7.5 Room Timeout/Cancellation
- If awaiting room stays open longer than configured timeout → backend auto-cancels room → change status `cancelled`, unlock any locked stakes, emit `room:cancelled` to players → room cleaned up after grace period.

### 7.6 Withdrawal
- User requests withdrawal via `POST /api/wallet/withdraw` → backend validates, deduct available balance, create transaction `WITHDRAWAL`. Notify user.

### 7.7 Admin Operations
- Admin logs into admin UI → views summary, monitors rooms/games/users/transactions → fixes issues (force end room, refund, adjust config) as needed.

---

## Configurable Rules & Parameters

- Allowed stake values (list).
- Player counts allowed (2, 4).
- Commission percent (e.g., 20%).
- Room waiting timeout (e.g., 300 seconds).
- Quick mode rules: number of tokens per player, win condition (e.g., first to bring 2 tokens home).
- Prize distribution logic (e.g., winner gets pot minus commission).
- Reconnection grace period (e.g., 30 seconds).
- Maximum simultaneous rooms per stake value (optional).
- Wallet minimum deposit/withdrawal amounts.
- Admin credentials & roles.

---

