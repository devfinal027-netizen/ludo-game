import { createSlice } from '@reduxjs/toolkit';

const roomsSlice = createSlice({
  name: 'rooms',
  initialState: { list: [], current: null },
  reducers: {
    setRooms(state, action) {
      state.list = action.payload || [];
    },
    setCurrentRoom(state, action) {
      state.current = action.payload || null;
    },
  },
});

export const { setRooms, setCurrentRoom } = roomsSlice.actions;
export default roomsSlice.reducer;
