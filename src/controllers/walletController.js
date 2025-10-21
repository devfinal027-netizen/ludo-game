const User = require('../models/User');
const Transaction = require('../models/Transaction');
const axios = require('axios');

/**
 * Get wallet balance
 */
const getBalance = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      wallet: user.wallet
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction history
 */
const getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    
    const query = { userId: req.user.userId };
    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('sessionId', 'roomId stakeValue');

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
 * Initiate deposit via AddisPay
 */
const initiateDeposit = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.userId,
      type: 'DEPOSIT',
      amount,
      status: 'pending'
    });
    await transaction.save();

    // Call AddisPay API to create invoice
    const response = await axios.post(
      `${process.env.ADDISPAY_API_URL}/invoice/create`,
      {
        amount,
        currency: 'ETB',
        reference: transaction._id.toString(),
        callback_url: `${process.env.BASE_URL}/api/wallet/deposit/callback`,
        description: 'Ludo Game Wallet Deposit'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ADDISPAY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update transaction with invoice details
    transaction.metadata = {
      invoiceId: response.data.invoice_id,
      invoiceUrl: response.data.invoice_url
    };
    await transaction.save();

    res.status(200).json({
      success: true,
      transactionId: transaction._id,
      invoiceUrl: response.data.invoice_url,
      message: 'Redirect to payment page'
    });
  } catch (error) {
    console.error('Deposit initiation error:', error);
    next(error);
  }
};

/**
 * Handle deposit callback from AddisPay
 */
const handleDepositCallback = async (req, res, next) => {
  try {
    const { reference, status, invoice_id } = req.body;

    const transaction = await Transaction.findById(reference);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (status === 'completed' || status === 'paid') {
      // Update user wallet
      const user = await User.findById(transaction.userId);
      if (user) {
        user.wallet.available += transaction.amount;
        await user.save();
      }

      transaction.status = 'completed';
    } else if (status === 'failed' || status === 'cancelled') {
      transaction.status = 'failed';
    }

    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Callback processed'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request withdrawal
 */
const requestWithdrawal = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.wallet.available < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Deduct from available balance
    user.wallet.available -= amount;
    await user.save();

    // Create withdrawal transaction
    const transaction = new Transaction({
      userId: user._id,
      type: 'WITHDRAWAL',
      amount,
      status: 'pending'
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted',
      transactionId: transaction._id
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lock stake for game (internal use)
 */
const lockStake = async (userId, amount, sessionId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.wallet.available < amount) {
      throw new Error('Insufficient balance');
    }

    // Move from available to locked
    user.wallet.available -= amount;
    user.wallet.locked += amount;
    await user.save();

    // Create transaction
    const transaction = new Transaction({
      userId,
      type: 'STAKE_LOCK',
      amount,
      status: 'completed',
      sessionId
    });
    await transaction.save();

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Unlock stake (refund - internal use)
 */
const unlockStake = async (userId, amount, sessionId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Move from locked to available
    user.wallet.locked -= amount;
    user.wallet.available += amount;
    await user.save();

    // Create transaction
    const transaction = new Transaction({
      userId,
      type: 'STAKE_UNLOCK',
      amount,
      status: 'completed',
      sessionId
    });
    await transaction.save();

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Process payout (internal use)
 */
const processPayout = async (userId, amount, sessionId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Unlock stake and add payout to available
    user.wallet.locked -= amount; // Remove original stake from locked
    user.wallet.available += amount; // Add winnings to available
    await user.save();

    // Create transaction
    const transaction = new Transaction({
      userId,
      type: 'PAYOUT',
      amount,
      status: 'completed',
      sessionId
    });
    await transaction.save();

    return { success: true };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getBalance,
  getTransactions,
  initiateDeposit,
  handleDepositCallback,
  requestWithdrawal,
  lockStake,
  unlockStake,
  processPayout
};
