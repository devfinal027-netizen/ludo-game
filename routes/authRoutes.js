const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// All business logic is in the controller
// Routes only define endpoints and apply middleware

router.post('/register/telegram', authController.registerWithTelegram);
router.post('/login', authController.loginWithPassword);
router.get('/profile', authenticate, authController.getProfile);
router.post('/refresh', authenticate, authController.refreshToken);

module.exports = router;
