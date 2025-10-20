'use strict';

const { StatusCodes } = require('http-status-codes');

class AppError extends Error {
  constructor(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function assert(condition, message, statusCode = StatusCodes.BAD_REQUEST) {
  if (!condition) throw new AppError(message, statusCode);
}

module.exports = { AppError, assert };
