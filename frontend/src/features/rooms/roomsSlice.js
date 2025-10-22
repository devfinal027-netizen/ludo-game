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

const roomsSlice = createSlice({
  name: 'rooms',
  initialState: { list: [], current: null, status: 'idle', error: null },
  reducers: {
    setRooms(state, action) {
      state.list = action.payload || [];
    },
    setCurrentRoom(state, action) {
      state.current = action.payload || null;
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
      })
      .addCase(joinRoom.fulfilled, (state, action) => {
        state.current = action.payload || state.current;
      });
  },
});

export const { setRooms, setCurrentRoom } = roomsSlice.actions;
export default roomsSlice.reducer;
