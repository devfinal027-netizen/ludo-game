import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { login as loginThunk, register as registerThunk, fetchMe } from '../features/auth/authSlice';

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
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h2>
          <button type="button" className="text-sm underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
        {mode === 'register' && (
          <input className="w-full border rounded px-3 py-2" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        )}
        <input className="w-full border rounded px-3 py-2" placeholder="Phone (e.g. 09..., 07..., +251...)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === 'register' && (
          <>
            <input className="w-full border rounded px-3 py-2" placeholder="Invited by (referral code, optional)" value={invitedBy} onChange={(e) => setInvitedBy(e.target.value)} />
            <input className="w-full border rounded px-3 py-2" placeholder="Telegram ID (optional)" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
          </>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-black text-white rounded px-3 py-2" disabled={status === 'loading'}>
          {status === 'loading' ? '...' : mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
    </div>
  );
}
