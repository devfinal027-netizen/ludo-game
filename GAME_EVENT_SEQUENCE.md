# Ludo Game Event Sequence Documentation

## Complete Event Flow (Backend ↔ Frontend)

### 1. Room Creation Flow

**Client Action**: User clicks "Create" button in Lobby

```
Frontend (Lobby.jsx)
  ↓ onClick={onCreate}
  ↓ dispatch(createRoom({ stake, mode, maxPlayers }))

Frontend (roomsSlice.js)
  ↓ socket.emit('session:create', { stake, mode, maxPlayers })

Backend (io.js::handleCreate)
  ↓ createRoom({ creatorUserId, stake, mode, maxPlayers })
  ↓ socket.join(room.roomId)
  ↓ userLastRoom.set(userId, roomId)
  ↓ roomRegistry.set(roomId, Set([userId]))
  ↓ nsp.emit('room:create', room)              [BROADCAST TO ALL]
  ↓ nsp.to(room.roomId).emit('room:update', room)  [TO ROOM MEMBERS]
  ↓ IF room.status === 'full':
      ↓ nsp.to(roomId).emit('room:full', room)
      ↓ startGameIfFull({ roomId })
      ↓ gameController.handleStartGame(roomId)
      ↓ nsp.to(roomId).emit('game:start', { roomId, gameId, turnIndex, players })
  ↓ cb({ ok: true, room })

Frontend (socket.js)
  ← s.on('room:create', ...) → dispatch(listRooms())
  ← s.on('room:update', ...) → dispatch(listRooms()) + sync currentRoom
  ← s.on('room:full', ...) → setCountdown(3)
  ← s.on('game:start', ...) → navigate('/game')

Frontend (roomsSlice.js)
  ← createRoom.fulfilled → state.current = room, localStorage.setItem('currentRoom')
```

### 2. Room Join Flow

**Client Action**: User clicks "Join" on a room card

```
Frontend (Lobby.jsx)
  ↓ onJoin(roomId)
  ↓ dispatch(listRooms()) // Verify room exists
  ↓ dispatch(joinRoom({ roomId }))

Frontend (roomsSlice.js)
  ↓ socket.emit('session:join', { roomId })

Backend (io.js::handleJoin)
  ↓ runExclusive(userId, async () => {
      ↓ RoomService.getRoom(roomId) // Verify existence
      ↓ IF NOT found && autoCreate:
          ↓ createRoom({ creatorUserId, ... })
      ↓ IF NOT found:
          ↓ nsp.to(socket.id).emit('room:error', { code: 'E_NO_ROOM' })
          ↓ cb({ ok: false, code: 'E_NO_ROOM' })
          ↓ RETURN
      ↓ joinRoom({ roomId, userId }) // Service call
      ↓ socket.join(room.roomId)
      ↓ userLastRoom.set(userId, roomId)
      ↓ roomRegistry.get(roomId).add(userId)
      ↓ nsp.to(room.roomId).emit('room:update', room)
      ↓ IF room.status === 'full':
          ↓ runRoomExclusive(roomId, async () => {
              ↓ nsp.to(roomId).emit('room:full', room)
              ↓ startGameIfFull({ roomId })
              ↓ gameController.handleStartGame(roomId)
              ↓ roomToGame.set(roomId, gameId)
              ↓ nsp.to(roomId).emit('game:start', { roomId, gameId, turnIndex, players })
          })
      ↓ cb({ ok: true, room })
  })

Frontend (socket.js)
  ← s.on('room:update', ...) → dispatch(listRooms()) + sync currentRoom
  ← s.on('room:full', ...) → setCountdown(3)
  ← s.on('game:start', ...) → navigate('/game')

Frontend (roomsSlice.js)
  ← joinRoom.fulfilled → state.current = room, localStorage.setItem('currentRoom')
```

### 3. Game Start and Reconnect Flow

**Automatic on socket connect/reconnect**

```
Frontend (socket.js::connectSocket)
  ↓ socket.on('connect', async () => {
      ↓ getStoredRoom() from localStorage
      ↓ IF room exists:
          ↓ debouncedRoomsList() // Validate room still exists
          ↓ IF NOT roomExists:
              ↓ localStorage.removeItem('currentRoom')
              ↓ emitHUD('hud:room-stale')
              ↓ RETURN
          ↓ socket.emit('session:join', { roomId })
          ↓ socket.emit('game:reconnect', { roomId })
  })

Backend (io.js::game:reconnect)
  ↓ targetRoom = roomId || userLastRoom.get(userId)
  ↓ IF !targetRoom:
      ↓ cb({ ok: false, code: 'E_NO_PRIOR_ROOM' })
  ↓ socket.join(targetRoom)
  ↓ userLastRoom.set(userId, targetRoom)
  ↓ roomRegistry.get(targetRoom).add(userId)
  ↓ gameId = roomToGame.get(targetRoom) || findPlayingGameIdByRoom(targetRoom)
  ↓ IF gameId:
      ↓ game = getGameDocument(gameId)
      ↓ nsp.to(socket.id).emit('game:start', { roomId, gameId, turnIndex, players })
      ↓ IF game.pendingDiceValue != null:
          ↓ nsp.to(socket.id).emit('dice:result', { roomId, gameId, value, skipped, turnIndex })
  ↓ cb({ ok: true, roomId, gameId })

Frontend (socket.js)
  ← s.on('game:start', ...) → dispatch(gameStarted(payload))
  ← s.on('dice:result', ...) → dispatch(diceResult(payload))
```

### 4. Gameplay Flow: Roll Dice

**Client Action**: Player clicks dice button

```
Frontend (Game.jsx)
  ↓ onRoll()
  ↓ dispatch(rollDice({ roomId }))

Frontend (gameSlice.js)
  ↓ socket.emit('dice:roll', { roomId })

Backend (io.js::dice:roll)
  ↓ gameId = roomToGame.get(roomId) || findPlayingGameIdByRoom(roomId)
  ↓ gameController.handleRoll({ gameId, userId })
  ↓ IF dice rolled successfully:
      ↓ calculateLegalMoves()
      ↓ IF no legal moves:
          ↓ rotateTurn()
          ↓ emit turn:change
      ↓ nsp.to(roomId).emit('dice:result', {
          roomId, gameId, value, skipped, legalTokens?, mustMove?, turnIndex, nextTurnIndex
        })
      ↓ cb({ ok: true, value, skipped, legalTokens, mustMove, turnIndex, nextTurnIndex })

Frontend (socket.js)
  ← s.on('dice:result', ...) → dispatch(diceResult(payload))
  ← s.on('turn:change', ...) → dispatch(updateTurn(payload.turnIndex))

Frontend (Game.jsx)
  ← rollDice.fulfilled → handle ack
  ← IF legalTokens.length === 1 && mustMove:
      ↓ dispatch(moveToken({ roomId, tokenIndex, steps }))
  ← ELSE IF legalTokens.length > 1:
      ↓ setPending({ value, legalTokens })
```

### 5. Gameplay Flow: Move Token

**Client Action**: Player clicks a token or selects from pending list

```
Frontend (Game.jsx)
  ↓ onTokenClick(tokenIndex) OR onClick pending token
  ↓ dispatch(moveToken({ roomId, tokenIndex, steps }))

Frontend (gameSlice.js)
  ↓ socket.emit('token:move', { roomId, tokenIndex, steps })

Backend (io.js::token:move)
  ↓ gameId = roomToGame.get(roomId) || findPlayingGameIdByRoom(roomId)
  ↓ gameController.handleMove({ gameId, userId, tokenIndex, steps })
  ↓ validateMove(game, playerIndex, tokenIndex, steps)
  ↓ applyMove(game, playerIndex, tokenIndex, steps)
  ↓ IF token captured opponent:
      ↓ capturedToken.state = 'base', stepsFromStart = 0
  ↓ IF token reached home:
      ↓ token.state = 'home'
      ↓ IF allTokensHome:
          ↓ game.status = 'finished', game.winnerUserId = userId
          ↓ nsp.to(roomId).emit('game:end', { roomId, gameId, winnerUserId })
  ↓ rotateTurn()
  ↓ game.pendingDiceValue = null
  ↓ nsp.to(roomId).emit('token:move', {
      roomId, gameId, playerIndex, tokenIndex, steps, newState, stepsFromStart, turnIndex
    })
  ↓ nsp.to(roomId).emit('turn:change', { roomId, gameId, turnIndex })
  ↓ cb({ ok: true })

Frontend (socket.js)
  ← s.on('token:move', ...) → dispatch(tokenMoved(payload))
  ← s.on('turn:change', ...) → dispatch(updateTurn(payload.turnIndex))
  ← s.on('game:end', ...) → dispatch(gameEnded(payload))

Frontend (Game.jsx)
  ← moveToken.fulfilled → setPending(null)
  ← Clear pending on turn:change or token:move
```

### 6. Leave Room Flow

**Client Action**: User clicks "Leave current"

```
Frontend (Lobby.jsx)
  ↓ onClick Leave button
  ↓ localStorage.removeItem('currentRoom') [IMMEDIATE]
  ↓ dispatch(setCurrentRoom(null)) [IMMEDIATE]
  ↓ dispatch(leaveRoom())

Frontend (roomsSlice.js)
  ↓ socket.emit('session:leave', { roomId })

Backend (io.js::session:leave)
  ↓ socket.leave(roomId)
  ↓ roomRegistry.get(roomId)?.delete(userId)
  ↓ IF roomRegistry.get(roomId).size === 0:
      ↓ roomRegistry.delete(roomId)
  ↓ nsp.emit('rooms:update')  [BROADCAST TO ALL]
  ↓ cb({ ok: true })

Frontend (socket.js)
  ← s.on('rooms:update', ...) → dispatch(listRooms())

Frontend (roomsSlice.js)
  ← leaveRoom.fulfilled → state.current = null, localStorage.removeItem('currentRoom')
```

## Event Summary Table

| Event               | Direction | Scope          | Trigger                          | Payload                                      |
|---------------------|-----------|----------------|----------------------------------|----------------------------------------------|
| `room:create`       | S→C       | Broadcast all  | Room created                     | `{ room }`                                   |
| `room:update`       | S→C       | Room only      | Player joins/leaves              | `{ room }`                                   |
| `rooms:update`      | S→C       | Broadcast all  | Room list changed                | (none, triggers list refresh)                |
| `room:error`        | S→C       | Socket only    | Join/create error                | `{ ok: false, code, roomId }`                |
| `room:full`         | S→C       | Room only      | Room reaches max players         | `{ room }`                                   |
| `game:start`        | S→C       | Room only      | Game initialized                 | `{ roomId, gameId, turnIndex, players }`     |
| `dice:result`       | S→C       | Room only      | Dice rolled                      | `{ roomId, gameId, value, skipped, ... }`    |
| `token:move`        | S→C       | Room only      | Token moved                      | `{ roomId, gameId, playerIndex, tokenIndex, steps, ... }` |
| `turn:change`       | S→C       | Room only      | Turn rotated                     | `{ roomId, gameId, turnIndex }`              |
| `game:end`          | S→C       | Room only      | Player wins                      | `{ roomId, gameId, winnerUserId }`           |

**Custom DOM Events** (Frontend only):
- `hud:reconnected` - Socket reconnected and game state restored
- `hud:room-stale` - Stored room no longer exists
- `hud:room-mismatch` - Event roomId differs from stored roomId

## Critical Backend Locks

1. **Per-user operation lock** (`opLock`): Prevents race between `session:join` and `game:reconnect`
2. **Per-room operation lock** (`roomLock`): Serializes `room:full` → `game:start` sequence

## Frontend State Management

### Redux Stores

**rooms** (`roomsSlice.js`)
- `list: []` - All available rooms
- `current: { roomId, ... }` - User's current room
- Synced with `localStorage.currentRoom`

**game** (`gameSlice.js`)
- `game: { roomId, gameId, players, ... }` - Full game state
- `turnIndex: number` - Current turn
- `lastDice: number` - Last rolled value
- `status: 'idle' | 'rolling' | 'moving'`

**socket** (`socketSlice.js`)
- `connected: boolean` - Socket connection status

### Socket Connection State

**connectionStats** (tracked in `socket.js`)
- `connects`, `disconnects`, `lastDisconnectReason`, `reconnectAttempts`
- Logs patterns to help diagnose network issues

## Debugging Checklist

When game doesn't start after room creation:

1. ✅ Backend emits `room:create`? Check logs for `socket:event:emit { event: 'room:create' }`
2. ✅ Backend emits `room:update`? Check logs for `socket:event:emit { event: 'room:update' }`
3. ✅ Room status is 'full'? Check `room.status === 'full'` in logs
4. ✅ Backend emits `room:full`? Check logs for `socket:event:emit { event: 'room:full' }`
5. ✅ Backend calls `handleStartGame`? Check logs for `socket:event:emit { event: 'game:start' }`
6. ✅ Frontend receives `game:start`? Check browser console for `socket:event { event: 'game:start' }`
7. ✅ Frontend navigates to `/game`? Check React Router navigation
8. ✅ Frontend `gameSlice` updates? Check Redux DevTools for `gameStarted` action

When events stop working:

1. ✅ Socket connected? Check `socket.connected` in Redux state
2. ✅ User in correct room? Check `socket.rooms` includes target roomId (backend logs)
3. ✅ `roomToGame` mapping exists? Check `roomToGame.get(roomId)` (backend logs)
4. ✅ Frontend listeners attached? Check `socket.__LUDO_WIRED__` flag
5. ✅ `currentRoom` in localStorage? Check Application → Local Storage in DevTools

## Best Practices

1. **Always verify room existence** before joining (frontend validates via `rooms:list`)
2. **Clear localStorage immediately** on leave to prevent auto-rejoin race
3. **Debounce room list calls** to prevent flooding backend
4. **Use per-user and per-room locks** to prevent race conditions
5. **Emit both room-scoped and broadcast events** where appropriate
6. **Log all critical events** with context (roomId, userId, gameId)
7. **Handle both success and error paths** in socket acknowledgments

## Recommended Enhancements (✅ IMPLEMENTED)

### 1. Socket Reconnection Handling ✅
- **Absolute timeout** (60 seconds) to prevent infinite reconnection loops
- Clear timeout on successful connection and re-enable reconnection for future
- Detailed connection stats logging with disconnect reasons and uptime tracking

**Implementation:**
```js
// Frontend: socket.js
const RECONNECT_ABSOLUTE_TIMEOUT = 60000; // 60 seconds total
socket.io.on('reconnect_attempt', (n) => {
  if (!connectionStats.reconnectTimeoutId && n === 1) {
    connectionStats.reconnectTimeoutId = setTimeout(() => {
      log.error('socket:reconnect:timeout', { totalAttempts: n });
      socket.io.opts.reconnection = false;
      socket.disconnect();
      emitHUD('hud:reconnect-failed', { reason: 'timeout' });
    }, RECONNECT_ABSOLUTE_TIMEOUT);
  }
});
```

### 2. Game State Snapshot on Reconnect ✅
- Complete game state (players, turnIndex) sent via `game:start`
- Pending dice value resent via `dice:result` if present
- Logged with sequence numbers for debugging

**Implementation:**
```js
// Backend: io.js::game:reconnect
const game = await gameController.getGameDocument(gameId);
if (game) {
  const gamePayload = enrichEventPayload({ 
    roomId, gameId, turnIndex: game.turnIndex, players: game.players 
  });
  nsp.to(socket.id).emit('game:start', gamePayload);
  logger.info('game:reconnect:snapshot', { userId, roomId, gameId, seq: gamePayload.seq });
  
  if (game.pendingDiceValue != null) {
    const dicePayload = enrichEventPayload({ 
      roomId, gameId, value: game.pendingDiceValue, ...
    });
    nsp.to(socket.id).emit('dice:result', dicePayload);
  }
}
```

### 3. Event Versioning ✅
- Every event includes `timestamp` (Date.now()) and `seq` (incrementing counter)
- Frontend filters out stale events from before last reconnect
- Prevents race conditions and duplicate processing

**Backend:**
```js
// io.js
let eventSequence = 0;
function enrichEventPayload(payload) {
  return { ...payload, timestamp: Date.now(), seq: ++eventSequence };
}

// All emits use enrichEventPayload:
nsp.to(roomId).emit('dice:result', enrichEventPayload({ roomId, value, ... }));
```

**Frontend:**
```js
// socket.js
let lastReconnectAt = 0;
function isStaleEvent(eventTimestamp) {
  return lastReconnectAt > 0 && eventTimestamp && eventTimestamp < lastReconnectAt;
}

socket.on('dice:result', (p) => {
  if (isStaleEvent(p?.timestamp)) {
    log.warn('socket:event:stale', { event: 'dice:result', eventTimestamp: p?.timestamp });
    return; // Ignore stale event
  }
  // Process event...
});
```

### 4. Room Mismatch Protection ✅
- Frontend checks if incoming event `roomId` matches stored `currentRoom`
- Events for wrong room are logged and ignored (not processed)
- Emits `hud:room-mismatch` custom event for UI feedback

**Implementation:**
```js
socket.on('dice:result', (p) => {
  const stored = getStoredRoom();
  if (stored?.roomId && p?.roomId && stored.roomId !== p.roomId) {
    log.warn('socket:event:room-mismatch', { 
      event: 'dice:result', stored: stored.roomId, eventRoom: p.roomId 
    });
    emitHUD('hud:room-mismatch', { stored: stored.roomId, eventRoom: p.roomId, event: 'dice:result' });
    return; // Don't process events for wrong room
  }
  // Process event...
});
```

### 5. Connection Stability Monitoring ✅
- Tracks: connects, disconnects, reconnect attempts, last disconnect reason
- Logs detailed stats on reconnect (uptime, patterns)
- Warns after 3+ consecutive reconnect attempts

**Implementation:**
```js
const connectionStats = {
  connects: 0,
  disconnects: 0,
  lastDisconnectReason: null,
  lastDisconnectAt: null,
  reconnectAttempts: 0,
  reconnectTimeoutId: null,
};

socket.on('connect', async () => {
  connectionStats.connects++;
  if (connectionStats.connects > 1) {
    logConnectionStats(); // Shows pattern analysis
  }
});

socket.on('disconnect', (reason) => {
  connectionStats.disconnects++;
  connectionStats.lastDisconnectReason = reason;
  connectionStats.lastDisconnectAt = Date.now();
});
```

## Event Enhancement Summary

All game events now include:
- `timestamp`: Unix milliseconds when event was created
- `seq`: Monotonic sequence number for ordering
- Backend logs include `seq` for tracing event flow

**Enhanced Events:**
- `game:start` - Full snapshot + timestamp + seq
- `dice:result` - Dice value + legal tokens + timestamp + seq  
- `token:move` - Move details + new state + timestamp + seq
- `turn:change` - Turn index + timestamp + seq
- `game:end` - Winner + final game state + timestamp + seq
- `room:create`, `room:update`, `room:full` - Room data + timestamp + seq
- `chat:message`, `reaction:emoji` - Message/emoji + timestamp + seq

## Testing the Enhancements

### Stale Event Detection
1. Join a game, note current `seq` in browser console
2. Disconnect and wait 3 seconds
3. Reconnect - observe `lastReconnectAt` marked
4. Any events with `timestamp < lastReconnectAt` are logged as stale and ignored

### Reconnection Timeout
1. Stop backend server
2. Frontend will attempt reconnect up to 10 times over 60 seconds
3. After 60 seconds, see `socket:reconnect:timeout` log
4. Socket disconnects and emits `hud:reconnect-failed` event

### Room Mismatch
1. Join room A, navigate to game
2. Server moves you to room B (simulate via backend)
3. Events from room B logged as mismatch and ignored
4. UI shows `hud:room-mismatch` notification

### Connection Stats
1. Toggle network on/off 3+ times
2. On reconnect, see `socket:connection:stats` log with:
   - Total connects/disconnects
   - Last disconnect reason
   - Time since last disconnect
   - Reconnect attempt count
