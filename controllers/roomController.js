const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const User = require('../models/User');
const { lockStake, unlockStake } = require('./walletController');

/**
 * Create a new room
 */
const createRoom = async (req, res, next) => {
  try {
    const { stakeValue, mode, maxPlayers } = req.body;

    // Validate input
    if (!stakeValue || !mode || !maxPlayers) {
      return res.status(400).json({
        success: false,
        message: 'stakeValue, mode, and maxPlayers are required'
      });
    }

    // Validate stake value
    const allowedStakes = process.env.ALLOWED_STAKES.split(',').map(Number);
    if (!allowedStakes.includes(stakeValue)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stake value. Allowed values: ${allowedStakes.join(', ')}`
      });
    }

    // Validate mode
    if (!['Classic', 'Quick'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Mode must be either Classic or Quick'
      });
    }

    // Validate maxPlayers
    if (![2, 4].includes(maxPlayers)) {
      return res.status(400).json({
        success: false,
        message: 'maxPlayers must be either 2 or 4'
      });
    }

    // Check if user has sufficient balance
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.wallet.available < stakeValue) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Check if user is already in an active room
    const existingRoom = await Room.findOne({
      'players.userId': req.user.userId,
      status: { $in: ['waiting', 'playing'] }
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: 'You are already in an active room'
      });
    }

    // Create room
    const room = new Room({
      roomId: uuidv4(),
      creatorUserId: req.user.userId,
      stakeValue,
      mode,
      maxPlayers,
      status: 'waiting',
      players: [{
        userId: req.user.userId,
        playerIndex: 0,
        status: 'joined'
      }]
    });

    await room.save();

    // Lock stake
    await lockStake(req.user.userId, stakeValue, room._id);

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      room: {
        roomId: room.roomId,
        _id: room._id,
        stakeValue: room.stakeValue,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        status: room.status
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available rooms
 */
const getRooms = async (req, res, next) => {
  try {
    const { stake, mode, status = 'waiting' } = req.query;

    const query = { status };
    if (stake) {
      query.stakeValue = Number(stake);
    }
    if (mode) {
      query.mode = mode;
    }

    const rooms = await Room.find(query)
      .populate('creatorUserId', 'username firstName lastName')
      .populate('players.userId', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      rooms: rooms.map(room => ({
        roomId: room.roomId,
        _id: room._id,
        stakeValue: room.stakeValue,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        status: room.status,
        creator: room.creatorUserId,
        createdAt: room.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get room details
 */
const getRoomDetails = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId })
      .populate('creatorUserId', 'username firstName lastName')
      .populate('players.userId', 'username firstName lastName');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    res.status(200).json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Join a room
 */
const joinRoom = async (req, res, next) => {
  try {
    const { roomId } = req.body;

    let room;

    if (roomId) {
      // Join specific room
      room = await Room.findOne({ roomId, status: 'waiting' });
    } else {
      // Quick join - find any available room
      room = await Room.findOne({ 
        status: 'waiting',
        $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] }
      }).sort({ createdAt: 1 });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'No available room found'
      });
    }

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: 'Room is full'
      });
    }

    // Check if user is already in the room
    const alreadyJoined = room.players.some(
      p => p.userId.toString() === req.user.userId
    );

    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        message: 'You have already joined this room'
      });
    }

    // Check if user has sufficient balance
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.wallet.available < room.stakeValue) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Check if user is already in another active room
    const existingRoom = await Room.findOne({
      'players.userId': req.user.userId,
      status: { $in: ['waiting', 'playing'] }
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: 'You are already in an active room'
      });
    }

    // Add player to room
    room.players.push({
      userId: req.user.userId,
      playerIndex: room.players.length,
      status: 'joined'
    });

    // Check if room is now full
    if (room.players.length === room.maxPlayers) {
      room.status = 'playing';
      room.startedAt = new Date();
    }

    await room.save();

    // Lock stake
    await lockStake(req.user.userId, room.stakeValue, room._id);

    res.status(200).json({
      success: true,
      message: room.status === 'playing' ? 'Room full, game starting' : 'Joined room successfully',
      room: {
        roomId: room.roomId,
        _id: room._id,
        stakeValue: room.stakeValue,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        status: room.status
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Leave a room (only if game hasn't started)
 */
const leaveRoom = async (req, res, next) => {
  try {
    const { roomId } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Cannot leave room after game has started'
      });
    }

    const playerIndex = room.players.findIndex(
      p => p.userId.toString() === req.user.userId
    );

    if (playerIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not in this room'
      });
    }

    // Remove player from room
    room.players.splice(playerIndex, 1);

    // Update player indices
    room.players.forEach((player, index) => {
      player.playerIndex = index;
    });

    // If room is empty, cancel it
    if (room.players.length === 0) {
      room.status = 'cancelled';
    }

    await room.save();

    // Unlock stake
    await unlockStake(req.user.userId, room.stakeValue, room._id);

    res.status(200).json({
      success: true,
      message: 'Left room successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel room (creator only, before game starts)
 */
const cancelRoom = async (req, res, next) => {
  try {
    const { roomId } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    if (room.creatorUserId.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the room creator or admin can cancel the room'
      });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel room after game has started'
      });
    }

    // Refund all players
    for (const player of room.players) {
      await unlockStake(player.userId, room.stakeValue, room._id);
    }

    room.status = 'cancelled';
    await room.save();

    res.status(200).json({
      success: true,
      message: 'Room cancelled and stakes refunded'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoomDetails,
  joinRoom,
  leaveRoom,
  cancelRoom
};
