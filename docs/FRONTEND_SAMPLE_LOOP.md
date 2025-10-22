## Sample Turn Loop (React + socket.io-client)

This example shows a safe loop that only allows the active player to roll and moves automatically when required.

```javascript
import { io } from 'socket.io-client';

const base = import.meta.env.VITE_API_BASE;
const path = '/ludo';

function ack(socket, event, data, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error(`${event} timeout`)); } }, timeoutMs);
    socket.emit(event, data, (res) => { if (!done) { done = true; clearTimeout(t); resolve(res); } });
  });
}

export async function runMatch(token1, token2) {
  const c1 = io(`${base}${path}`, { path, transports: ['websocket'], auth: { token: `Bearer ${token1}` } });
  const c2 = io(`${base}${path}`, { path, transports: ['websocket'], auth: { token: `Bearer ${token2}` } });

  await Promise.all([ new Promise(r => c1.on('connect', r)), new Promise(r => c2.on('connect', r)) ]);

  let roomId, gameId, turnIndex = 0, players = [], ended = false;

  const onStart = (p) => { roomId = p.roomId; gameId = p.gameId; players = p.players; turnIndex = p.turnIndex; };
  const onTurn = (p) => { turnIndex = p.turnIndex; };
  const onEnd = () => { ended = true; };

  c1.on('game:start', onStart); c2.on('game:start', onStart);
  c1.on('turn:change', onTurn); c2.on('turn:change', onTurn);
  c1.on('game:end', onEnd); c2.on('game:end', onEnd);

  const created = await ack(c1, 'session:create', { stake: 10, mode: 'Classic', maxPlayers: 2 });
  roomId = created.room.roomId;
  await ack(c2, 'session:join', { roomId });

  // wait for game:start
  for (let i = 0; i < 50 && !gameId; i++) await new Promise(r => setTimeout(r, 50));

  const sockets = [c1, c2];
  const actor = () => sockets[turnIndex];

  while (!ended) {
    const s = actor();
    const roll = await ack(s, 'dice:roll', { roomId }).catch(() => null);
    if (!roll?.ok) { await new Promise(r => setTimeout(r, 150)); continue; }
    if (roll.mustMove) {
      const tokenIndex = (roll.legalTokens?.[0] ?? 0);
      const move = await ack(s, 'token:move', { roomId, tokenIndex, steps: roll.value }).catch(() => null);
      if (move?.ended) break;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  c1.close(); c2.close();
}
```
