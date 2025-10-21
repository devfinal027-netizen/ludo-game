'use strict';

const Joi = require('joi');

const schemas = {
  authTelegram: Joi.object({
    initData: Joi.string().required(),
  }),
  roomCreate: Joi.object({
    stake: Joi.number().valid(10, 50, 100).required(),
    mode: Joi.string().valid('Classic', 'Quick').required(),
    maxPlayers: Joi.number().valid(2, 4).required(),
  }),
  roomJoin: Joi.object({
    roomId: Joi.string().required(),
  }),
  gameStart: Joi.object({
    roomId: Joi.string().required(),
  }),
  diceRoll: Joi.object({
    gameId: Joi.string().required(),
  }),
  tokenMove: Joi.object({
    gameId: Joi.string().required(),
    tokenIndex: Joi.number().integer().min(0).required(),
    steps: Joi.number().integer().min(1).max(6).required(),
  }),
  gameEnd: Joi.object({
    gameId: Joi.string().required(),
    winnerUserId: Joi.string().allow(null, '').optional(),
  }),
};

module.exports = { schemas };
