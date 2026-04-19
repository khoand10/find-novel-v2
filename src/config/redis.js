const { createClient } = require("redis");

const logger = require("./logger");

let redisClient = null;

async function connectRedis(url) {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url });

  redisClient.on("error", (error) => {
    logger.error({ error }, "Redis error.");
  });

  await redisClient.connect();
  logger.info("Redis connected.");

  return redisClient;
}

function getRedisClient() {
  return redisClient;
}

async function disconnectRedis() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info("Redis disconnected.");
  }
}

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedisClient
};
