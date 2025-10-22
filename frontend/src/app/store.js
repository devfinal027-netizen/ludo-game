import { configureStore } from '@reduxjs/toolkit';

import auth from '../features/auth/authSlice';
import rooms from '../features/rooms/roomsSlice';
import game from '../features/game/gameSlice';
import socketState from '../features/socket/socketSlice';

export const store = configureStore({
  reducer: { auth, rooms, game, socket: socketState },
});
