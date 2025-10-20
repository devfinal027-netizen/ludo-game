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
    roomId: Joi.string().optional(),
    stake: Joi.number().valid(10, 50, 100).optional(),
    mode: Joi.string().valid('Classic', 'Quick').optional(),
  }),
};

module.exports = { schemas };
