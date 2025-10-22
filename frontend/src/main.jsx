import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Lobby from './pages/Lobby.jsx'
import Game from './pages/Game.jsx'
import RequireAuth from './components/RequireAuth.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="login" element={<Login />} />
            <Route
              path="lobby"
              element={(
                <RequireAuth>
                  <Lobby />
                </RequireAuth>
              )}
            />
            <Route
              path="game"
              element={(
                <RequireAuth>
                  <Game />
                </RequireAuth>
              )}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
