import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSocket } from '../../app/socket';

export const rollDice = createAsyncThunk('game/rollDice', async ({ roomId }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const ack = await new Promise((res) => s.emit('dice:roll', { roomId }, res));
    if (!ack?.ok) throw new Error(ack?.message || 'Roll failed');
    return ack;
  } catch (err) {
    return rejectWithValue(err.message || 'Roll failed');
  }
});

export const moveToken = createAsyncThunk('game/moveToken', async ({ roomId, tokenIndex, steps }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const ack = await new Promise((res) => s.emit('token:move', { roomId, tokenIndex, steps }, res));
    if (!ack?.ok) throw new Error(ack?.message || 'Move failed');
    return ack;
  } catch (err) {
    return rejectWithValue(err.message || 'Move failed');
  }
});

const initialState = {
  game: null,
  turnIndex: 0,
  lastDice: null,
  status: 'idle',
  error: null,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    gameStarted(state, action) {
      state.game = action.payload;
      state.turnIndex = action.payload?.turnIndex ?? 0;
    },
    diceResult(state, action) {
      state.lastDice = action.payload?.value ?? null;
    },
    updateTurn(state, action) {
      state.turnIndex = action.payload;
    },
    tokenMoved(state, action) {
      // placeholder for token updates
    },
    gameEnded(state) {
      // placeholder for end handling
    },
    resetGame(state) {
      state.game = null;
      state.turnIndex = 0;
      state.lastDice = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(rollDice.pending, (state) => {
        state.status = 'rolling';
        state.error = null;
      })
      .addCase(rollDice.fulfilled, (state, action) => {
        state.status = 'idle';
        state.lastDice = action.payload.value;
      })
      .addCase(rollDice.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload;
      })
      .addCase(moveToken.pending, (state) => {
        state.status = 'moving';
        state.error = null;
      })
      .addCase(moveToken.fulfilled, (state) => {
        state.status = 'idle';
      })
      .addCase(moveToken.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload;
      });
  },
});

export const { gameStarted, diceResult, updateTurn, tokenMoved, gameEnded, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
