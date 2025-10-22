import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';

export default function Header() {
  const connected = useSelector((s) => s.socket.connected);
  const token = useSelector((s) => s.auth.token);
  const dispatch = useDispatch();
  return (
    <header className="border-b">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <nav className="space-x-4">
          <Link to="/login">Login</Link>
          <Link to="/lobby">Lobby</Link>
          <Link to="/game">Game</Link>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span>{connected ? 'Socket: connected' : 'Socket: disconnected'}</span>
          {token && (
            <button className="underline" onClick={() => dispatch(logout())}>Logout</button>
          )}
        </div>
      </div>
    </header>
  );
}
