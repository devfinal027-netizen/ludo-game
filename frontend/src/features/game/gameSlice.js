import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  game: null,
  turnIndex: 0,
  lastDice: null,
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
});

export const { gameStarted, diceResult, updateTurn, tokenMoved, gameEnded, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
