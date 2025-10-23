import axios from 'axios';
import { log } from './logger';

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_BASE}/api` });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  log.info('http:request', { method: cfg.method?.toUpperCase(), url: cfg.url, baseURL: cfg.baseURL });
  return cfg;
});
api.interceptors.response.use(
  (res) => {
    log.info('http:response', { status: res.status, url: res.config?.url });
    return res;
  },
  (err) => {
    log.error('http:error', { message: err?.message, url: err?.config?.url, status: err?.response?.status });
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/me/change-password', data),
};

// Users
export const usersApi = {
  me: () => api.get('/users/me'),
};

// Rooms
export const roomsApi = {
  create: (data) => api.post('/rooms/create', data),
  join: (data) => api.post('/rooms/join', data),
  listWaiting: () => api.get('/rooms', { params: { status: 'waiting' } }),
};

// Games
export const gamesApi = {
  getById: (gameId) => api.get(`/games/${gameId}`),
  getCurrentByRoom: (roomId) => api.get(`/games/room/${roomId}/current`),
  start: (data) => api.post('/games/start', data),
  roll: (data) => api.post('/games/dice/roll', data),
  move: (data) => api.post('/games/token/move', data),
  end: (data) => api.post('/games/end', data),
};

export default api;
