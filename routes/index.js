'use strict';

const express = require('express');
const { apiLimiter } = require('../middlewares/rateLimit');
const { auth } = require('../middlewares/auth');

const router = express.Router();

router.use(apiLimiter);

// Public auth endpoints
router.use('/auth', require('./authRoutes'));

// Protected endpoints
router.use('/users', auth(true), require('./userRoutes'));
router.use('/rooms', auth(true), require('./roomsRoutes'));
router.use('/admin', auth(true), require('./adminRoutes'));
router.use('/games', auth(true), require('./gameRoutes'));

module.exports = router;
