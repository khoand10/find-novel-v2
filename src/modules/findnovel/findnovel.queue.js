const slugModule = require("slug");
const slug = slugModule.default || slugModule;

const { env } = require("../../config/env");
const { findnovelConfig } = require("../../config/findnovel");
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
  concurrency: findnovelConfig.crawl.concurrencyNovel,
  logger,
  onFailure: async (job, error) =>
    notifyQueueFailure("findnovel.novel", job, error),
  processor: async (payload) =>
    findnovelService.crawlNovelByUrl(payload.novelUrl, {
      rejectIfExists: payload.rejectIfExists,
      crawlChapters: payload.crawlChapters,
      urlStart: payload.urlStart,
      maxChapters: payload.maxChapters
    })
});

const chapterQueue = new InternalQueue({
  name: "findnovel.chapter",
  concurrency: findnovelConfig.crawl.concurrencyChapter,
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

    if (payload.jobType === "suspected-audit") {
      return maintenanceService.auditSuspectedChapters({
        topLimit: payload.topLimit,
        minDelta: payload.minDelta,
        minRatio: payload.minRatio,
        concurrency: payload.concurrency
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
  const start = payload.start || findnovelConfig.scheduler.latestReleaseStart;
  const end = payload.end || findnovelConfig.scheduler.latestReleaseEnd;

  return schedulerQueue.enqueue(
    {
      jobType: "latest-release",
      start,
      end,
      concurrency: payload.concurrency || findnovelConfig.crawl.concurrencyCheck
    },
    { key: `scheduler:latest-release:${start}:${end}` }
  );
}

function enqueueSyncExisting(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "sync-existing",
      novelIds: payload.novelIds || [],
      limit: payload.limit || findnovelConfig.scheduler.syncExistingLimit,
      concurrency: payload.concurrency || findnovelConfig.crawl.concurrencyChapter
    },
    { key: "scheduler:sync-existing" }
  );
}

function enqueueDiscoverNew(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "discover-new",
      start: payload.start || findnovelConfig.scheduler.discoverNewStart,
      end: payload.end || findnovelConfig.scheduler.discoverNewEnd,
      crawlChapters:
        payload.crawlChapters === undefined
          ? findnovelConfig.scheduler.discoverCrawlChapters
          : payload.crawlChapters,
      concurrency: payload.concurrency || findnovelConfig.crawl.concurrencyNovel
    },
    { key: "scheduler:discover-new" }
  );
}

function enqueueMainSync(payload = {}) {
  return schedulerQueue.enqueue(
    {
      jobType: "main-sync",
      novelIds: payload.novelIds || [],
      limit: payload.limit || findnovelConfig.scheduler.syncExistingLimit,
      syncExistingConcurrency:
        payload.syncExistingConcurrency ||
        findnovelConfig.crawl.concurrencyChapter,
      discoverStart:
        payload.discoverStart || findnovelConfig.scheduler.discoverNewStart,
      discoverEnd:
        payload.discoverEnd || findnovelConfig.scheduler.discoverNewEnd,
      discoverCrawlChapters:
        payload.discoverCrawlChapters === undefined
          ? findnovelConfig.scheduler.discoverCrawlChapters
          : payload.discoverCrawlChapters,
      discoverConcurrency:
        payload.discoverConcurrency || findnovelConfig.crawl.concurrencyNovel,
      runFixChapter:
        payload.runFixChapter === undefined
          ? findnovelConfig.scheduler.runFixChapterOnMainSync
          : payload.runFixChapter,
      fixChapterWindowMinutes:
        payload.fixChapterWindowMinutes ||
        findnovelConfig.scheduler.fixChapterWindowMinutes,
      fixChapterLimit:
        payload.fixChapterLimit || findnovelConfig.scheduler.fixChapterLimit
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
      windowMinutes:
        payload.windowMinutes || findnovelConfig.scheduler.fixChapterWindowMinutes,
      limit: payload.limit || findnovelConfig.scheduler.fixChapterLimit
    },
    { key: "scheduler:fix-chapter" }
  );
}

function enqueueSuspectedAudit(payload = {}) {
  if (!findnovelConfig.suspectedAudit.enabled) {
    return {
      accepted: false,
      reason: "suspected_audit_disabled"
    };
  }

  return schedulerQueue.enqueue(
    {
      jobType: "suspected-audit",
      topLimit: payload.topLimit || findnovelConfig.suspectedAudit.topLimit,
      minDelta: payload.minDelta || findnovelConfig.suspectedAudit.minDelta,
      minRatio: payload.minRatio || findnovelConfig.suspectedAudit.minRatio,
      concurrency: payload.concurrency || findnovelConfig.suspectedAudit.concurrency
    },
    { key: "scheduler:suspected-audit" }
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
  enqueueSuspectedAudit,
  enqueueSyncExisting,
  getQueueStats
};
