import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { connectSocket, getSocket } from '../app/socket';
import { listRooms, createRoom, joinRoom, leaveRoom } from '../features/rooms/roomsSlice';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';

export default function Lobby() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const rooms = useSelector((s) => s.rooms.list);
  const currentRoom = useSelector((s) => s.rooms.current);
  const [stake, setStake] = useState(10);
  const [mode, setMode] = useState('Classic');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [countdown, setCountdown] = useState(0);
  const [autoCreate, setAutoCreate] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    const s = connectSocket(() => token, dispatch);
    const onRoomUpdate = (room) => {
      dispatch(listRooms());
      // If this update is for our current room, sync it
      if (room?.roomId === currentRoom?.roomId) {
        dispatch({ type: 'rooms/setCurrentRoom', payload: room });
      }
    };
    const onRoomsUpdate = () => dispatch(listRooms());
    const onRoomError = (e) => {
      const code = e?.code;
      if (code === 'E_NO_ROOM') setError('Room not found. Please refresh the room list.');
      else setError(e?.message || 'Room error occurred.');
    };
    s.on('room:create', onRoomUpdate);
    s.on('room:update', onRoomUpdate);
    s.on('rooms:update', onRoomsUpdate);
    s.on('room:error', onRoomError);
    const onRoomFull = (payload) => {
      // Start a short countdown before navigating
      console.log('[Lobby] room:full received', payload);
      setCountdown(3);
      const iv = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(iv);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    };
    const onGameStart = (payload) => {
      console.log('[Lobby] game:start received, navigating to /game', payload);
      setCountdown(0); // Clear countdown
      navigate('/game');
    };
    s.on('room:full', onRoomFull);
    s.on('game:start', onGameStart);
    dispatch(listRooms());
    return () => {
      s.off('room:create', onRoomUpdate);
      s.off('room:update', onRoomUpdate);
      s.off('rooms:update', onRoomsUpdate);
      s.off('room:error', onRoomError);
      s.off('room:full', onRoomFull);
      s.off('game:start', onGameStart);
    };
  }, [dispatch, navigate, token]);

  async function onCreate() {
    await dispatch(createRoom({ stake: Number(stake), mode, maxPlayers: Number(maxPlayers) }));
  }

  async function onJoin(roomId) {
    setError('');
    // 1) Verify the room exists before trying to join
    const listed = await dispatch(listRooms());
    const available = Array.isArray(listed.payload) ? listed.payload : rooms;
    const exists = (available || []).some((r) => r.roomId === roomId);
    if (!exists) {
      if (autoCreate) {
        // 2) Optional auto-create fallback
        const created = await dispatch(createRoom({ stake: Number(stake), mode, maxPlayers: Number(maxPlayers) }));
        if (created.error || !created.payload?.roomId) {
          setError('Failed to auto-create room. Please refresh and try again.');
          return;
        }
        roomId = created.payload.roomId;
      } else {
        setError('Room not found. Please refresh the room list.');
        return;
      }
    }
    // 3) Join with error handling and friendly messages
    const res = await dispatch(joinRoom({ roomId }));
    if (res.error) {
      const code = res.payload?.code;
      if (code === 'E_ROOM_NOT_AVAILABLE') setError('Room not found. Please refresh the list.');
      else if (code === 'E_NO_PRIOR_ROOM') setError('No prior room to reconnect. Join a room first.');
      else setError(res.payload?.message || 'Failed to join room.');
      return;
    }
    navigate('/game');
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Lobby</h2>
      <div className="text-sm text-gray-400">Current room: {currentRoom?.roomId || '-'}</div>
      {currentRoom?.roomId && (
        <div className="text-xs text-amber-300">Share this code with your friend: <span className="font-mono">{currentRoom.roomId}</span></div>
      )}
      <div className="flex gap-2 items-end">
        <div>
          <label className="text-sm block">Stake</label>
          <input className="border rounded px-2 py-1 w-24" type="number" value={stake} onChange={(e) => setStake(e.target.value)} />
        </div>
        <div>
          <label className="text-sm block">Mode</label>
          <select className="border rounded px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option>Classic</option>
            <option>Quick</option>
          </select>
        </div>
        <div>
          <label className="text-sm block">Players</label>
          <select className="border rounded px-2 py-1" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)}>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </div>
        <Button variant="contained" onClick={onCreate}>Create</Button>
        <Button
          variant="outlined"
          disabled={!currentRoom?.roomId}
          onClick={async () => {
            setError('');
            await dispatch(leaveRoom());
            setCountdown(0);
            await dispatch(listRooms());
          }}
        >
          Leave current
        </Button>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
          Auto-create if missing
        </label>
      </div>

      <div>
        <h3 className="font-medium mb-2">Open Rooms</h3>
        {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.length === 0 && <div className="p-3 text-sm text-gray-500">No rooms yet</div>}
          {rooms.map((r) => (
            <Card key={r.roomId} className="bg-white/5 backdrop-blur border border-white/10">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{r.mode} · Stake {r.stake}</div>
                  <div className="text-gray-400">{r.players?.length || 0}/{r.maxPlayers} · {r.status}</div>
                </div>
                <Button size="small" variant="outlined" onClick={() => onJoin(r.roomId)}>Join</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {countdown > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="text-6xl font-bold text-amber-300 animate-pulse">{countdown}</div>
        </div>
      )}
    </div>
  );
}
