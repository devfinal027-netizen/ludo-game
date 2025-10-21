const User = require('../models/User');
const Room = require('../models/Room');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const { unlockStake } = require('./walletController');

/**
 * Get dashboard statistics
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeGames = await Game.countDocuments({ status: 'playing' });
    const completedGames = await Game.countDocuments({ status: 'ended' });
    
    // Calculate total revenue (commission)
    const games = await Game.find({ status: 'ended' });
    const totalRevenue = games.reduce((sum, game) => {
      return sum + (game.payout?.commission || 0);
    }, 0);

    // Calculate total payouts
    const totalPayouts = games.reduce((sum, game) => {
      return sum + (game.payout?.winnerPayout || 0);
    }, 0);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeGames,
        completedGames,
        totalRevenue,
        totalPayouts
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users with filters
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user details by ID
 */
const getUserDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's transaction history
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    // Get user's game history
    const games = await Game.find({ 'players.userId': userId })
      .populate('winnerId', 'username')
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      user,
      transactions,
      games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user status (activate/deactivate)
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        isActive: user.isActive
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all rooms with filters
 */
const getAllRooms = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, stake, mode } = req.query;

    const query = {};
    if (status) query.status = status;
    if (stake) query.stakeValue = Number(stake);
    if (mode) query.mode = mode;

    const rooms = await Room.find(query)
      .populate('creatorUserId', 'username firstName lastName')
      .populate('players.userId', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Room.countDocuments(query);

    res.status(200).json({
      success: true,
      rooms,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Force end/cancel a room
 */
const forceEndRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // If room is in waiting status, cancel and refund
    if (room.status === 'waiting') {
      for (const player of room.players) {
        await unlockStake(player.userId, room.stakeValue, room._id);
      }
      room.status = 'cancelled';
    } else if (room.status === 'playing') {
      // If room is playing, abort the game
      const game = await Game.findOne({ roomId: room._id, status: 'playing' });
      if (game) {
        for (const player of game.players) {
          await unlockStake(player.userId, game.stakeValue, game.roomId);
        }
        game.status = 'aborted';
        await game.save();
      }
      room.status = 'cancelled';
    }

    room.endedAt = new Date();
    await room.save();

    res.status(200).json({
      success: true,
      message: 'Room ended and stakes refunded'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all games with filters
 */
const getAllGames = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = {};
    if (status) query.status = status;

    const games = await Game.find(query)
      .populate('players.userId', 'username firstName lastName')
      .populate('winnerId', 'username firstName lastName')
      .populate('roomId', 'roomId stakeValue mode')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Game.countDocuments(query);

    res.status(200).json({
      success: true,
      games,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all transactions with filters
 */
const getAllTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, status, userId } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const transactions = await Transaction.find(query)
      .populate('userId', 'username firstName lastName phone')
      .populate('sessionId', 'roomId stakeValue')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get financial reports
 */
const getFinancialReports = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateQuery = {};
    if (startDate || endDate) {
      dateQuery.createdAt = {};
      if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
      if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    // Get all completed games in date range
    const games = await Game.find({
      ...dateQuery,
      status: 'ended'
    });

    // Calculate totals
    const totalGames = games.length;
    const totalPot = games.reduce((sum, game) => sum + (game.payout?.totalPot || 0), 0);
    const totalCommission = games.reduce((sum, game) => sum + (game.payout?.commission || 0), 0);
    const totalPayouts = games.reduce((sum, game) => sum + (game.payout?.winnerPayout || 0), 0);

    // Get deposit/withdrawal stats
    const deposits = await Transaction.find({
      ...dateQuery,
      type: 'DEPOSIT',
      status: 'completed'
    });

    const withdrawals = await Transaction.find({
      ...dateQuery,
      type: 'WITHDRAWAL',
      status: 'completed'
    });

    const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      success: true,
      report: {
        period: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Now'
        },
        games: {
          total: totalGames,
          totalPot,
          totalCommission,
          totalPayouts
        },
        transactions: {
          deposits: {
            count: deposits.length,
            total: totalDeposits
          },
          withdrawals: {
            count: withdrawals.length,
            total: totalWithdrawals
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust user wallet (manual adjustment)
 */
const adjustUserWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Amount and reason are required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.wallet.available += amount;
    await user.save();

    // Create transaction record
    const transaction = new Transaction({
      userId,
      type: amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
      amount: Math.abs(amount),
      status: 'completed',
      metadata: {
        reason,
        adjustedBy: req.user.userId,
        manual: true
      }
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Wallet adjusted successfully',
      newBalance: user.wallet.available
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  getAllRooms,
  forceEndRoom,
  getAllGames,
  getAllTransactions,
  getFinancialReports,
  adjustUserWallet
};
