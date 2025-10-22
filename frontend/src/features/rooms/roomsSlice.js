import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSocket } from '../../app/socket';

export const listRooms = createAsyncThunk('rooms/list', async (_, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) return [];
    const res = await new Promise((res) => s.emit('rooms:list', {}, res));
    return res.rooms || [];
  } catch (err) {
    return rejectWithValue(err.message || 'Failed to list rooms');
  }
});

export const createRoom = createAsyncThunk('rooms/create', async ({ stake, mode, maxPlayers }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const res = await new Promise((res) => s.emit('session:create', { stake, mode, maxPlayers }, res));
    if (!res?.ok) throw new Error(res?.message || 'Create failed');
    return res.room;
  } catch (err) {
    return rejectWithValue(err.message || 'Failed to create room');
  }
});

export const joinRoom = createAsyncThunk('rooms/join', async ({ roomId }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const res = await new Promise((res) => s.emit('session:join', { roomId }, res));
    if (!res?.ok) throw new Error(res?.message || 'Join failed');
    return res.room;
  } catch (err) {
    return rejectWithValue(err.message || 'Failed to join room');
  }
});

export const leaveRoom = createAsyncThunk('rooms/leave', async (_, { getState, rejectWithValue }) => {
  try {
    const s = getSocket();
    const roomId = getState()?.rooms?.current?.roomId;
    if (!s || !roomId) return { roomId: null };
    const res = await new Promise((res) => s.emit('session:leave', { roomId }, res));
    if (!res?.ok) throw new Error(res?.message || 'Leave failed');
    return { roomId };
  } catch (err) {
    return rejectWithValue(err.message || 'Failed to leave room');
  }
});

const persistedCurrent = typeof localStorage !== 'undefined' ? (() => {
  try {
    return JSON.parse(localStorage.getItem('currentRoom'));
  } catch {
    return null;
  }
})() : null;

const roomsSlice = createSlice({
  name: 'rooms',
  initialState: { list: [], current: persistedCurrent, status: 'idle', error: null },
  reducers: {
    setRooms(state, action) {
      state.list = action.payload || [];
    },
    setCurrentRoom(state, action) {
      state.current = action.payload || null;
      try {
        if (state.current) localStorage.setItem('currentRoom', JSON.stringify(state.current));
        else localStorage.removeItem('currentRoom');
      } catch (_e) {}
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(listRooms.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(listRooms.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload || [];
      })
      .addCase(listRooms.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createRoom.fulfilled, (state, action) => {
        if (action.payload) state.list.unshift(action.payload);
        state.current = action.payload || state.current;
        try {
          if (state.current) localStorage.setItem('currentRoom', JSON.stringify(state.current));
        } catch (_e) {}
      })
      .addCase(joinRoom.fulfilled, (state, action) => {
        state.current = action.payload || state.current;
        try {
          if (state.current) localStorage.setItem('currentRoom', JSON.stringify(state.current));
        } catch (_e) {}
      })
      .addCase(leaveRoom.fulfilled, (state) => {
        state.current = null;
        try {
          localStorage.removeItem('currentRoom');
        } catch (_e) {}
      });
  },
});

export const { setRooms, setCurrentRoom } = roomsSlice.actions;
export default roomsSlice.reducer;
