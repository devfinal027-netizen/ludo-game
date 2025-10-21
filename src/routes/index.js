const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./authRoutes');
const walletRoutes = require('./walletRoutes');
const roomRoutes = require('./roomRoutes');
const gameRoutes = require('./gameRoutes');
const adminRoutes = require('./adminRoutes');

// Routes only handle endpoint management
// All business logic is delegated to controllers

router.use('/auth', authRoutes);
router.use('/wallet', walletRoutes);
router.use('/rooms', roomRoutes);
router.use('/games', gameRoutes);
router.use('/admin', adminRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date()
  });
});

module.exports = router;
