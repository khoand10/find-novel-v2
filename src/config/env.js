const dotenv = require("dotenv");

dotenv.config();

const requiredEnvVars = ["MONGODB_URI", "REDIS_URL"];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const portValue = Number(process.env.PORT || "3000");
if (Number.isNaN(portValue) || portValue <= 0) {
  throw new Error("PORT must be a valid positive number.");
}

function parsePositiveInt(value, fallbackValue) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsed);
}

function parseNonNegativeInt(value, fallbackValue) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallbackValue;
  }

  return Math.floor(parsed);
}

function parseBoolean(value, fallbackValue) {
  if (value === undefined || value === null || value === "") {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: portValue,
  logLevel: process.env.LOG_LEVEL || "info",
  mongodbUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL,
  queueSchedulerMaxRetries: parseNonNegativeInt(
    process.env.QUEUE_SCHEDULER_MAX_RETRIES,
    1
  ),
  queueSchedulerRetryDelayMs: parsePositiveInt(
    process.env.QUEUE_SCHEDULER_RETRY_DELAY_MS,
    2000
  ),
  schedulerEnabled: parseBoolean(process.env.SCHEDULER_ENABLED, true),
  gsheetWebAppUrl: (process.env.GSHEET_WEB_APP_URL || "").trim(),
  telegramEnabled: parseBoolean(process.env.TELEGRAM_ENABLED, false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || ""
};

module.exports = { env };
