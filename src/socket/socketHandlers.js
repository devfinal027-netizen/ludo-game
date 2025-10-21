const jwt = require('jsonwebtoken');
const { initializeGame, handleDiceRoll, handleTokenMove } = require('../controllers/gameController');
const Room = require('../models/Room');
const Game = require('../models/Game');

/**
 * Socket authentication middleware
 */
const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

/**
 * Initialize socket handlers
 */
const initializeSocketHandlers = (io) => {
  // Create namespace for Ludo game
  const ludoNamespace = io.of('/ludo');

  // Apply authentication middleware
  ludoNamespace.use(authenticateSocket);

  ludoNamespace.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.userId}`);

    /**
     * Join a room (socket room for real-time updates)
     */
    socket.on('room:join', async (data) => {
      try {
        const { roomId } = data;
        
        const room = await Room.findOne({ roomId })
          .populate('players.userId', 'username firstName lastName');

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is a player in this room
        const isPlayer = room.players.some(
          p => p.userId._id.toString() === socket.user.userId
        );

        if (!isPlayer) {
          socket.emit('error', { message: 'You are not a player in this room' });
          return;
        }

        // Join socket room
        socket.join(roomId);
        
        // Send room state to the user
        socket.emit('room:joined', {
          room: {
            roomId: room.roomId,
            stakeValue: room.stakeValue,
            mode: room.mode,
            maxPlayers: room.maxPlayers,
            status: room.status,
            players: room.players
          }
        });

        // Notify other players
        socket.to(roomId).emit('player:joined', {
          userId: socket.user.userId,
          playerCount: room.players.length
        });

      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Handle game start (when room is full)
     */
    socket.on('game:start', async (data) => {
      try {
        const { roomId } = data;
        
        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.status !== 'playing') {
          socket.emit('error', { message: 'Room is not ready to start' });
          return;
        }

        // Check if game already exists
        let game = await Game.findOne({ roomId: room._id });
        
        if (!game) {
          // Initialize game (all logic in controller)
          game = await initializeGame(room._id);
        }

        // Broadcast game start to all players in the room
        ludoNamespace.to(roomId).emit('game:started', {
          gameId: game.gameId,
          players: game.players,
          turnIndex: game.turnIndex,
          mode: game.mode
        });

      } catch (error) {
        console.error('Game start error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Handle dice roll
     */
    socket.on('dice:roll', async (data) => {
      try {
        const { gameId } = data;

        // Business logic is in the controller
        const result = await handleDiceRoll(gameId, socket.user.userId);

        // Get the room for this game
        const game = await Game.findOne({ gameId });
        const room = await Room.findById(game.roomId);

        // Broadcast dice result to all players
        ludoNamespace.to(room.roomId).emit('dice:result', {
          gameId,
          playerId: socket.user.userId,
          diceValue: result.diceValue,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Dice roll error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Handle token move
     */
    socket.on('token:move', async (data) => {
      try {
        const { gameId, tokenId, diceValue } = data;

        // Business logic is in the controller
        const result = await handleTokenMove(
          gameId, 
          socket.user.userId, 
          tokenId, 
          diceValue
        );

        // Get the room for this game
        const game = await Game.findOne({ gameId });
        const room = await Room.findById(game.roomId);

        // Broadcast move to all players
        ludoNamespace.to(room.roomId).emit('token:moved', {
          gameId,
          move: result.move,
          timestamp: new Date()
        });

        // Broadcast turn change
        ludoNamespace.to(room.roomId).emit('turn:change', {
          gameId,
          currentTurn: result.nextTurn
        });

        // If game ended, broadcast game end
        if (result.gameStatus === 'ended') {
          ludoNamespace.to(room.roomId).emit('game:ended', {
            gameId,
            winnerId: game.winnerId,
            payout: game.payout
          });
        }

      } catch (error) {
        console.error('Token move error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    /**
     * Handle player disconnect
     */
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.userId}`);
      
      // Note: Implement reconnection logic and grace period here
      // For now, just log the disconnect
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return ludoNamespace;
};

module.exports = {
  initializeSocketHandlers,
  authenticateSocket
};
