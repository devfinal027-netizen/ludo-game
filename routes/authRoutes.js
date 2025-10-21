'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/telegram', validate(schemas.authTelegram), authController.telegram);

module.exports = router;
