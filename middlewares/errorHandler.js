'use strict';

const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, _next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : 500;
  const payload = {
    message: isAppError ? err.message : 'Internal Server Error',
    ...(isAppError && err.details ? { details: err.details } : {}),
  };
  res.status(status).json(payload);
}

module.exports = { errorHandler };
