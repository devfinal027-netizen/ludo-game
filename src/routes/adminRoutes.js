const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All business logic is in the controller
// Routes only define endpoints and apply middleware
// All admin routes require authentication and admin role

router.use(authenticate);
router.use(isAdmin);

// Dashboard
router.get('/stats', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.post('/users/:userId/wallet/adjust', adminController.adjustUserWallet);

// Room management
router.get('/rooms', adminController.getAllRooms);
router.post('/rooms/:roomId/force-end', adminController.forceEndRoom);

// Game management
router.get('/games', adminController.getAllGames);

// Transaction management
router.get('/transactions', adminController.getAllTransactions);

// Reports
router.get('/reports/financial', adminController.getFinancialReports);

module.exports = router;
