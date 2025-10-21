'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const roomController = require('../controllers/roomController');

const router = express.Router();

router.post('/create', validate(schemas.roomCreate), roomController.create);

router.post('/join', validate(schemas.roomJoin), roomController.join);

router.get('/', roomController.list);

module.exports = router;
