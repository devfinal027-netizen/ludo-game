'use strict';

const { createLogger: winstonCreateLogger, format, transports } = require('winston');

function createLogger() {
  const logger = winstonCreateLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json(),
    ),
    defaultMeta: { service: 'ludo-backend' },
    transports: [new transports.Console()],
  });
  return logger;
}

module.exports = { createLogger };
