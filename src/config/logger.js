const pino = require("pino");

const { env } = require("./env");

const logger = pino({
  level: env.logLevel
});

module.exports = logger;
