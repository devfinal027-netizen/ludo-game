import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

export default function Header() {
  const connected = useSelector((s) => s.socket.connected);
  return (
    <header className="border-b">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <nav className="space-x-4">
          <Link to="/login">Login</Link>
          <Link to="/lobby">Lobby</Link>
          <Link to="/game">Game</Link>
        </nav>
        <div className="text-sm">{connected ? 'Socket: connected' : 'Socket: disconnected'}</div>
      </div>
    </header>
  );
}
