const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyTelegramData, parseTelegramUser } = require('../utils/telegramAuth');

/**
 * Register user via Telegram
 */
const registerWithTelegram = async (req, res, next) => {
  try {
    const { initData, password } = req.body;

    if (!initData) {
      return res.status(400).json({
        success: false,
        message: 'Telegram initData is required'
      });
    }

    // Verify Telegram data
    const isValid = verifyTelegramData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Telegram data'
      });
    }

    // Parse user data
    const telegramUser = parseTelegramUser(initData);
    if (!telegramUser) {
      return res.status(400).json({
        success: false,
        message: 'Could not parse Telegram user data'
      });
    }

    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { telegramId: telegramUser.id.toString() },
        { phone: telegramUser.phone_number }
      ]
    });

    if (user) {
      // User exists, just log them in
      const token = jwt.sign(
        { 
          userId: user._id, 
          phone: user.phone, 
          telegramId: user.telegramId,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRY }
      );

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          phone: user.phone,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          wallet: user.wallet
        }
      });
    }

    // Create new user
    user = new User({
      telegramId: telegramUser.id.toString(),
      phone: telegramUser.phone_number,
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      password: password || undefined,
      wallet: {
        available: 0,
        locked: 0
      }
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user._id, 
        phone: user.phone, 
        telegramId: user.telegramId,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        wallet: user.wallet
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login with phone and password
 */
const loginWithPassword = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user has password set
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'Password not set. Please use Telegram login.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user._id, 
        phone: user.phone, 
        telegramId: user.telegramId,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        wallet: user.wallet
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        wallet: user.wallet,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh JWT token
 */
const refreshToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        phone: user.phone, 
        telegramId: user.telegramId,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    res.status(200).json({
      success: true,
      token
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerWithTelegram,
  loginWithPassword,
  getProfile,
  refreshToken
};
