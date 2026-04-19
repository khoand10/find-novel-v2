const slug = require("slug");

const { env } = require("../../config/env");
const logger = require("../../config/logger");
const InternalQueue = require("../queue/internal-queue");
const findnovelService = require("./findnovel.service");
const maintenanceService = require("./findnovel.maintenance");
const { sendTelegramMessage } = require("../notify/telegram");

async function notifyQueueFailure(queueName, job, error) {
  await sendTelegramMessage(
    [
      `[Queue Failed] ${queueName}`,
      `Job: ${job.id}`,
      `Key: ${job.key || "-"}`,
      `Error: ${error instanceof Error ? error.message : String(error)}`
    ].join("\n")
  );
}

const novelQueue = new InternalQueue({
  name: "findnovel.novel",
  concurrency: env.crawlConcurrencyNovel,
  logger,
  onFailure: async (job, error) =>
    notifyQueueFailure("findnovel.novel", job, error),
  processor: async (payload) =>
    findnovelService.crawlNovelByUrl(payload.novelUrl, {
      crawlChapters: payload.crawlChapters,
      urlStart: payload.urlStart,
      maxChapters: payload.maxChapters
    })
});

const chapterQueue = new InternalQueue({
  name: "findnovel.chapter",
  concurrency: env.crawlConcurrencyChapter,
  logger,
  onSuccess: async (_job, result) => {
    if (result && result.created > 0) {
      await sendTelegramMessage(
        `[Chapter Added] ${result.novel_name || result.novel_id}: +${result.created}`
      );
    }
  },
  onFailure: async (job, error) =>
    notifyQueueFailure("findnovel.chapter", job, error),
  processor: async (payload) =>
    findnovelService.crawlNovelChaptersById(payload.novelId, {
      urlStart: payload.urlStart,
      maxChapters: payload.maxChapters
    })
});

const schedulerQueue = new InternalQueue({
  name: "findnovel.scheduler",
  concurrency: 1,
  maxRetries: env.queueSchedulerMaxRetries,
  retryDelayMs: env.queueSchedulerRetryDelayMs,
  logger,
  onFailure: async (job, error) =>
    notifyQueueFailure("findnovel.scheduler", job, error),
  processor: async (payload) => {
    if (payload.jobType === "latest-release") {
      return findnovelService.syncLatestRelease({
        start: payload.start,
        end: payload.end,
        concurrency: payload.concurrency
      });
    }

    if (payload.jobType === "sync-existing") {
      return findnovelService.syncExistingNovels({
        novelIds: payload.novelIds || [],
        limit: payload.limit,
        concurrency: payload.concurrency
      });
    }

    if (payload.jobType === "discover-new") {
      return findnovelService.discoverNewNovels({
        start: payload.start,
        end: payload.end,
        crawlChapters: payload.crawlChapters,
        concurrency: payload.concurrency
      });
    }

    if (payload.jobType === "main-sync") {
      const syncExisting = await findnovelService.syncExistingNovels({
        novelIds: payload.novelIds || [],
        limit: payload.limit,
        concurrency: payload.syncExistingConcurrency
      });

      const discoverNew = await findnovelService.discoverNewNovels({
        start: payload.discoverStart,
        end: payload.discoverEnd,
        crawlChapters: payload.discoverCrawlChapters,
        concurrency: payload.discoverConcurrency
      });

      let fixChapter = null;
      if (payload.runFixChapter) {
        fixChapter = await maintenanceService.fixRecentChapters({
          windowMinutes: payload.fixChapterWindowMinutes,
          limit: payload.fixChapterLimit
        });
      }

      return {
        syncExisting,
        discoverNew,
        fixChapter
      };
    }

    if (payload.jobType === "maintenance-daily") {
      const updateViews = await maintenanceService.updateNovelViews();
      const updateHotNew = await maintenanceService.updateHotNew();
      return {
        updateViews,
        updateHotNew
      };
    }

    if (payload.jobType === "fix-chapter") {
      return maintenanceService.fixRecentChapters({
        windowMinutes: payload.windowMinutes,
        limit: payload.limit
      });
    }

    throw new Error(`Unsupported scheduler jobType: ${payload.jobType}`);
  }
});

function enqueueNovelByUrl(payload) {
  const dedupeKey = `novel:${slug(String(payload.novelUrl || ""))}`;
  return novelQueue.enqueue(payload, { key: dedupeKey });
}

function enqueueChaptersByNovelId(payload) {
  const dedupeKey = `chapter:${slug(String(payload.novelId || ""))}`;
  return chapterQueue.enqueue(payload, { key: dedupeKey });
}

function enqueueLatestRelease(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "latest-release",
      start: payload.start || env.schedulerLatestReleaseStart,
      end: payload.end || env.schedulerLatestReleaseEnd,
      concurrency: payload.concurrency || env.crawlConcurrencyCheck
    },
    { key: "scheduler:latest-release" }
  );
}

function enqueueSyncExisting(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "sync-existing",
      novelIds: payload.novelIds || [],
      limit: payload.limit || env.schedulerSyncExistingLimit,
      concurrency: payload.concurrency || env.crawlConcurrencyChapter
    },
    { key: "scheduler:sync-existing" }
  );
}

function enqueueDiscoverNew(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "discover-new",
      start: payload.start || env.schedulerDiscoverNewStart,
      end: payload.end || env.schedulerDiscoverNewEnd,
      crawlChapters:
        payload.crawlChapters === undefined
          ? env.schedulerDiscoverCrawlChapters
          : payload.crawlChapters,
      concurrency: payload.concurrency || env.crawlConcurrencyNovel
    },
    { key: "scheduler:discover-new" }
  );
}

function enqueueMainSync(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "main-sync",
      novelIds: payload.novelIds || [],
      limit: payload.limit || env.schedulerSyncExistingLimit,
      syncExistingConcurrency:
        payload.syncExistingConcurrency || env.crawlConcurrencyChapter,
      discoverStart: payload.discoverStart || env.schedulerDiscoverNewStart,
      discoverEnd: payload.discoverEnd || env.schedulerDiscoverNewEnd,
      discoverCrawlChapters:
        payload.discoverCrawlChapters === undefined
          ? env.schedulerDiscoverCrawlChapters
          : payload.discoverCrawlChapters,
      discoverConcurrency:
        payload.discoverConcurrency || env.crawlConcurrencyNovel,
      runFixChapter:
        payload.runFixChapter === undefined
          ? env.schedulerRunFixChapterOnMainSync
          : payload.runFixChapter,
      fixChapterWindowMinutes:
        payload.fixChapterWindowMinutes || env.fixChapterWindowMinutes,
      fixChapterLimit: payload.fixChapterLimit || env.fixChapterLimit
    },
    { key: "scheduler:main-sync" }
  );
}

function enqueueDailyMaintenance(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "maintenance-daily",
      reason: payload.reason || "scheduled"
    },
    { key: "scheduler:maintenance-daily" }
  );
}

function enqueueFixChapter(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "fix-chapter",
      windowMinutes: payload.windowMinutes || env.fixChapterWindowMinutes,
      limit: payload.limit || env.fixChapterLimit
    },
    { key: "scheduler:fix-chapter" }
  );
}

function getQueueStats() {
  return {
    novelQueue: novelQueue.getStats(),
    chapterQueue: chapterQueue.getStats(),
    schedulerQueue: schedulerQueue.getStats()
  };
}

module.exports = {
  enqueueChaptersByNovelId,
  enqueueDailyMaintenance,
  enqueueDiscoverNew,
  enqueueFixChapter,
  enqueueLatestRelease,
  enqueueMainSync,
  enqueueNovelByUrl,
  enqueueSyncExisting,
  getQueueStats
};
