const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');

// All business logic is in the controller
// Routes only define endpoints and apply middleware

router.get('/balance', authenticate, walletController.getBalance);
router.get('/transactions', authenticate, walletController.getTransactions);
router.post('/deposit', authenticate, walletController.initiateDeposit);
router.post('/deposit/callback', walletController.handleDepositCallback);
router.post('/withdraw', authenticate, walletController.requestWithdrawal);

module.exports = router;
