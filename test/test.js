const io = require('socket.io-client');

const base = 'http://localhost:3000';
const path = '/ludo';
const roomConfig = { stake: 10, mode: 'Classic', maxPlayers: 2 };

function ackWithTimeout(socket, event, data, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`${event} ack timeout`));
      }
    }, timeoutMs);
    socket.emit(event, data, (ack) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(ack);
      }
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function diceEmoji(n) {
  const emojis = ['🎲1','🎲2','🎲3','🎲4','🎲5','🎲6'];
  return emojis[n - 1] || `🎲${n}`;
}

async function main(token1, token2) {
  const c1 = io(`${base}${path}`, { path, auth: { token: `Bearer ${token1}` }, transports: ['websocket'] });
  const c2 = io(`${base}${path}`, { path, auth: { token: `Bearer ${token2}` }, transports: ['websocket'] });

  await Promise.all([
    new Promise(r => c1.on('connect', r)),
    new Promise(r => c2.on('connect', r)),
  ]);

  let roomId, gameId, currentTurn = 0;
  let userIdByIndex = [];
  let ended = false;

  function log(msg) { console.log(msg); }

  function socketForTurn() {
    return currentTurn === 0 ? c1 : c2;
  }

  // Game events
  function setupSocket(socket, name) {
    socket.on('game:start', (p) => {
      gameId = p.gameId;
      if (!roomId) roomId = p.roomId;
      userIdByIndex = p.players.map(x => x.userId);
      currentTurn = p.turnIndex;
      log(`[${name}] Game started. Players: ${p.players.map(x => x.userId).join(', ')}. First turn: Player ${currentTurn + 1}`);
    });
    socket.on('turn:change', (p) => {
      currentTurn = p.turnIndex;
      log(`[${name}] Turn changed: Player ${currentTurn + 1}`);
    });
    socket.on('game:end', (p) => {
      ended = true;
      log(`🏆 Winner: Player ${p.winnerUserId === userIdByIndex[0] ? 1 : 2}`);
    });
  }

  setupSocket(c1, 'C1');
  setupSocket(c2, 'C2');

  // 1) Create + Join
  const create = await ackWithTimeout(c1, 'session:create', roomConfig);
  roomId = create.room.roomId;
  await ackWithTimeout(c2, 'session:join', { roomId });

  // Wait for game:start
  for (let i = 0; i < 50 && !gameId; i++) await sleep(50);

  // 2) Play loop
  for (let i = 0; i < 500 && !ended; i++) {
    const actor = socketForTurn();
    const playerNumber = currentTurn + 1;

    const rollAck = await ackWithTimeout(actor, 'dice:roll', { roomId }).catch(e => ({ ok: false, message: String(e) }));

    if (!rollAck?.ok) {
      if (rollAck?.code === 'PENDING_MOVE' && typeof rollAck.pendingDiceValue === 'number') {
        const auto = await ackWithTimeout(actor, 'token:auto', { roomId });
        if (auto?.ended) break;
      }
      await sleep(150);
      continue;
    }

    log(`🎲 [Player ${playerNumber}] Rolled: ${diceEmoji(rollAck.value)}`);

    if (rollAck.mustMove) {
      const steps = rollAck.value;
      const tokenIndex = Array.isArray(rollAck.legalTokens) && rollAck.legalTokens.length > 0
        ? rollAck.legalTokens[0]
        : 0;

      log(`➡️ [Player ${playerNumber}] Moving token ${tokenIndex} by ${steps} step(s)`);

      const moveAck = await ackWithTimeout(actor, 'token:move', { roomId, tokenIndex, steps })
        .catch(e => ({ ok: false, message: String(e) }));

      if (moveAck?.ended) break;
    }

    await sleep(150);
  }

  c1.close();
  c2.close();
}

// Replace with your two JWTs
main('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4Zjg2NGI0NDAwMGI4ZjVkYjQyMDJmYiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzYxMTQxMTUzLCJleHAiOjE3NjE3NDU5NTN9.aa2Y_bod77UO8_V0LlXFWVD0w5MhhQBOHVr8tVyzKXU', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4Zjg3ZDFlMzNhYzMyMDE0OTgyNWQ5NiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzYxMTQxMTg1LCJleHAiOjE3NjE3NDU5ODV9.hj_3TcricENtafcgc1lccjNXAqQUJUmzMX0x0qJ_Nfg').catch(console.error);
