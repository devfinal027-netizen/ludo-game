'use strict';

const express = require('express');

const router = express.Router();

router.get('/me', (req, res) => {
  res.json({ userId: req.user.userId });
});

module.exports = router;
