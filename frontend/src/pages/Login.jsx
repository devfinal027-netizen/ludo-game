import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { login as loginThunk, register as registerThunk, fetchMe } from '../features/auth/authSlice';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [invitedBy, setInvitedBy] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [error, setError] = useState('');
  const status = useSelector((s) => s.auth.status);
  const token = useSelector((s) => s.auth.token);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/lobby';

  useEffect(() => {
    if (token) {
      dispatch(fetchMe()).finally(() => navigate(from, { replace: true }));
    }
  }, [dispatch, token, navigate, from]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        const res = await dispatch(loginThunk({ phone, password }));
        if (res.error) throw new Error(res.payload || 'Login failed');
      } else {
        const res = await dispatch(registerThunk({ phone, password, fullName, invitedBy, telegramId }));
        if (res.error) throw new Error(res.payload || 'Register failed');
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{ background: 'radial-gradient(400px 200px at 20% 30%, rgba(99,102,241,.25), transparent), radial-gradient(500px 200px at 80% 60%, rgba(34,197,94,.2), transparent)'}} />
      <Card sx={{ maxWidth: 440 }} className="backdrop-blur-md border border-white/10 shadow-2xl bg-white/5">
        <CardContent>
          <form onSubmit={onSubmit} className="w-full space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h2>
              <button type="button" className="text-sm underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'Need an account?' : 'Have an account?'}
              </button>
            </div>
            {mode === 'register' && (
              <input className="w-full border rounded px-3 py-2 bg-transparent border-white/20" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            )}
            <input className="w-full border rounded px-3 py-2 bg-transparent border-white/20" placeholder="Phone (e.g. 09..., 07..., +251...)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="w-full border rounded px-3 py-2 bg-transparent border-white/20" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'register' && (
              <>
                <input className="w-full border rounded px-3 py-2 bg-transparent border-white/20" placeholder="Invited by (referral code, optional)" value={invitedBy} onChange={(e) => setInvitedBy(e.target.value)} />
                <input className="w-full border rounded px-3 py-2 bg-transparent border-white/20" placeholder="Telegram ID (optional)" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
              </>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button variant="contained" disabled={status === 'loading'} type="submit" color="primary" fullWidth>
              {status === 'loading' ? '...' : mode === 'login' ? 'Login' : 'Register'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
