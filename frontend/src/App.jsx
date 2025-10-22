import { Outlet } from 'react-router-dom'
import Header from './components/Header'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { connectSocket } from './app/socket'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#22c55e' },
    secondary: { main: '#06b6d4' },
    background: { default: '#0f172a', paper: 'rgba(17, 24, 39, 0.7)' },
  },
  shape: { borderRadius: 12 },
});

export default function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) connectSocket(() => token, dispatch);
  }, [dispatch]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="min-h-screen text-gray-100 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0f172a] to-[#1e293b]">
        <div className="pointer-events-none fixed inset-0 opacity-30" style={{ background: 'radial-gradient(600px 200px at 10% 10%, rgba(59,130,246,.25), transparent), radial-gradient(600px 200px at 90% 30%, rgba(34,197,94,.2), transparent), radial-gradient(400px 150px at 50% 80%, rgba(250,204,21,.12), transparent)'}} />
        <Header />
        <main className="container mx-auto p-6">
          <h1 className="text-2xl font-semibold">Ludo</h1>
          <p className="text-slate-400 mt-2">Neon-themed multiplayer board game</p>
          <div className="mt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
