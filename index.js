'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { createLogger } = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const { errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

const PORT = process.env.PORT || 3000;
const SOCKET_PATH = process.env.SOCKET_PATH || '/ludo';

async function start() {
  const app = express();
  const server = http.createServer(app);

  // Realtime
  const io = new Server(server, {
    path: SOCKET_PATH,
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket'],
    allowUpgrades: true,
    perMessageDeflate: true,
    pingInterval: 10000,
    pingTimeout: 25000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false,
    },
  });

  // Basic middlewares
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // Logger
  const logger = createLogger();
  app.set('logger', logger);

  // Health
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Routes
  app.use('/api', routes);

  // Socket namespace
  require('./socketController/io')(io, logger);

  // Error handler
  app.use(errorHandler);

  await connectDatabase(logger);

  server.listen(PORT, () => {
    logger.info(`HTTP listening on ${PORT}`);
    logger.info(`Socket.IO path ${SOCKET_PATH}`);
  });
}

start().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
