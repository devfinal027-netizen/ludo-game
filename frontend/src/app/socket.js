import { io } from 'socket.io-client';
import { updateTurn, diceResult, gameStarted, gameEnded, tokenMoved, fetchGame } from '../features/game/gameSlice';
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
  socket.on('connect_error', () => dispatch(setConnected(false)));

  socket.on('game:start', (p) => dispatch(gameStarted(p)));
  socket.on('dice:result', (p) => {
    dispatch(diceResult(p));
    p?.roomId && dispatch(fetchGame({ roomId: p.roomId }));
  });
  socket.on('turn:change', (p) => {
    dispatch(updateTurn(p.turnIndex));
    p?.roomId && dispatch(fetchGame({ roomId: p.roomId }));
  });
  socket.on('token:move', (p) => {
    dispatch(tokenMoved(p));
    p?.roomId && dispatch(fetchGame({ roomId: p.roomId }));
  });
  socket.on('game:end', (p) => {
    dispatch(gameEnded(p));
    p?.roomId && dispatch(fetchGame({ roomId: p.roomId }));
  });

  return socket;
}

export function getSocket() { return socket; }
