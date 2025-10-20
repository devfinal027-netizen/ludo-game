'use strict';

const mongoose = require('mongoose');
const { config } = require('./config');

async function connectDatabase(logger) {
  mongoose.set('strictQuery', true);
  const mongoUri = config.mongoUri;

  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    logger && logger.info('Connected to MongoDB');
  } catch (err) {
    logger && logger.error('MongoDB connection error', { err });
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    logger && logger.error('MongoDB runtime error', { err });
  });
}

module.exports = { connectDatabase };
