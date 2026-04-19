const app = require("./app");
const { env } = require("./config/env");
const logger = require("./config/logger");
const { connectMongoDB, disconnectMongoDB } = require("./config/mongodb");
const { connectRedis, disconnectRedis } = require("./config/redis");
const {
  startFindnovelScheduler,
  stopFindnovelScheduler
} = require("./modules/findnovel/findnovel.scheduler");

async function bootstrap() {
  await connectMongoDB(env.mongodbUri);
  await connectRedis(env.redisUrl);
  startFindnovelScheduler();

  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv },
      "Service started successfully."
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "Graceful shutdown started.");

    server.close(async (error) => {
      if (error) {
        logger.error({ error }, "Error while closing HTTP server.");
      }

      stopFindnovelScheduler();
      await disconnectRedis();
      await disconnectMongoDB();

      process.exit(error ? 1 : 0);
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "Failed to start service.");
  process.exit(1);
});
