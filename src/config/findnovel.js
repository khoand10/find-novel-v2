const findnovelConfig = {
  baseUrl: "https://findnovel.net",
  crawler: {
    gatewayUrl: "https://puppeteer.novelbin.me/axiosGet",
    httpMaxRetries: 4,
    httpRetryDelayMs: 3000,
    httpRetryJitterMs: 500
  },
  crawl: {
    concurrencyNovel: 3,
    concurrencyChapter: 8,
    concurrencyCheck: 20
  },
  scheduler: {
    runOnStartup: true,
    latestReleaseCron: "*/10 * * * *",
    mainCron: "*/30 * * * *",
    dailyMaintenanceCron: "0 0 * * *",
    runFixChapterOnMainSync: false,
    fixChapterEnabled: false,
    fixChapterCron: "*/60 * * * *",
    latestReleaseStart: 1,
    latestReleaseEnd: 20,
    discoverNewStart: 1,
    discoverNewEnd: 15,
    syncExistingLimit: 1200,
    discoverCrawlChapters: true,
    fixChapterWindowMinutes: 30,
    fixChapterLimit: 200
  },
  gsheet: {
    enabled: true,
    successFileName: "findnovel-success",
    suspectFileName: "findnovel-suspected",
    webhookTimeoutMs: 8000,
    inlineRetryCount: 1
  },
  suspectedAudit: {
    enabled: true,
    cron: "0 0 * * *",
    runOnStartup: true,
    topLimit: 100,
    minDelta: 200,
    minRatio: 1.15,
    concurrency: 5
  }
};

module.exports = {
  findnovelConfig
};
