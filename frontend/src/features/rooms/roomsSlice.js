import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSocket, getRoomsList } from '../../app/socket';
import { log } from '../../app/logger';

export const listRooms = createAsyncThunk('rooms/list', async (_, { rejectWithValue }) => {
  try {
    // Use debounced helper to prevent flooding
    const res = await getRoomsList();
    return res.rooms || [];
  } catch (err) {
    return rejectWithValue(err.message || 'Failed to list rooms');
  }
});

export const createRoom = createAsyncThunk('rooms/create', async ({ stake, mode, maxPlayers }, { getState, rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    
    // Optional: prevent creating new room if already in one (production-ready)
    const currentRoom = getState()?.rooms?.current;
    if (currentRoom?.roomId) {
      log.warn('rooms:create:already_in_room', { currentRoom: currentRoom.roomId });
      // Uncomment to enforce single-room policy:
      // throw new Error('Already in a room. Please leave current room first.');
    }
    
    const res = await new Promise((res) => s.emit('session:create', { stake, mode, maxPlayers }, res));
    if (!res?.ok) throw new Error(res?.message || 'Create failed');
    log.info('rooms:create:success', { roomId: res.room?.roomId });
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
    if (!res?.ok) return rejectWithValue({ code: res?.code, message: res?.message || 'Join failed' });
    return res.room;
  } catch (err) {
    // err may be a plain message or an object from the previous branch
    if (err && err.message && !err.code) return rejectWithValue({ message: err.message });
    return rejectWithValue(err || { message: 'Failed to join room' });
  }
});

export const leaveRoom = createAsyncThunk('rooms/leave', async (_, { getState, dispatch, rejectWithValue }) => {
  try {
    const s = getSocket();
    const roomId = getState()?.rooms?.current?.roomId;
    
    // Log room abandonment for tracking
    if (roomId) {
      log.info('rooms:leave:initiated', { roomId });
    }
    
    // Clear state and storage IMMEDIATELY to prevent socket auto-rejoin race condition
    try { localStorage.removeItem('currentRoom'); } catch (_e) {}
    dispatch(setCurrentRoom(null));
    
    if (!s) return { roomId: null };
    // If we don't have a specific room, request leave-all on server
    const payload = roomId ? { roomId } : {};
    const res = await new Promise((res) => s.emit('session:leave', payload, res));
    if (!res?.ok) throw new Error(res?.message || 'Leave failed');
    
    log.info('rooms:leave:success', { roomId, leftAll: !!res.leftAll });
    return { roomId: roomId || null, leftAll: !!res.leftAll };
  } catch (err) {
    log.error('rooms:leave:failed', { roomId: getState()?.rooms?.current?.roomId, error: err.message });
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
      })
      .addCase(leaveRoom.rejected, (state, action) => {
        // Fail-safe: clear client-side room on failure to avoid sticky state
        state.current = null;
        state.error = (action.payload && action.payload.message) || action.error?.message || 'Failed to leave room';
        try { localStorage.removeItem('currentRoom'); } catch (_e) {}
      });
  },
});

export const { setRooms, setCurrentRoom } = roomsSlice.actions;
export default roomsSlice.reducer;
