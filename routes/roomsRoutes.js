'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate');
const { schemas } = require('../utils/schema');
const { createRoom, joinRoom } = require('../services/RoomService');

const router = express.Router();

router.post('/create', validate(schemas.roomCreate), async (req, res, next) => {
  try {
    const { stake, mode, maxPlayers } = req.validated;
    const userId = req.user.userId;
    const room = await createRoom({ stake, mode, maxPlayers, creatorUserId: userId, logger: req.app.get('logger') });
    res.json(room);
  } catch (err) {
    next(err);
  }
});

router.post('/join', validate(schemas.roomJoin), async (req, res, next) => {
  try {
    const { roomId } = req.validated;
    const userId = req.user.userId;
    const room = await joinRoom({ roomId, userId, logger: req.app.get('logger') });
    if (!room) return res.status(400).json({ message: 'Room not available' });
    res.json(room);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res) => {
  res.json([]);
});

module.exports = router;
