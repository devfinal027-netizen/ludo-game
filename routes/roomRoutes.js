const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { authenticate } = require('../middleware/auth');

// All business logic is in the controller
// Routes only define endpoints and apply middleware

router.post('/create', authenticate, roomController.createRoom);
router.get('/', authenticate, roomController.getRooms);
router.get('/:roomId', authenticate, roomController.getRoomDetails);
router.post('/join', authenticate, roomController.joinRoom);
router.post('/leave', authenticate, roomController.leaveRoom);
router.post('/cancel', authenticate, roomController.cancelRoom);

module.exports = router;
