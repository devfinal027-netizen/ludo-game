'use strict';

const express = require('express');
const { auth } = require('../middlewares/auth');
const controller = require('../controllers/authController');

const router = express.Router();

// Telegram
router.post('/telegram', controller.telegramAuth);
router.post('/telegram/login', controller.telegramLogin);

// User auth & profile
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', auth(true), controller.getProfile);
router.put('/me', auth(true), controller.updateProfile);
router.delete('/me', auth(true), controller.deleteAccount);
router.get('/me/invited', auth(true), controller.getInvitedUsers);
router.post('/me/change-password', auth(true), controller.changePassword);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password/:token', controller.resetPassword);

// Admin/agent utilities
router.post('/admin/register-agent', auth(true), controller.registerAgent);
router.put('/telegram/name/:telegramId', controller.updateFullName);

module.exports = router;
