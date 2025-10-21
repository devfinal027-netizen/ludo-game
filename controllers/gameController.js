const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const Room = require('../models/Room');
const { rollDice, validateMove, checkWinCondition, calculatePayout } = require('../utils/gameLogic');
const { unlockStake, processPayout } = require('./walletController');

/**
 * Initialize game from room
 */
const initializeGame = async (roomId) => {
  try {
    const room = await Room.findById(roomId).populate('players.userId');
    if (!room) {
      throw new Error('Room not found');
    }

    // Initialize tokens based on mode
    const tokensPerPlayer = room.mode === 'Classic' ? 4 : 2;
    
    const players = room.players.map((player, index) => ({
      userId: player.userId._id,
      playerIndex: index,
      tokens: Array.from({ length: tokensPerPlayer }, (_, tokenIndex) => ({
        tokenId: tokenIndex,
        position: -1, // -1 means in home base
        isHome: false
      }))
    }));

    const game = new Game({
      gameId: uuidv4(),
      roomId: room._id,
      stakeValue: room.stakeValue,
      mode: room.mode,
      players,
      turnIndex: 0,
      currentTurnStartedAt: new Date(),
      status: 'playing'
    });

    await game.save();
    return game;
  } catch (error) {
    throw error;
  }
};

/**
 * Get game details
 */
const getGameDetails = async (req, res, next) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findOne({ gameId })
      .populate('players.userId', 'username firstName lastName')
      .populate('winnerId', 'username firstName lastName');

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.status(200).json({
      success: true,
      game
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get game by room ID
 */
const getGameByRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const game = await Game.findOne({ roomId: room._id })
      .populate('players.userId', 'username firstName lastName')
      .populate('winnerId', 'username firstName lastName');

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found for this room'
      });
    }

    res.status(200).json({
      success: true,
      game
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle dice roll
 */
const handleDiceRoll = async (gameId, userId) => {
  try {
    const game = await Game.findOne({ gameId, status: 'playing' });
    if (!game) {
      throw new Error('Game not found or not active');
    }

    // Check if it's the player's turn
    const currentPlayer = game.players[game.turnIndex];
    if (currentPlayer.userId.toString() !== userId.toString()) {
      throw new Error('Not your turn');
    }

    // Roll dice
    const diceValue = rollDice();

    // Record dice roll
    game.diceRolls.push({
      playerId: userId,
      value: diceValue,
      timestamp: new Date()
    });

    await game.save();

    return {
      success: true,
      diceValue,
      playerId: userId,
      gameId: game.gameId
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Handle token move
 */
const handleTokenMove = async (gameId, userId, tokenId, diceValue) => {
  try {
    const game = await Game.findOne({ gameId, status: 'playing' });
    if (!game) {
      throw new Error('Game not found or not active');
    }

    // Check if it's the player's turn
    const currentPlayer = game.players[game.turnIndex];
    if (currentPlayer.userId.toString() !== userId.toString()) {
      throw new Error('Not your turn');
    }

    // Find the token
    const token = currentPlayer.tokens.find(t => t.tokenId === tokenId);
    if (!token) {
      throw new Error('Token not found');
    }

    // Validate move
    const validation = validateMove(game, userId, tokenId, diceValue);
    if (!validation.valid) {
      throw new Error('Invalid move');
    }

    // Record move
    const fromPosition = token.position;
    token.position = validation.newPosition;

    game.moves.push({
      playerId: userId,
      tokenId,
      from: fromPosition,
      to: validation.newPosition,
      timestamp: new Date()
    });

    // Check win condition
    const winCheck = checkWinCondition(game, game.mode);
    if (winCheck.hasWinner) {
      await endGame(game, winCheck.winnerId);
    } else {
      // Change turn (unless player rolled a 6)
      if (diceValue !== 6) {
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        game.currentTurnStartedAt = new Date();
      }
    }

    await game.save();

    return {
      success: true,
      move: {
        playerId: userId,
        tokenId,
        from: fromPosition,
        to: validation.newPosition
      },
      nextTurn: game.players[game.turnIndex].userId,
      gameStatus: game.status
    };
  } catch (error) {
    throw error;
  }
};

/**
 * End game and process payout
 */
const endGame = async (game, winnerId) => {
  try {
    game.status = 'ended';
    game.winnerId = winnerId;

    // Calculate payout
    const commissionPercent = Number(process.env.COMMISSION_PERCENT) || 20;
    const payout = calculatePayout(
      game.stakeValue,
      game.players.length,
      commissionPercent
    );

    game.payout = payout;

    // Update room status
    await Room.findByIdAndUpdate(game.roomId, {
      status: 'ended',
      endedAt: new Date()
    });

    // Process payout for winner
    await processPayout(winnerId, payout.payout, game.roomId);

    // Unlock stakes for losers (they lose their stake)
    for (const player of game.players) {
      if (player.userId.toString() !== winnerId.toString()) {
        // Simply unlock the stake (it's already deducted as they lost)
        const User = require('../models/User');
        const user = await User.findById(player.userId);
        if (user) {
          user.wallet.locked -= game.stakeValue;
          await user.save();
        }
      }
    }

    await game.save();

    return game;
  } catch (error) {
    throw error;
  }
};

/**
 * Abort game and refund all players
 */
const abortGame = async (req, res, next) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    // Only admin can abort
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can abort games'
      });
    }

    if (game.status === 'ended') {
      return res.status(400).json({
        success: false,
        message: 'Game has already ended'
      });
    }

    // Refund all players
    for (const player of game.players) {
      await unlockStake(player.userId, game.stakeValue, game.roomId);
    }

    game.status = 'aborted';
    await game.save();

    // Update room status
    await Room.findByIdAndUpdate(game.roomId, {
      status: 'cancelled',
      endedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Game aborted and all stakes refunded'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get player's active games
 */
const getPlayerGames = async (req, res, next) => {
  try {
    const games = await Game.find({
      'players.userId': req.user.userId,
      status: { $in: ['playing', 'ended'] }
    })
      .populate('players.userId', 'username firstName lastName')
      .populate('winnerId', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      games
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initializeGame,
  getGameDetails,
  getGameByRoom,
  handleDiceRoll,
  handleTokenMove,
  abortGame,
  getPlayerGames
};
