'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const gameController = require('../controllers/gameController');

const router = express.Router();

// Only routing here; business logic in controllers
router.get('/:gameId', gameController.getGame);
router.get('/room/:roomId/current', gameController.getCurrentByRoom);
router.post('/start', validate(schemas.gameStart), gameController.start);
router.post('/dice/roll', validate(schemas.diceRoll), gameController.roll);
router.post('/token/move', validate(schemas.tokenMove), gameController.move);
router.post('/end', validate(schemas.gameEnd), gameController.end);

module.exports = router;
