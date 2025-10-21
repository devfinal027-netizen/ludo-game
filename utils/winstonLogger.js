'use strict';

const { createLogger } = require('./logger');

// Provide a singleton logger instance compatible with code expecting winstonLogger
const logger = createLogger();

module.exports = logger;
