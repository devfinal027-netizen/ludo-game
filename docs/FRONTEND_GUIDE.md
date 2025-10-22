## Frontend Integration Guide (React + Vite, Redux, Tailwind/shadcn, GSAP/PixiJS)

### Overview
- Backend: Express REST + Socket.IO
- Socket path: `/ludo`, namespace: `/ludo`
- Auth: JWT (payload may contain `id` or `userId`)
- Realtime: lobby (room/session) and gameplay (dice/move) events

### API Base and Auth
- Base URL: `http://localhost:3000`
- Token: stored client-side and sent as `Authorization: Bearer <JWT>` for REST
- Socket.IO client must pass token via `auth: { token: 'Bearer <JWT>' }`

### REST Endpoints
- Auth: `/api/auth/*` (login/register/me/etc.)
- Users: `/api/users/me`
- Rooms: `/api/rooms/create`, `/api/rooms/join`, `/api/rooms`
- Games: `/api/games/*` (start/roll/move/end/get)
- Admin: `/api/admin/health`, `/api/auth/admin/register-agent`

### Socket Events
- `session:create` → ack `{ ok, room }`, broadcast `room:create`
- `session:join` → ack `{ ok, room }`, broadcasts: `room:update`, `room:full`, `game:start`
- `rooms:list` → ack `{ rooms }`
- `session:leave`/`room:leave` → ack `{ ok }`
- Gameplay:
  - `dice:roll` → ack `{ ok, gameId, value, turnIndex, skipped, nextTurnIndex, mustMove, legalTokens? }` + broadcast `dice:result` and (if skipped) `turn:change`
  - `token:move` → ack `{ ok, gameId, ended?, winnerUserId?, skipped?, nextTurnIndex? }` + broadcasts `token:move` and `turn:change` or `game:end`
  - `token:auto` → server picks a legal token for the pending dice
  - `game:get` → ack `{ ok, game }`

### Project Structure (suggested)
```
src/
  app/
    api.js
    socket.js
    store.js
  features/
    auth/authSlice.js
    rooms/roomsSlice.js
    game/gameSlice.js
    socket/socketSlice.js
  pages/
    Login.jsx
    Lobby.jsx
    Game.jsx
  components/
    CreateRoomDialog.jsx
    RoomList.jsx
    Header.jsx
  board/
    BoardRenderer.js
    layout.js
```

### Store
```javascript
// src/app/store.js
import { configureStore } from '@reduxjs/toolkit';
import auth from '../features/auth/authSlice';
import rooms from '../features/rooms/roomsSlice';
import game from '../features/game/gameSlice';
import socketState from '../features/socket/socketSlice';

export const store = configureStore({ reducer: { auth, rooms, game, socket: socketState } });
```

### Axios instance
```javascript
// src/app/api.js
import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE + '/api' });
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
export default api;
```

### Socket wiring
```javascript
// src/app/socket.js
import { io } from 'socket.io-client';
import { updateTurn, diceResult, gameStarted, gameEnded, tokenMoved } from '../features/game/gameSlice';
import { setConnected } from '../features/socket/socketSlice';

let socket;

export function connectSocket(getToken, dispatch) {
  if (socket) return socket;
  socket = io(`${import.meta.env.VITE_API_BASE}/ludo`, {
    path: '/ludo',
    transports: ['websocket'],
    auth: { token: `Bearer ${getToken()}` },
  });
  socket.on('connect', () => dispatch(setConnected(true)));
  socket.on('disconnect', () => dispatch(setConnected(false)));

  socket.on('game:start', (p) => dispatch(gameStarted(p)));
  socket.on('dice:result', (p) => dispatch(diceResult(p)));
  socket.on('turn:change', (p) => dispatch(updateTurn(p.turnIndex)));
  socket.on('token:move', (p) => dispatch(tokenMoved(p)));
  socket.on('game:end', (p) => dispatch(gameEnded(p)));

  return socket;
}

export function getSocket() { return socket; }
```

### Gameplay Loop Rules
- Only the player indicated by `turnIndex` should roll.
- After a roll with `mustMove === true`, you must send `token:move` (or `token:auto`).
- On auto-skip, `turn:change` is emitted automatically.

### Minimal Turn Handler
```javascript
// inside a component or thunk
const s = getSocket();
const rollAck = await new Promise(res => s.emit('dice:roll', { roomId }, res));
if (rollAck?.ok) {
  if (rollAck.mustMove) {
    const tokenIndex = rollAck.legalTokens?.[0] ?? 0;
    const moveAck = await new Promise(res => s.emit('token:move', { roomId, tokenIndex, steps: rollAck.value }, res));
    // handle moveAck.ended, otherwise await turn:change
  }
}
```

### UI (shadcn + Tailwind)
- Use shadcn/ui components: Dialog, Select, Button, Card, Toast
- Tailwind for layout and utilities
- Suggested pages:
  - Login → store token → connect socket
  - Lobby → create/join rooms
  - Game → board render + controls (roll, token selection)

### Board Rendering (GSAP/PixiJS)
- Maintain logical positions from backend in Redux (`game.players[].tokens[]`)
- Map indices to coordinates in `layout.js`
- On `token:move` broadcast, animate from previous to new coordinates
- GSAP example:
```javascript
import gsap from 'gsap';
function animateToken(el, toX, toY) {
  gsap.to(el, { x: toX, y: toY, duration: 0.4, ease: 'power2.out' });
}
```
- PixiJS approach: render tokens as sprites, tween with ticker or GSAP PixiPlugin

### Environment
- `.env`
```
VITE_API_BASE=http://localhost:3000
```

### Postman Realtime
- Use Socket.IO request (not WebSocket)
- URL: `http://localhost:3000/ludo`, Path: `/ludo`, Namespace: `/ludo`
- Auth via `Authorization: Bearer <JWT>` header or connection auth token

### Gotchas
- Ensure roll button is disabled unless it’s your turn (matches `turnIndex`)
- After rolling a 6, a move is mandatory before any next roll
- Always pass `path: '/ludo'` in Socket.IO client
