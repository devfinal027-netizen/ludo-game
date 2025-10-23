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

export const autoMove = createAsyncThunk('game/autoMove', async ({ roomId }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const ack = await new Promise((res) => s.emit('token:auto', { roomId }, res));
    if (!ack?.ok) throw new Error(ack?.message || 'Auto move failed');
    return ack;
  } catch (err) {
    return rejectWithValue(err.message || 'Auto move failed');
  }
});

export const fetchGame = createAsyncThunk('game/fetchGame', async ({ roomId }, { rejectWithValue }) => {
  try {
    const s = getSocket();
    if (!s) throw new Error('Socket not connected');
    const ack = await new Promise((res) => s.emit('game:get', { roomId }, res));
    if (!ack?.ok) throw new Error(ack?.message || 'Game not found');
    if (!ack.game) throw new Error('Empty game payload');
    return ack.game;
  } catch (err) {
    return rejectWithValue(err.message || 'Fetch game failed');
  }
});

const initialState = {
  game: null,
  turnIndex: 0,
  lastDice: null,
  pendingDice: null, // { value, playerIndex } - restored from backend
  status: 'idle',
  error: null,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    gameStarted(state, action) {
      // Accept either a full game snapshot or a partial payload
      const p = action.payload || {};
      // Prefer full snapshot if provided
      if (p && p.players && Array.isArray(p.players)) {
        state.game = p;
      } else {
        state.game = state.game || {};
        state.game = { ...state.game, ...p };
      }
      state.turnIndex = p?.turnIndex != null ? p.turnIndex : (state.turnIndex || 0);
      if (p?.roomId) state.game.roomId = p.roomId;
      // Restore pending dice if present
      if (p?.pendingDiceValue != null && p?.pendingDicePlayerIndex != null) {
        state.pendingDice = { value: p.pendingDiceValue, playerIndex: p.pendingDicePlayerIndex };
      } else {
        state.pendingDice = null;
      }
    },
    diceResult(state, action) {
      state.lastDice = action.payload?.value ?? null;
      // Update turnIndex if provided (e.g., after skipped roll)
      if (action.payload?.turnIndex != null) {
        state.turnIndex = action.payload.turnIndex;
      }
      // Set pending dice if not skipped and has legal moves
      const p = action.payload;
      if (!p?.skipped && p?.value != null && Array.isArray(p?.legalTokens) && p.legalTokens.length > 0) {
        state.pendingDice = { value: p.value, playerIndex: state.turnIndex, legalTokens: p.legalTokens };
      } else {
        state.pendingDice = null;
      }
    },
    updateTurn(state, action) {
      state.turnIndex = action.payload;
    },
    tokenMoved(state, action) {
      const p = action.payload || {};
      // Clear pending dice after move
      state.pendingDice = null;
      // If server sent a full game snapshot, replace it
      if (p.game && p.game.players && Array.isArray(p.game.players)) {
        state.game = p.game;
        if (p.game.turnIndex != null) state.turnIndex = p.game.turnIndex;
        return;
      }
      // Otherwise, try to reconcile minimally
      if (!state.game || !Array.isArray(state.game.players)) return;
      const playerIndex = p.playerIndex != null ? Number(p.playerIndex) : undefined;
      const tokenIndex = p.tokenIndex != null ? Number(p.tokenIndex) : undefined;
      if (Number.isInteger(playerIndex) && Number.isInteger(tokenIndex)) {
        const player = state.game.players[playerIndex];
        if (player && Array.isArray(player.tokens) && player.tokens[tokenIndex]) {
          const t = player.tokens[tokenIndex];
          if (p.newState) t.state = p.newState;
          if (p.state) t.state = p.state;
          if (p.stepsFromStart != null) t.stepsFromStart = Number(p.stepsFromStart);
        }
      }
      if (p.turnIndex != null) state.turnIndex = Number(p.turnIndex);
    },
    gameEnded(state, action) {
      // Mark game as ended; if server provided a final snapshot, use it
      const p = action.payload || {};
      if (p.game && p.game.players && Array.isArray(p.game.players)) {
        state.game = p.game;
      }
      state.status = 'idle';
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
      })
      .addCase(autoMove.pending, (state) => {
        state.status = 'moving';
        state.error = null;
      })
      .addCase(autoMove.fulfilled, (state) => {
        state.status = 'idle';
      })
      .addCase(autoMove.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload;
      })
      .addCase(fetchGame.fulfilled, (state, action) => {
        state.game = action.payload || state.game;
        if (action.payload?.turnIndex != null) state.turnIndex = action.payload.turnIndex;
        // Restore pending dice if backend has one
        const game = action.payload;
        if (game?.pendingDiceValue != null && game?.pendingDicePlayerIndex != null) {
          state.pendingDice = { value: game.pendingDiceValue, playerIndex: game.pendingDicePlayerIndex };
        } else {
          state.pendingDice = null;
        }
      });
  },
});

export const { gameStarted, diceResult, updateTurn, tokenMoved, gameEnded, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
