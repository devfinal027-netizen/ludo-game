const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All business logic is in the controller
// Routes only define endpoints and apply middleware

router.get('/my-games', authenticate, gameController.getPlayerGames);
router.get('/:gameId', authenticate, gameController.getGameDetails);
router.get('/room/:roomId', authenticate, gameController.getGameByRoom);
router.post('/:gameId/abort', authenticate, isAdmin, gameController.abortGame);

module.exports = router;
