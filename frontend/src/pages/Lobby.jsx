import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { connectSocket } from '../app/socket';

export default function Lobby() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    connectSocket(() => token, dispatch);
  }, [dispatch, navigate, token]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Lobby</h2>
      <p className="text-sm text-muted-foreground">Scaffold ready. Room list and actions coming next.</p>
    </div>
  );
}
