'use strict';

require('dotenv').config();

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/winstonLogger');
const { createHmac } = require('crypto');

const { config } = require('../config/config');
const { User } = require('../models/User');
const { Transaction, TransactionType, TransactionStatus } = require('../models/Transaction');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  tokenParamsSchema,
  passwordSchema,
  paramsSchema,
} = require('../lib/schema');

const TELEGRAM_BOT_TOKENS = [
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.NOTIFICATION_TELEGRAM_BOT_TOKEN,
].filter(Boolean);

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, config.jwtSecret, { expiresIn: '7d' });
};

const createTransaction = async (
  userId,
  amount,
  type,
  description,
  reference,
  status = TransactionStatus.PENDING,
) => {
  const transaction = new Transaction({
    userId,
    amount,
    type,
    description,
    reference: reference || `${type}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    status: status,
    metadata: { createdAt: new Date() },
  });
  await transaction.save();
  logger.info('Transaction created', {
    userId,
    type,
    reference: transaction.reference,
  });
  return transaction;
};

const generateReferralCode = () => crypto.randomBytes(4).toString('hex');

const validateTelegramInitData = (initData) => {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  for (const token of TELEGRAM_BOT_TOKENS) {
    const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculatedHash === hash) return true;
  }
  return false;
};

async function telegramAuth(req, res) {
  try {
    const { initData } = req.body;
    if (!initData || !validateTelegramInitData(initData)) {
      return res.status(401).json({ message: 'Invalid Telegram authentication data' });
    }

    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user') || '{}');
    const telegramId = userData.id?.toString();
    if (!telegramId) return res.status(400).json({ message: 'Telegram user ID is missing' });

    let user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(400).json({
        message: 'Phone number is required. Please share your phone number in Telegram to register.',
        requiresPhone: true,
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: 'Account is banned', banned: true, reason: user.banReason });
    }

    const token = generateToken(user._id, user.role);
    return res.status(200).json({
      message: 'Telegram login successful',
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        wallet: user.wallet,
        bonus: user.bonus,
        referralCode: user.referralCode,
        invitedBy: user.invitedBy,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Telegram auth failed:', error);
    return res.status(500).json({ message: 'Internal server error during authentication' });
  }
}

async function telegramLogin(req, res) {
  try {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ message: 'Telegram ID is required' });

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ message: 'User not found controller login' });
    if (user.isBanned) {
      return res.status(403).json({ message: 'Account is banned', banned: true, reason: user.banReason });
    }

    const token = jwt.sign({ id: user._id, telegramId, role: user.role }, config.jwtSecret, { expiresIn: '1d' });
    res.status(200).json({ token });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Failed to login' });
  }
}

async function register(req, res) {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    let normalizedPhone = phone.trim().replace(/[\s-]/g, '');
    if (normalizedPhone.startsWith('09') || normalizedPhone.startsWith('07')) {
      normalizedPhone = `+251${normalizedPhone.slice(1)}`;
    } else if (normalizedPhone.startsWith('251')) {
      normalizedPhone = `+${normalizedPhone}`;
    } else if (!normalizedPhone.startsWith('+251')) {
      normalizedPhone = `+251${normalizedPhone}`;
    }
    if (!/^\+251[79]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        message:
          'Invalid Ethiopian phone format. Use 09..., 07..., 251..., or +251... followed by 9 digits',
      });
    }

    const validatedData = { ...req.body, phone: normalizedPhone };
    const { error } = registerSchema.validate(validatedData);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const existingUser = await User.findOne({
      $or: [{ phone: normalizedPhone }, { telegramId: validatedData.telegramId }],
    });
    if (existingUser) {
      if (existingUser.telegramId == validatedData.telegramId) {
        if (existingUser.phone == normalizedPhone) {
          return res.status(400).json({ message: 'User already exists with this phone number and Telegram ID' });
        }
        existingUser.phone = normalizedPhone;
        await existingUser.save();
        return res.status(400).json({ message: 'User already exists with this telegram account' });
      }
      return res.status(400).json({ message: 'User already exists with this phone number or Telegram ID' });
    }

    const userData = {
      telegramId: validatedData.telegramId,
      fullName: validatedData.fullName,
      phone: normalizedPhone,
      referralCode: generateReferralCode(),
      wallet: 0,
      bonus: 0,
      role: 'user',
    };
    if (validatedData.password) userData.password = validatedData.password;
    if (validatedData.invitedBy) userData.invitedBy = validatedData.invitedBy;

    let agentThatFunded = null;
    let shouldRecordUserBonusTx = false;

    if (validatedData.invitedBy) {
      const inviter = await User.findOne({ referralCode: validatedData.invitedBy });
      if (inviter && inviter.role === 'agent') {
        const updatedAgent = await User.findOneAndUpdate(
          { _id: inviter._id, role: 'agent', wallet: { $gte: 10 } },
          { $inc: { wallet: -10 } },
          { new: true },
        );
        if (updatedAgent) {
          userData.wallet = 0;
          userData.bonus = 0;
          agentThatFunded = updatedAgent;
          shouldRecordUserBonusTx = true;
        } else {
          userData.wallet = 0;
          userData.bonus = 0;
        }
      } else {
        userData.wallet = 0;
        userData.bonus = 0;
        shouldRecordUserBonusTx = true;
      }
    } else {
      userData.wallet = 0;
      userData.bonus = 0;
      shouldRecordUserBonusTx = true;
    }

    const user = await User.create(userData);
    const token = generateToken(user._id, user.role);

    if (shouldRecordUserBonusTx) {
      await createTransaction(
        user._id,
        0,
        TransactionType.REGISTRATION_BONUS,
        'Registration bonus for new user',
        `registration-bonus-${user._id}-${Date.now()}`,
        TransactionStatus.COMPLETED,
      );
    }

    if (agentThatFunded) {
      await createTransaction(
        agentThatFunded._id,
        0,
        TransactionType.TRANSFER,
        `Funded 10 ETB registration bonus for invited user ${user.fullName || user.phone}`,
        `agent-funded-registration-bonus-${user._id}-${Date.now()}`,
        TransactionStatus.COMPLETED,
      );
    }

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        wallet: user.wallet,
        bonus: user.bonus,
        referralCode: user.referralCode,
        invitedBy: user.invitedBy,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Registration failed:', error);
    res.status(500).json({ message: 'Failed to register user' });
  }
}

async function login(req, res) {
  try {
    const { phone: rawPhone, password } = req.body;
    let normalizedPhone = rawPhone.trim().replace(/[\s-]/g, '');
    if (normalizedPhone.startsWith('09') || normalizedPhone.startsWith('07')) {
      normalizedPhone = `+251${normalizedPhone.slice(1)}`;
    } else if (normalizedPhone.startsWith('251')) {
      normalizedPhone = `+${normalizedPhone}`;
    } else if (!normalizedPhone.startsWith('+251')) {
      normalizedPhone = `+251${normalizedPhone}`;
    }
    if (!/^\+251[79]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        message: 'Invalid phone number format. Use 09..., 07..., 251..., or +251...',
      });
    }

    const { error } = loginSchema.validate({ phone: normalizedPhone, password });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.isBanned) {
      return res.status(403).json({ message: 'Account is banned', banned: true, reason: user.banReason });
    }

    const isMatch = await user.verifyPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        wallet: user.wallet,
        bonus: user.bonus,
        referralCode: user.referralCode,
        invitedBy: user.invitedBy,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login failed:', error);
    return res.status(500).json({ message: 'Failed to login' });
  }
}

async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user });
  } catch (error) {
    logger.error('Failed to fetch profile:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
}

async function updateProfile(req, res) {
  const { error } = updateProfileSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  try {
    const { fullName, phone } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    await user.save();
    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        balance: user.wallet,
        referralCode: user.referralCode,
        invitedBy: user.invitedBy,
      },
    });
  } catch (error) {
    logger.error('Profile update failed:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
}

async function updateFullName(req, res) {
  const telegramId = req.params.telegramId;
  const { fullName } = req.body;
  if (!fullName) return res.status(400).json({ message: 'Full name is required' });
  try {
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.fullName = fullName;
    await user.save();
    res.status(200).json({ message: 'Full name updated successfully' });
  } catch (error) {
    logger.error('Failed to update full name:', error);
    res.status(500).json({ message: 'Failed to update full name' });
  }
}

async function deleteAccount(req, res) {
  const { error } = paramsSchema.validate({ id: req.user.id });
  if (error) return res.status(400).json({ message: error.details[0].message });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await User.findByIdAndDelete(req.user.id);
    logger.info('Account deleted successfully');
    return res.status(204).json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete account:', error);
    return res.status(500).json({ message: 'Failed to delete account' });
  }
}

async function getInvitedUsers(req, res) {
  const { error } = paramsSchema.validate({ id: req.user.id });
  if (error) return res.status(400).json({ message: error.details[0].message });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const usersInvited = await User.find({ invitedBy: user.referralCode }).select('-password');
    if (usersInvited.length === 0) {
      return res.status(404).json({ message: 'You have no invited users' });
    }
    res.status(200).json(usersInvited);
  } catch (error) {
    logger.error('Failed to fetch invited users:', error);
    res.status(500).json({ message: 'Failed to fetch invited users' });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await user.verifyPassword(currentPassword);
    if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = newPassword;
    user.markModified('password');
    await user.save();
    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Failed to change password:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
}

async function forgotPassword(req, res) {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const token = generateToken(user._id, user.role);
    res.status(200).json({ message: 'Password reset link sent to your telegram', token });
  } catch (error) {
    logger.error('Failed to reset password:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
}

async function resetPassword(req, res) {
  try {
    const { error } = tokenParamsSchema.validate(req.params);
    if (error) return res.status(400).json({ message: error.details[0].message });
    const { token } = req.params;
    const { password } = req.body;
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = password;
    user.markModified('password');
    await user.save();
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    logger.error('Failed to reset password:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
}

async function registerAgent(req, res) {
  try {
    const { telegramId, fullName, phone, password, initialWallet } = req.body;
    if (!telegramId || !phone) return res.status(400).json({ message: 'telegramId and phone are required' });

    let normalizedPhone = phone.trim().replace(/\s|-/g, '');
    if (normalizedPhone.startsWith('09') || normalizedPhone.startsWith('07')) {
      normalizedPhone = `+251${normalizedPhone.slice(1)}`;
    } else if (normalizedPhone.startsWith('251')) {
      normalizedPhone = `+${normalizedPhone}`;
    } else if (!normalizedPhone.startsWith('+251')) {
      normalizedPhone = `+251${normalizedPhone}`;
    }
    if (!/^\+251[79]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Invalid Ethiopian phone format.' });
    }

    const existingUser = await User.findOne({ $or: [{ phone: normalizedPhone }, { telegramId }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this phone or telegramId' });
    }

    const userData = {
      telegramId,
      fullName,
      phone: normalizedPhone,
      referralCode: crypto.randomBytes(4).toString('hex'),
      role: 'agent',
    };
    if (password) userData.password = password;
    if (initialWallet != null && !isNaN(Number(initialWallet))) {
      userData.wallet = Math.max(0, Number(initialWallet));
    }

    const agent = await User.create(userData);
    return res.status(201).json({ message: 'Agent registered successfully', agent });
  } catch (error) {
    logger.error('Admin register agent failed:', error);
    res.status(500).json({ message: 'Failed to register agent' });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  deleteAccount,
  getInvitedUsers,
  changePassword,
  resetPassword,
  forgotPassword,
  telegramAuth,
  telegramLogin,
  updateFullName,
  registerAgent,
  // Helpers used by other controllers
  generateReferralCode,
  createTransaction,
};
