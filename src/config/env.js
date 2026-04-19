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
  crawlerGatewayUrl:
    process.env.CRAWLER_GATEWAY_URL || "https://puppeteer.novelbin.me/axiosGet",
  findnovelBaseUrl: process.env.FINDNOVEL_BASE_URL || "https://findnovel.net",
  crawlConcurrencyNovel: parsePositiveInt(
    process.env.CRAWL_CONCURRENCY_NOVEL,
    3
  ),
  crawlConcurrencyChapter: parsePositiveInt(
    process.env.CRAWL_CONCURRENCY_CHAPTER,
    8
  ),
  crawlConcurrencyCheck: parsePositiveInt(
    process.env.CRAWL_CONCURRENCY_CHECK,
    20
  ),
  queueSchedulerMaxRetries: parseNonNegativeInt(
    process.env.QUEUE_SCHEDULER_MAX_RETRIES,
    1
  ),
  queueSchedulerRetryDelayMs: parsePositiveInt(
    process.env.QUEUE_SCHEDULER_RETRY_DELAY_MS,
    2000
  ),
  schedulerEnabled: parseBoolean(process.env.SCHEDULER_ENABLED, true),
  schedulerRunOnStartup: parseBoolean(
    process.env.SCHEDULER_RUN_ON_STARTUP,
    false
  ),
  schedulerLatestReleaseCron:
    process.env.SCHEDULER_LATEST_RELEASE_CRON || "*/10 * * * *",
  schedulerMainCron: process.env.SCHEDULER_MAIN_CRON || "*/30 * * * *",
  schedulerDailyMaintenanceCron:
    process.env.SCHEDULER_DAILY_MAINTENANCE_CRON || "0 0 * * *",
  schedulerRunFixChapterOnMainSync: parseBoolean(
    process.env.SCHEDULER_RUN_FIX_CHAPTER_ON_MAIN_SYNC,
    false
  ),
  schedulerFixChapterEnabled: parseBoolean(
    process.env.SCHEDULER_FIX_CHAPTER_ENABLED,
    false
  ),
  schedulerFixChapterCron:
    process.env.SCHEDULER_FIX_CHAPTER_CRON || "*/60 * * * *",
  schedulerLatestReleaseStart: parsePositiveInt(
    process.env.SCHEDULER_LATEST_RELEASE_START,
    1
  ),
  schedulerLatestReleaseEnd: parsePositiveInt(
    process.env.SCHEDULER_LATEST_RELEASE_END,
    20
  ),
  schedulerDiscoverNewStart: parsePositiveInt(
    process.env.SCHEDULER_DISCOVER_NEW_START,
    1
  ),
  schedulerDiscoverNewEnd: parsePositiveInt(
    process.env.SCHEDULER_DISCOVER_NEW_END,
    15
  ),
  schedulerSyncExistingLimit: parsePositiveInt(
    process.env.SCHEDULER_SYNC_EXISTING_LIMIT,
    1200
  ),
  fixChapterWindowMinutes: parsePositiveInt(
    process.env.FIX_CHAPTER_WINDOW_MINUTES,
    30
  ),
  fixChapterLimit: parsePositiveInt(process.env.FIX_CHAPTER_LIMIT, 200),
  schedulerDiscoverCrawlChapters: parseBoolean(
    process.env.SCHEDULER_DISCOVER_CRAWL_CHAPTERS,
    true
  ),
  telegramEnabled: parseBoolean(process.env.TELEGRAM_ENABLED, false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || ""
};

module.exports = { env };
