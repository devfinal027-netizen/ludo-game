const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    if (process.env.REDIS_URL) {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });

      redisClient.on('error', (err) => {
        console.error('Redis Client Error', err);
      });

      await redisClient.connect();
      console.log('Redis Connected');
    } else {
      console.log('Redis URL not provided, skipping Redis connection');
    }
  } catch (error) {
    console.error('Redis connection error:', error);
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
