import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  token: typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
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
});

export const { setToken, setUser, logout } = authSlice.actions;
export default authSlice.reducer;
