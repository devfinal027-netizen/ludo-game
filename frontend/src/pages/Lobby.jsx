import { useEffect, useState } from 'react';
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
  const [stake, setStake] = useState(10);
  const [mode, setMode] = useState('Classic');
  const [maxPlayers, setMaxPlayers] = useState(2);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    const s = connectSocket(() => token, dispatch);
    const onRoomUpdate = () => dispatch(listRooms());
    s.on('room:create', onRoomUpdate);
    s.on('room:update', onRoomUpdate);
    s.on('room:full', onRoomUpdate);
    s.on('game:start', (payload) => {
      // navigate to game view when game starts
      navigate('/game');
    });
    dispatch(listRooms());
    return () => {
      s.off('room:create', onRoomUpdate);
      s.off('room:update', onRoomUpdate);
      s.off('room:full', onRoomUpdate);
      s.off('game:start');
    };
  }, [dispatch, navigate, token]);

  async function onCreate() {
    await dispatch(createRoom({ stake: Number(stake), mode, maxPlayers: Number(maxPlayers) }));
  }

  async function onJoin(roomId) {
    const res = await dispatch(joinRoom({ roomId }));
    if (!res.error) navigate('/game');
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Lobby</h2>
      <div className="text-sm text-gray-400">Current room: {useSelector((s) => s.rooms.current)?.roomId || '-'}</div>
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
        <Button variant="outlined" onClick={() => dispatch(leaveRoom())}>Leave current</Button>
      </div>

      <div>
        <h3 className="font-medium mb-2">Open Rooms</h3>
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
    </div>
  );
}
