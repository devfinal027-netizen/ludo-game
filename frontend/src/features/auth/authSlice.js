import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../app/api';

export const login = createAsyncThunk(
  'auth/login',
  async ({ phone, password }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/login', { phone, password });
            return res.data;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message || 'Login failed');
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async ({ phone, password, fullName, invitedBy, telegramId }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/register', {
        phone,
        password,
        fullName,
        invitedBy,
        telegramId,
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message || 'Register failed');
    }
  },
);

export const fetchMe = createAsyncThunk(
  'auth/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/auth/me');
      return res.data?.user || res.data;
    } catch (err) {
      return rejectWithValue(err?.response?.data?.message || err.message || 'Fetch profile failed');
    }
  },
);

const initialState = {
  token: typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
  status: 'idle',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken(state, action) {
      state.token = action.payload;
      if (action.payload) localStorage.setItem('token', action.payload);
      else localStorage.removeItem('token');
    },
    setUser(state, action) {
      state.user = action.payload;
    },
    logout(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const token = action.payload?.token;
        const user = action.payload?.user || null;
        state.token = token || null;
        state.user = user;
        if (token) localStorage.setItem('token', token);
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Login failed';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const token = action.payload?.token;
        const user = action.payload?.user || null;
        state.token = token || null;
        state.user = user;
        if (token) localStorage.setItem('token', token);
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Register failed';
      })
      .addCase(fetchMe.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload || null;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Fetch profile failed';
      });
  },
});

export const { setToken, setUser, logout } = authSlice.actions;
export default authSlice.reducer;
